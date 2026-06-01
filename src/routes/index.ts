import type { Hono } from "hono";
import type { Env } from "../bindings";
import { registerCvRoutes } from "./cv";
import { registerHealthRoutes } from "./health";
import { registerInternalRoutes } from "./internal";
import { registerJobRoutes } from "./jobs";

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
    registerHealthRoutes(app);
    registerCvRoutes(app);
    registerInternalRoutes(app);
    registerJobRoutes(app);
}
