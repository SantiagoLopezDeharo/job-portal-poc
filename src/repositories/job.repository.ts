import { neon } from "@neondatabase/serverless";
import type { JobRecord, JobInput } from "../lib/types";
import { decodeCursor, encodeCursor } from "../lib/cursor";

function toJson(input: unknown) {
    return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
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

export class JobRepository {
    constructor(private sql: ReturnType<typeof neon>) { }

    async getJob(id: string): Promise<JobRecord | null> {
        const rows = await this.sql`select * from jobs where id = ${id} limit 1`;
        const res = rows as unknown as Record<string, unknown>[];
        return res[0] ? rowToJob(res[0]) : null;
    }

    async createJob(companyId: string, input: JobInput): Promise<JobRecord> {
        const rows = await this.sql`
            insert into jobs (company_id, title, description, payload)
            values (
              ${companyId}, ${input.title}, ${input.description}, ${JSON.stringify(input.payload ?? {})}::jsonb
            )
            returning *
        `;
        const res = rows as unknown as Record<string, unknown>[];
        return rowToJob(res[0]);
    }

    async listJobs(
        companyId?: string,
        cursor?: string,
        limit: number = 20
    ): Promise<{ items: (JobRecord & { companyLegalName: string | null })[]; nextCursor: string | null }> {
        const fetchLimit = limit + 1;
        const params: unknown[] = [];
        const clauses: string[] = [];
        let idx = 1;

        if (companyId) {
            clauses.push(`j.company_id = $${idx++}`);
            params.push(companyId);
        }

        if (cursor) {
            const { id } = decodeCursor(cursor);
            clauses.push(`(j.created_at, j.id) < (select created_at, id from jobs where id = $${idx})`);
            params.push(id);
            idx += 1;
        }

        const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
        params.push(fetchLimit);

        const rows = await this.sql(
            `select j.*, u.legal_name as company_legal_name
             from jobs j
             left join users u on u.id = j.company_id
             ${where}
             order by j.created_at desc, j.id desc
             limit $${idx}`,
            params
        );
        const res = rows as unknown as Record<string, unknown>[];
        const items = res.map((row) => ({
            ...rowToJob(row),
            companyLegalName: row.company_legal_name as string | null,
        }));

        const hasMore = items.length > limit;
        const result = hasMore ? items.slice(0, limit) : items;
        const nextCursor = hasMore
            ? encodeCursor(result[result.length - 1].id)
            : null;

        return { items: result, nextCursor };
    }
}
