import { neon } from "@neondatabase/serverless";
import type { Env } from "../bindings";
import { UserRecord, AuthUserInput, MatchEvent } from "../lib/types";
import { UserRole } from "../lib/auth";

function toNumber(value: unknown) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim().length > 0) return Number(value);
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

export class UserRepository {
    constructor(private sql: ReturnType<typeof neon>) { }

    async upsertUser(input: AuthUserInput): Promise<UserRecord> {
        const rows = await this.sql`
            insert into users (
              id, role, username, first_name, last_name, legal_name, company_id, cv_url, match_score, profile, updated_at
            ) values (
              ${input.id}, ${input.role}, ${input.username}, ${input.firstName ?? null}, ${input.lastName ?? null},
              ${input.legalName ?? null}, ${input.companyId ?? null}, null, null,
              ${JSON.stringify(input.profile ?? {})}::jsonb, now()
            ) on conflict (id) do update set
              role = excluded.role, username = excluded.username, first_name = excluded.first_name,
              last_name = excluded.last_name, legal_name = excluded.legal_name, company_id = excluded.company_id,
              profile = excluded.profile, updated_at = now()
            returning *
        `;
        const res = rows as unknown as Record<string, unknown>[];
        return rowToUser(res[0]);
    }

    async getUser(id: string): Promise<UserRecord | null> {
        const rows = await this.sql`select * from users where id = ${id} limit 1`;
        const res = rows as unknown as Record<string, unknown>[];
        return res[0] ? rowToUser(res[0]) : null;
    }

    async updateCvUrl(userId: string, cvUrl: string): Promise<UserRecord | null> {
        const rows = await this.sql`
            update users set cv_url = ${cvUrl}, updated_at = now()
            where id = ${userId}
            returning *
        `;
        const res = rows as unknown as Record<string, unknown>[];
        return res[0] ? rowToUser(res[0]) : null;
    }
}
