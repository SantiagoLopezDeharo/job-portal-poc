import type { Hono } from "hono";
import type { Env } from "../bindings";
import { registerHealthRoutes } from "./health";
import { registerInternalRoutes } from "./internal";
import { registerJobRoutes } from "./jobs";

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
	registerHealthRoutes(app);
	registerInternalRoutes(app);
	registerJobRoutes(app);
}
