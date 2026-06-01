import type { Hono } from "hono";
import type { Env } from "../bindings";
import { createJobPortalStore, syncAuthUser } from "../lib/poc";
import { ok, requireClaims } from "../middleware/auth";
import { syncUserSchema } from "../schemas/users";

export function registerInternalRoutes(app: Hono<{ Bindings: Env }>) {
    app.post("/internal/events/users/sync", async (c) => {
        const claims = await requireClaims(c);
        if ("status" in claims) {
            return c.json(claims.body, claims.status);
        }

        const body = syncUserSchema.parse(await c.req.json());
        const store = createJobPortalStore(c.env);
        const user = await syncAuthUser(store, {
            sub: claims.sub,
            role: body.role,
            username: body.username,
            firstName: body.firstName ?? body.first_name ?? undefined,
            lastName: body.lastName ?? body.last_name ?? undefined,
            legalName: body.legalName ?? body.legal_name ?? undefined,
            companyId: body.companyId ?? body.company_id ?? undefined,
            raw: { ...body, syncedBy: claims.sub },
        });

        return c.json(ok(user), 201);
    });
}
