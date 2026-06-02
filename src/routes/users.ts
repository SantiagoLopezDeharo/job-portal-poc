import type { Hono } from "hono";
import type { Env } from "../bindings";
import { UserController } from "../controllers/user.controller";

export function registerUserRoutes(app: Hono<{ Bindings: Env }>) {
	app.post("/users/me/profile", UserController.setupProfile);
	app.put("/users/me/profile", UserController.setupProfile);
}

