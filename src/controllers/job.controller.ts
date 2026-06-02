import { Context } from "hono";
import { Env } from "../bindings";
import { createRepositories } from "../repositories";
import { JobService } from "../services/domain/job.service";
import { jobPayloadSchema, applicationCreateSchema, applicationDecisionSchema } from "../schemas/jobs";
import { ok, requireClaims, optionalClaims } from "../middleware/auth";

export class JobController {
    static async create(c: Context<{ Bindings: Env }>) {
        const claims = await requireClaims(c, ["company"]);
        if ("status" in claims) return c.json(claims.body, claims.status);

        const body = jobPayloadSchema.parse(await c.req.json());
        const service = new JobService(createRepositories(c.env));
        const companyId = claims.companyId ?? claims.sub;

        const job = await service.createJob(companyId, body);
        return c.json(ok(job), 201);
    }

    static async list(c: Context<{ Bindings: Env }>) {
        const claims = await optionalClaims(c);
        const service = new JobService(createRepositories(c.env));

        const result = claims?.role === "company"
            ? await service.listJobs(claims.companyId ?? claims.sub)
            : await service.listJobs();

        return c.json(ok(result));
    }

    static async apply(c: Context<{ Bindings: Env }>) {
        const claims = await requireClaims(c, ["applicant"]);
        if ("status" in claims) return c.json(claims.body, claims.status);

        const body = applicationCreateSchema.parse(await c.req.json());
        const repos = createRepositories(c.env);
        const service = new JobService(repos);

        const job = await repos.jobs.getJob(body.jobId);
        if (!job) return c.json({ success: false, errors: [{ code: 4040, message: "Job not found" }] }, 404);

        if (!c.env.MATCH_QUEUE) {
            return c.json({ success: false, errors: [{ code: 5030, message: "Match queue not configured" }] }, 503);
        }

        const application = await service.applyToJob(claims.sub, body.jobId, c.env.MATCH_QUEUE);
        return c.json(ok({ application, queued: true }), 201);
    }

    static async listApplications(c: Context<{ Bindings: Env }>) {
        const claims = await requireClaims(c);
        if ("status" in claims) return c.json(claims.body, claims.status);

        const service = new JobService(createRepositories(c.env));
        const result = await service.listApplications(claims.role, claims.companyId ?? claims.sub);

        return c.json(ok(result));
    }

    static async decide(c: Context<{ Bindings: Env }>) {
        const claims = await requireClaims(c);
        if ("status" in claims) return c.json(claims.body, claims.status);

        const body = applicationDecisionSchema.parse(await c.req.json());
        const service = new JobService(createRepositories(c.env));
        const applicationId = c.req.param("id");
        const companyId = claims.companyId ?? claims.sub;

        const updated = await service.decideApplication(applicationId, companyId, body.accepted);
        if (!updated) return c.json({ success: false, errors: [{ code: 4040, message: "Application not found" }] }, 404);

        return c.json(ok(updated));
    }
}
