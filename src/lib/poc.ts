import { neon } from "@neondatabase/serverless";
import type { AuthClaims, UserRole } from "./auth";
import type { Env } from "../bindings";
import { generateMatchScore } from "../services/match-scoring";

export type UserRecord = {
    id: string;
    role: UserRole;
    username: string;
    firstName: string | null;
    lastName: string | null;
    legalName: string | null;
    companyId: string | null;
    cvUrl: string | null;
    matchScore: number | null;
    profile: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type JobRecord = {
    id: string;
    companyId: string;
    title: string;
    description: string;
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type ApplicationRecord = {
    id: string;
    userId: string;
    jobId: string;
    accepted: boolean | null;
    matchScore: number | null;
    createdAt: string;
    updatedAt: string;
};

export type ApplicationView = ApplicationRecord & {
    jobTitle: string;
    otherEntityName: string;
    jobCompanyId: string;
    applicantName?: string | null;
    applicantSirName?: string | null;
    companyLegalName?: string | null;
};

export type JobInput = {
    title: string;
    description: string;
    payload: Record<string, unknown>;
};

export type AuthUserInput = {
    id: string;
    role: UserRole;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    companyId?: string | null;
    profile?: Record<string, unknown>;
};

type MatchEvent = {
    applicationId: string;
    userId: string;
    jobId: string;
};

type MatchScoringPayload = MatchEvent;

export type JobPortalStore = {
    upsertUser(input: AuthUserInput): Promise<UserRecord>;
    getUser(id: string): Promise<UserRecord | null>;
    getJob(id: string): Promise<JobRecord | null>;
    createJob(companyId: string, input: JobInput): Promise<JobRecord>;
    listJobs(companyId?: string): Promise<(JobRecord & { companyLegalName: string | null })[]>;
    createApplication(input: { userId: string; jobId: string }): Promise<ApplicationRecord>;
    getApplication(id: string): Promise<ApplicationRecord | null>;
    listApplicationsByApplicant(userId: string): Promise<ApplicationView[]>;
    listApplicationsByCompany(companyId: string): Promise<ApplicationView[]>;
    updateApplicationDecision(input: {
        applicationId: string;
        companyId: string;
        accepted: boolean;
    }): Promise<ApplicationRecord | null>;
    updateCvUrl(input: { userId: string; cvUrl: string }): Promise<UserRecord | null>;
    recordMatchScore(input: {
        applicationId: string;
        userId: string;
        jobId: string;
        matchScore: number;
    }): Promise<ApplicationRecord | null>;
    processQueuedMatch(event: MatchScoringPayload): Promise<ApplicationRecord | null>;
    queueMatch(event: MatchEvent): Promise<void>;
    dequeueMatch(): Promise<MatchEvent | undefined>;
    reset(): void;
};

type InMemoryState = {
    users: Map<string, UserRecord>;
    jobs: Map<string, JobRecord>;
    applications: Map<string, ApplicationRecord>;
    queue: MatchEvent[];
};

declare global {
    // eslint-disable-next-line no-var
    var __jobPortalMemoryState: InMemoryState | undefined;
}

function now() {
    return new Date().toISOString();
}

function toNumber(value: unknown) {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        return Number(value);
    }

    return null;
}

function toJson(input: unknown) {
    return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

function rowToUser(row: Record<string, unknown>): UserRecord {
    return {
        id: String(row.id),
        role: String(row.role) as UserRole,
        username: String(row.username),
        firstName: (row.first_name as string | null) ?? null,
        lastName: (row.last_name as string | null) ?? null,
        legalName: (row.legal_name as string | null) ?? null,
        companyId: (row.company_id as string | null) ?? null,
        cvUrl: (row.cv_url as string | null) ?? null,
        matchScore: toNumber(row.match_score),
        profile: toJson(row.profile),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function rowToJob(row: Record<string, unknown>): JobRecord {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        title: String(row.title),
        description: String(row.description),
        payload: toJson(row.payload),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function rowToApplication(row: Record<string, unknown>): ApplicationRecord {
    return {
        id: String(row.id),
        userId: String(row.user_id),
        jobId: String(row.job_id),
        accepted: row.accepted === null ? null : Boolean(row.accepted),
        matchScore: toNumber(row.match_score),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function rowToApplicationView(row: Record<string, unknown>): ApplicationView {
    return {
        ...rowToApplication(row),
        jobTitle: String(row.job_title),
        otherEntityName: String(row.other_entity_name),
        jobCompanyId: String(row.job_company_id),
        applicantName:
            typeof row.applicant_name === "string" ? row.applicant_name : null,
        applicantSirName:
            typeof row.applicant_sir_name === "string" ? row.applicant_sir_name : null,
        companyLegalName:
            typeof row.company_legal_name === "string" ? row.company_legal_name : null,
    };
}

function createMemoryStore(): JobPortalStore {
    const state =
        globalThis.__jobPortalMemoryState ??= {
            users: new Map(),
            jobs: new Map(),
            applications: new Map(),
            queue: [] as MatchEvent[],
        };

    async function listJobs(companyId?: string) {
        const jobs = [...state.jobs.values()].filter((job) =>
            companyId ? job.companyId === companyId : true,
        );

        return jobs
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map((job) => ({ ...job, companyLegalName: state.users.get(job.companyId)?.legalName ?? null }));
    }

    async function listApplications(
        scope: "applicant" | "company",
        predicate: (application: ApplicationRecord) => boolean,
    ) {
        return [...state.applications.values()]
            .filter(predicate)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map((application) => {
                const job = state.jobs.get(application.jobId);
                const user = state.users.get(application.userId);
                const company = job ? state.users.get(job.companyId) : undefined;
                return {
                    ...application,
                    jobTitle: job?.title ?? "",
                    jobCompanyId: job?.companyId ?? "",
                    otherEntityName:
                        scope === "applicant"
                            ? company?.legalName ?? ""
                            : `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
                    applicantName: user?.firstName ?? null,
                    applicantSirName: user?.lastName ?? null,
                    companyLegalName: company?.legalName ?? null,
                };
            });
    }

    return {
        async upsertUser(input) {
            const existing = state.users.get(input.id);
            const record: UserRecord = {
                id: input.id,
                role: input.role,
                username: input.username,
                firstName: input.firstName ?? null,
                lastName: input.lastName ?? null,
                legalName: input.legalName ?? null,
                companyId: input.companyId ?? null,
                cvUrl: existing?.cvUrl ?? null,
                matchScore: existing?.matchScore ?? null,
                profile: input.profile ?? {},
                createdAt: existing?.createdAt ?? now(),
                updatedAt: now(),
            };
            state.users.set(input.id, record);
            return record;
        },
        async getUser(id) {
            return state.users.get(id) ?? null;
        },
        async getJob(id) {
            return state.jobs.get(id) ?? null;
        },
        async createJob(companyId, input) {
            const record: JobRecord = {
                id: crypto.randomUUID(),
                companyId,
                title: input.title,
                description: input.description,
                payload: input.payload,
                createdAt: now(),
                updatedAt: now(),
            };
            state.jobs.set(record.id, record);
            return record;
        },
        async listJobs(companyId) {
            return listJobs(companyId);
        },
        async createApplication(input) {
            const duplicate = [...state.applications.values()].find(
                (application) => application.userId === input.userId && application.jobId === input.jobId,
            );
            if (duplicate) {
                return duplicate;
            }

            const record: ApplicationRecord = {
                id: crypto.randomUUID(),
                userId: input.userId,
                jobId: input.jobId,
                accepted: null,
                matchScore: null,
                createdAt: now(),
                updatedAt: now(),
            };
            state.applications.set(record.id, record);
            return record;
        },
        async getApplication(id) {
            return state.applications.get(id) ?? null;
        },
        async listApplicationsByApplicant(userId) {
            return listApplications("applicant", (application) => application.userId === userId);
        },
        async listApplicationsByCompany(companyId) {
            return listApplications("company", (application) => {
                const job = state.jobs.get(application.jobId);
                return job?.companyId === companyId;
            });
        },
        async updateApplicationDecision({ applicationId, companyId, accepted }) {
            const application = state.applications.get(applicationId);
            if (!application) {
                return null;
            }

            const job = state.jobs.get(application.jobId);
            if (!job || job.companyId !== companyId) {
                return null;
            }

            const updated: ApplicationRecord = {
                ...application,
                accepted,
                updatedAt: now(),
            };
            state.applications.set(applicationId, updated);
            return updated;
        },
        async updateCvUrl({ userId, cvUrl }) {
            const user = state.users.get(userId);
            if (!user) {
                return null;
            }

            const updated: UserRecord = { ...user, cvUrl, updatedAt: now() };
            state.users.set(userId, updated);
            return updated;
        },
        async recordMatchScore({ applicationId, userId, jobId, matchScore }) {
            const application = state.applications.get(applicationId);
            const user = state.users.get(userId);
            if (!application || !user || application.jobId !== jobId) {
                return null;
            }

            const updatedApplication: ApplicationRecord = {
                ...application,
                matchScore,
                updatedAt: now(),
            };
            state.applications.set(applicationId, updatedApplication);
            state.users.set(userId, { ...user, matchScore, updatedAt: now() });
            return updatedApplication;
        },
        async processQueuedMatch(event) {
            const user = state.users.get(event.userId);
            const job = state.jobs.get(event.jobId);
            if (!user || !job) {
                return null;
            }

            const score = generateMatchScore({ user, job });
            return this.recordMatchScore({
                applicationId: event.applicationId,
                userId: event.userId,
                jobId: event.jobId,
                matchScore: score,
            });
        },
        async queueMatch(event) {
            state.queue.push(event);
        },
        async dequeueMatch() {
            return state.queue.shift();
        },
        reset() {
            state.users.clear();
            state.jobs.clear();
            state.applications.clear();
            state.queue.length = 0;
        },
    };
}

function createNeonStore(databaseUrl: string): JobPortalStore {
    const sql = neon(databaseUrl);

    async function listJobs(companyId?: string) {
        const rows = companyId
            ? await sql`
          select
            j.id,
            j.company_id,
            j.title,
            j.description,
            j.payload,
            j.created_at,
            j.updated_at,
            u.legal_name as company_legal_name
          from jobs j
          left join users u on u.id = j.company_id
          where j.company_id = ${companyId}
          order by j.created_at desc
        `
            : await sql`
          select
            j.id,
            j.company_id,
            j.title,
            j.description,
            j.payload,
            j.created_at,
            j.updated_at,
            u.legal_name as company_legal_name
          from jobs j
          left join users u on u.id = j.company_id
          order by j.created_at desc
        `;

        return rows.map((row) => ({
            ...rowToJob(row as Record<string, unknown>),
            companyLegalName: (row as Record<string, unknown>).company_legal_name as string | null,
        }));
    }

    async function listApplications(scope: "applicant" | "company", id: string) {
        const rows =
            scope === "applicant"
                ? await sql`
              select
                a.id,
                a.user_id,
                a.job_id,
                a.accepted,
                a.match_score,
                a.created_at,
                a.updated_at,
                j.title as job_title,
                j.company_id as job_company_id,
                coalesce(c.legal_name, '') as other_entity_name,
                u.first_name as applicant_name,
                u.last_name as applicant_sir_name,
                c.legal_name as company_legal_name
              from applications a
              inner join jobs j on j.id = a.job_id
              inner join users u on u.id = a.user_id
              left join users c on c.id = j.company_id
              where a.user_id = ${id}
              order by a.created_at desc
            `
                : await sql`
              select
                a.id,
                a.user_id,
                a.job_id,
                a.accepted,
                a.match_score,
                a.created_at,
                a.updated_at,
                j.title as job_title,
                j.company_id as job_company_id,
                concat_ws(' ', u.first_name, u.last_name) as other_entity_name,
                u.first_name as applicant_name,
                u.last_name as applicant_sir_name,
                c.legal_name as company_legal_name
              from applications a
              inner join jobs j on j.id = a.job_id
              inner join users u on u.id = a.user_id
              left join users c on c.id = j.company_id
              where j.company_id = ${id}
              order by a.created_at desc
            `;

        return rows.map((row) => rowToApplicationView(row as Record<string, unknown>));
    }

    return {
        async upsertUser(input) {
            const rows = await sql`
            insert into users (
              id,
              role,
              username,
              first_name,
              last_name,
              legal_name,
              company_id,
              cv_url,
              match_score,
              profile,
              updated_at
            ) values (
              ${input.id},
              ${input.role},
              ${input.username},
              ${input.firstName ?? null},
              ${input.lastName ?? null},
              ${input.legalName ?? null},
              ${input.companyId ?? null},
              ${null},
              ${null},
              ${JSON.stringify(input.profile ?? {})}::jsonb,
              now()
            ) on conflict (id) do update set
              role = excluded.role,
              username = excluded.username,
              first_name = excluded.first_name,
              last_name = excluded.last_name,
              legal_name = excluded.legal_name,
              company_id = excluded.company_id,
              profile = excluded.profile,
              updated_at = now()
            returning *
          `;

            return rowToUser(rows[0] as Record<string, unknown>);
        },
        async getUser(id) {
            const rows = await sql`select * from users where id = ${id} limit 1`;
            return rows[0] ? rowToUser(rows[0] as Record<string, unknown>) : null;
        },
        async getJob(id) {
            const rows = await sql`select * from jobs where id = ${id} limit 1`;
            return rows[0] ? rowToJob(rows[0] as Record<string, unknown>) : null;
        },
        async createJob(companyId, input) {
            const rows = await sql`
            insert into jobs (company_id, title, description, payload)
            values (
              ${companyId},
              ${input.title},
              ${input.description},
              ${JSON.stringify(input.payload ?? {})}::jsonb
            )
            returning *
          `;

            return rowToJob(rows[0] as Record<string, unknown>);
        },
        async listJobs(companyId) {
            return listJobs(companyId);
        },
        async createApplication(input) {
            const rows = await sql`
            insert into applications (user_id, job_id, accepted, match_score)
            values (${input.userId}, ${input.jobId}, ${null}, ${null})
            on conflict (user_id, job_id) do update set updated_at = now()
            returning *
          `;

            return rowToApplication(rows[0] as Record<string, unknown>);
        },
        async getApplication(id) {
            const rows = await sql`select * from applications where id = ${id} limit 1`;
            return rows[0] ? rowToApplication(rows[0] as Record<string, unknown>) : null;
        },
        async listApplicationsByApplicant(userId) {
            return listApplications("applicant", userId);
        },
        async listApplicationsByCompany(companyId) {
            return listApplications("company", companyId);
        },
        async updateApplicationDecision({ applicationId, companyId, accepted }) {
            const rows = await sql`
            update applications a
            set accepted = ${accepted}, updated_at = now()
            from jobs j
            where a.id = ${applicationId}
              and a.job_id = j.id
              and j.company_id = ${companyId}
            returning a.*
          `;

            return rows[0] ? rowToApplication(rows[0] as Record<string, unknown>) : null;
        },
        async updateCvUrl({ userId, cvUrl }) {
            const rows = await sql`
            update users
            set cv_url = ${cvUrl}, updated_at = now()
            where id = ${userId}
            returning *
          `;

            return rows[0] ? rowToUser(rows[0] as Record<string, unknown>) : null;
        },
        async recordMatchScore({ applicationId, userId, jobId, matchScore }) {
            const appRows = await sql`
            update applications
            set match_score = ${matchScore}, updated_at = now()
            where id = ${applicationId} and user_id = ${userId} and job_id = ${jobId}
            returning *
          `;
            await sql`
            update users
            set match_score = ${matchScore}, updated_at = now()
            where id = ${userId}
          `;

            return appRows[0] ? rowToApplication(appRows[0] as Record<string, unknown>) : null;
        },
        async processQueuedMatch({ applicationId, userId, jobId }) {
            const [user, job] = await Promise.all([this.getUser(userId), this.getJob(jobId)]);
            if (!user || !job) {
                return null;
            }

            const score = generateMatchScore({ user, job });
            return this.recordMatchScore({ applicationId, userId, jobId, matchScore: score });
        },
        async queueMatch(event) {
            await sql`
            insert into match_events (application_id, user_id, job_id, status, created_at)
            values (${event.applicationId}, ${event.userId}, ${event.jobId}, 'pending', now())
          `;
        },
        async dequeueMatch() {
            const rows = await sql`
            delete from match_events
            where id = (
              select id from match_events where status = 'pending' order by created_at asc limit 1
            )
            returning application_id, user_id, job_id
          `;

            const row = rows[0] as Record<string, unknown> | undefined;
            if (!row) {
                return undefined;
            }

            return {
                applicationId: String(row.application_id),
                userId: String(row.user_id),
                jobId: String(row.job_id),
            };
        },
        reset() {
            throw new Error("reset is only available for the memory store");
        },
    };
}

export function createJobPortalStore(env: Env): JobPortalStore {
    if (env.TEST_MODE === "1" || env.TEST_MODE === "true") {
        return createMemoryStore();
    }

    if (env.NEON_DATABASE_URL) {
        return createNeonStore(env.NEON_DATABASE_URL);
    }

    return createMemoryStore();
}

export function resetMemoryJobPortalStore() {
    globalThis.__jobPortalMemoryState = {
        users: new Map(),
        jobs: new Map(),
        applications: new Map(),
        queue: [],
    };
}

export async function syncAuthUser(store: JobPortalStore, claims: AuthClaims) {
    if (!claims.sub) {
        throw new Error("missing subject");
    }

    return store.upsertUser({
        id: claims.sub,
        role: claims.role,
        username: claims.username ?? claims.email ?? claims.sub,
        firstName: claims.firstName ?? null,
        lastName: claims.lastName ?? null,
        legalName: claims.legalName ?? null,
        companyId: claims.companyId ?? null,
        profile: claims.raw,
    });
}

export async function submitMatchJob(store: JobPortalStore, input: MatchScoringPayload) {
    if (typeof store.queueMatch === "function") {
        await store.queueMatch(input);
        return { queued: true };
    }

    await store.processQueuedMatch(input);
    return { queued: false };
}

export async function processQueuedMatchJob(store: JobPortalStore, event: MatchScoringPayload) {
    return store.processQueuedMatch(event);
}
