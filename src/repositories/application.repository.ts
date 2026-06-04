import { neon } from "@neondatabase/serverless";
import type { ApplicationRecord, ApplicationView } from "../lib/types";
import { decodeCursor, encodeCursor } from "../lib/cursor";

function toNumber(value: unknown) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim().length > 0) return Number(value);
    return null;
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
        applicantName: typeof row.applicant_name === "string" ? row.applicant_name : null,
        applicantSirName: typeof row.applicant_sir_name === "string" ? row.applicant_sir_name : null,
        companyLegalName: typeof row.company_legal_name === "string" ? row.company_legal_name : null,
    };
}

export class ApplicationRepository {
    constructor(private sql: ReturnType<typeof neon>) { }

    async createApplication(userId: string, jobId: string): Promise<ApplicationRecord> {
        const rows = await this.sql`
            insert into applications (user_id, job_id, accepted, match_score)
            values (${userId}, ${jobId}, null, null)
            on conflict (user_id, job_id) do update set updated_at = now()
            returning *
        `;
        const res = rows as unknown as Record<string, unknown>[];
        return rowToApplication(res[0]);
    }

    async getApplication(id: string): Promise<ApplicationRecord | null> {
        const rows = await this.sql`select * from applications where id = ${id} limit 1`;
        const res = rows as unknown as Record<string, unknown>[];
        return res[0] ? rowToApplication(res[0]) : null;
    }

    async getApplicationWithOwner(id: string): Promise<(ApplicationRecord & { jobCompanyId: string }) | null> {
        const rows = await this.sql`
            select a.*, j.company_id as job_company_id
            from applications a
            inner join jobs j on j.id = a.job_id
            where a.id = ${id}
            limit 1
        `;
        const res = rows as unknown as Record<string, unknown>[];
        if (!res[0]) return null;
        const row = res[0];
        return {
            ...rowToApplication(row),
            jobCompanyId: String(row.job_company_id),
        };
    }

    async listByApplicant(
        userId: string,
        cursor?: string,
        limit: number = 20
    ): Promise<{ items: ApplicationView[]; nextCursor: string | null }> {
        const fetchLimit = limit + 1;
        const params: unknown[] = [userId];
        const clauses: string[] = [`a.user_id = $1`];
        let idx = 2;

        if (cursor) {
            const { id } = decodeCursor(cursor);
            clauses.push(`(a.created_at, a.id) < (select created_at, id from applications where id = $${idx})`);
            params.push(id);
            idx += 1;
        }

        params.push(fetchLimit);
        const where = clauses.join(" and ");

        const rows = await this.sql(
            `select a.*, j.title as job_title, j.company_id as job_company_id,
                coalesce(c.legal_name, '') as other_entity_name,
                u.first_name as applicant_name, u.last_name as applicant_sir_name,
                c.legal_name as company_legal_name
             from applications a
             inner join jobs j on j.id = a.job_id
             inner join users u on u.id = a.user_id
             left join users c on c.id = j.company_id
             where ${where}
             order by a.created_at desc, a.id desc
             limit $${idx}`,
            params
        );
        const res = rows as unknown as Record<string, unknown>[];
        const items = res.map((row) => rowToApplicationView(row));

        const hasMore = items.length > limit;
        const result = hasMore ? items.slice(0, limit) : items;
        const nextCursor = hasMore
            ? encodeCursor(result[result.length - 1].id)
            : null;

        return { items: result, nextCursor };
    }

    async listByCompany(
        companyId: string,
        cursor?: string,
        limit: number = 20
    ): Promise<{ items: ApplicationView[]; nextCursor: string | null }> {
        const fetchLimit = limit + 1;
        const params: unknown[] = [companyId];
        const clauses: string[] = [`j.company_id = $1`];
        let idx = 2;

        if (cursor) {
            const { id } = decodeCursor(cursor);
            clauses.push(`(a.created_at, a.id) < (select created_at, id from applications where id = $${idx})`);
            params.push(id);
            idx += 1;
        }

        params.push(fetchLimit);
        const where = clauses.join(" and ");

        const rows = await this.sql(
            `select a.*, j.title as job_title, j.company_id as job_company_id,
                concat_ws(' ', u.first_name, u.last_name) as other_entity_name,
                u.first_name as applicant_name, u.last_name as applicant_sir_name,
                c.legal_name as company_legal_name
             from applications a
             inner join jobs j on j.id = a.job_id
             inner join users u on u.id = a.user_id
             left join users c on c.id = j.company_id
             where ${where}
             order by a.created_at desc, a.id desc
             limit $${idx}`,
            params
        );
        const res = rows as unknown as Record<string, unknown>[];
        const items = res.map((row) => rowToApplicationView(row));

        const hasMore = items.length > limit;
        const result = hasMore ? items.slice(0, limit) : items;
        const nextCursor = hasMore
            ? encodeCursor(result[result.length - 1].id)
            : null;

        return { items: result, nextCursor };
    }

    async updateDecision(applicationId: string, accepted: boolean): Promise<ApplicationRecord | null> {
        const rows = await this.sql`
            update applications set accepted = ${accepted}, updated_at = now()
            where id = ${applicationId}
            returning *
        `;
        const res = rows as unknown as Record<string, unknown>[];
        return res[0] ? rowToApplication(res[0]) : null;
    }

    async recordMatchScore(applicationId: string, userId: string, jobId: string, matchScore: number): Promise<ApplicationRecord | null> {
        const rows = await this.sql`
            update applications
            set match_score = ${matchScore}, updated_at = now()
            where id = ${applicationId} and user_id = ${userId} and job_id = ${jobId}
            returning *
        `;
        await this.sql`update users set match_score = ${matchScore}, updated_at = now() where id = ${userId}`;
        const res = rows as unknown as Record<string, unknown>[];
        return res[0] ? rowToApplication(res[0]) : null;
    }
}
