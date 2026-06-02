import type { Hono } from "hono";
import type { Env } from "../bindings";
import { JobController } from "../controllers/job.controller";

export function registerJobRoutes(app: Hono<{ Bindings: Env }>) {
    app.post("/jobs", JobController.create);
    app.get("/jobs", JobController.list);
    app.post("/jobs/applications", JobController.apply);
    app.get("/applications", JobController.listApplications);
    app.put("/jobs/applications/:id", JobController.decide);
}
