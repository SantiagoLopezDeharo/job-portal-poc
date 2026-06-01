import type { Hono } from "hono";
import type { Env } from "../bindings";
import { createJobPortalStore } from "../lib/poc";
import { ok, optionalClaims, requireClaims } from "../middleware/auth";
import { applicationCreateSchema, applicationDecisionSchema, jobPayloadSchema } from "../schemas/jobs";

export function registerJobRoutes(app: Hono<{ Bindings: Env }>) {
    app.post("/jobs", async (c) => {
        const claims = await requireClaims(c, ["company"]);
        if ("status" in claims) {
            return c.json(claims.body, claims.status);
        }

        const body = jobPayloadSchema.parse(await c.req.json());
        const store = createJobPortalStore(c.env);
        const companyId = claims.companyId ?? claims.sub;
        const job = await store.createJob(companyId, body);
        return c.json(ok(job), 201);
    });

    app.get("/jobs", async (c) => {
        const claims = await optionalClaims(c);
        const store = createJobPortalStore(c.env);
        const result = claims?.role === "company"
            ? await store.listJobs(claims.companyId ?? claims.sub)
            : await store.listJobs();

        return c.json(ok(result));
    });

    app.post("/jobs/applications", async (c) => {
        const claims = await requireClaims(c, ["applicant"]);
        if ("status" in claims) {
            return c.json(claims.body, claims.status);
        }

        const body = applicationCreateSchema.parse(await c.req.json());
        const store = createJobPortalStore(c.env);
        const job = await store.getJob(body.jobId);
        if (!job) {
            return c.json({ success: false, errors: [{ code: 4040, message: "Job not found" }] }, 404);
        }

        const application = await store.createApplication({ userId: claims.sub, jobId: body.jobId });
        const matchEvent = {
            applicationId: application.id,
            userId: claims.sub,
            jobId: body.jobId,
        };
        if (!c.env.MATCH_QUEUE) {
            return c.json({ success: false, errors: [{ code: 5030, message: "Match queue not configured" }] }, 503);
        }

        await c.env.MATCH_QUEUE.send(matchEvent);

        return c.json(ok({ application, queued: true }), 201);
    });

    app.get("/applications", async (c) => {
        const claims = await requireClaims(c);
        if ("status" in claims) {
            return c.json(claims.body, claims.status);
        }

        const store = createJobPortalStore(c.env);
        const result = claims.role === "company"
            ? await store.listApplicationsByCompany(claims.companyId ?? claims.sub)
            : await store.listApplicationsByApplicant(claims.sub);

        return c.json(ok(result));
    });

    app.put("/jobs/applications/:id", async (c) => {
        const claims = await requireClaims(c, ["company"]);
        if ("status" in claims) {
            return c.json(claims.body, claims.status);
        }

        const body = applicationDecisionSchema.parse(await c.req.json());
        const store = createJobPortalStore(c.env);
        const updated = await store.updateApplicationDecision({
            applicationId: c.req.param("id"),
            companyId: claims.companyId ?? claims.sub,
            accepted: body.accepted,
        });

        if (!updated) {
            return c.json({ success: false, errors: [{ code: 4040, message: "Application not found" }] }, 404);
        }

        return c.json(ok(updated));
    });
}
