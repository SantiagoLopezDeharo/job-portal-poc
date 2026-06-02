import type { Hono } from "hono";
import type { Env } from "../bindings";
import { createJobPortalStore } from "../lib/poc";
import { ok, requireClaims } from "../middleware/auth";
import { profileSetupSchema } from "../schemas/users";

export function registerUserRoutes(app: Hono<{ Bindings: Env }>) {
	const handler = async (c: any) => {
		const claims = await requireClaims(c);
		if ("status" in claims) {
			return c.json(claims.body, claims.status);
		}

		const body = profileSetupSchema.parse(await c.req.json());
		const store = createJobPortalStore(c.env);
		const userId = claims.sub;

		const existingUser = await store.getUser(userId);

		let userRole: "company" | "applicant";
		let username: string;
		let firstName: string | null = null;
		let lastName: string | null = null;
		let legalName: string | null = null;

		if (body.role === "company") {
			userRole = "company";
			legalName = body.legalName;
			username = existingUser?.username ?? claims.username ?? claims.email ?? claims.sub;
		} else {
			userRole = "applicant";
			username = body.username;
			firstName = body.firstName;
			lastName = body.lastName;
		}

		const updatedUser = await store.upsertUser({
			id: userId,
			role: userRole,
			username,
			firstName,
			lastName,
			legalName,
			companyId: body.role === "company" ? (claims.companyId ?? null) : null,
			profile: {
				...(existingUser?.profile ?? {}),
				...claims.raw,
			},
		});

		return c.json(ok(updatedUser));
	};

	app.post("/users/me/profile", handler);
	app.put("/users/me/profile", handler);
}
