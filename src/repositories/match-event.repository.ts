import { neon } from "@neondatabase/serverless";

export class MatchEventRepository {
    constructor(private sql: ReturnType<typeof neon>) { }

    async queueMatch(applicationId: string, userId: string, jobId: string): Promise<void> {
        await this.sql`
            insert into match_events (application_id, user_id, job_id, status, created_at)
            values (${applicationId}, ${userId}, ${jobId}, 'pending', now())
        `;
    }

    async dequeueMatch() {
        const rows = await this.sql`
            delete from match_events
            where id = (
              select id from match_events where status = 'pending' order by created_at asc limit 1
            )
            returning application_id, user_id, job_id
        `;
        const res = rows as unknown as Record<string, unknown>[];
        const row = res[0] as Record<string, unknown> | undefined;
        if (!row) return undefined;
        return {
            applicationId: String(row.application_id),
            userId: String(row.user_id),
            jobId: String(row.job_id),
        };
    }
}
