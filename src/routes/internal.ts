import type { Hono } from "hono";
import type { Env } from "../bindings";
import { InternalController } from "../controllers/internal.controller";

export function registerInternalRoutes(app: Hono<{ Bindings: Env }>) {
    app.post("/internal/events/users/sync", InternalController.syncUser);
}
