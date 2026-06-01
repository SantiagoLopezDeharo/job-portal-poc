import type { Hono } from "hono";
import type { Env } from "../bindings";
import { ok } from "../middleware/auth";

export function registerHealthRoutes(app: Hono<{ Bindings: Env }>) {
    app.get("/health", (c) => c.json(ok({ ok: true })));
}
