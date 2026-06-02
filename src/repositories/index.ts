import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import type { Env } from "../bindings";
import { UserRepository } from "./user.repository";
import { JobRepository } from "./job.repository";
import { ApplicationRepository } from "./application.repository";
import { MatchEventRepository } from "./match-event.repository";

export class RepositoryContext {
    public readonly users: UserRepository;
    public readonly jobs: JobRepository;
    public readonly applications: ApplicationRepository;
    public readonly matchEvents: MatchEventRepository;

    constructor(private sql: ReturnType<typeof neon>) {
        this.users = new UserRepository(this.sql);
        this.jobs = new JobRepository(this.sql);
        this.applications = new ApplicationRepository(this.sql);
        this.matchEvents = new MatchEventRepository(this.sql);
    }
}

export function createRepositories(env: Env): RepositoryContext {
    const databaseUrl = env.NEON_DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("NEON_DATABASE_URL is not set");
    }
    const sql = neon(databaseUrl) as NeonQueryFunction<boolean, boolean>;
    return new RepositoryContext(sql);
}
