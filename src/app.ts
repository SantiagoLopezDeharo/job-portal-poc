import { Hono } from "hono";
import type { Env } from "./bindings";
import { registerRoutes } from "./routes";

const app = new Hono<{ Bindings: Env }>();

registerRoutes(app);

export default app;
