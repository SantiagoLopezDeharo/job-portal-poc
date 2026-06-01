import type { Hono } from "hono";
import type { Env } from "../bindings";
import { createJobPortalStore, syncAuthUser } from "../lib/poc";
import { verifyNeonAuthWebhook } from "../lib/webhook";
import { error, ok } from "../middleware/auth";
import { neonAuthUserCreatedSchema } from "../schemas/users";

function roleFromMetadata(metadata: Record<string, unknown> | null) {
    const role = metadata?.role;
    if (role === "company" || role === "empresa") {
        return "company" as const;
    }

    return "applicant" as const;
}

function userFieldsFromMetadata(metadata: Record<string, unknown> | null, name?: string) {
    const firstName = typeof metadata?.first_name === "string"
        ? metadata.first_name
        : typeof metadata?.firstName === "string"
            ? metadata.firstName
            : typeof name === "string"
                ? name.split(" ")[0] || undefined
                : undefined;

    const lastName = typeof metadata?.last_name === "string"
        ? metadata.last_name
        : typeof metadata?.lastName === "string"
            ? metadata.lastName
            : typeof name === "string"
                ? name.split(" ").slice(1).join(" ") || undefined
                : undefined;

    const legalName = typeof metadata?.legal_name === "string"
        ? metadata.legal_name
        : typeof metadata?.legalName === "string"
            ? metadata.legalName
            : undefined;

    const companyId = typeof metadata?.company_id === "string"
        ? metadata.company_id
        : typeof metadata?.companyId === "string"
            ? metadata.companyId
            : undefined;

    return { firstName, lastName, legalName, companyId };
}

export function registerInternalRoutes(app: Hono<{ Bindings: Env }>) {
    app.post("/internal/events/users/sync", async (c) => {
        const rawBody = await c.req.text();
        const isVerified = await verifyNeonAuthWebhook(c.env, c.req.raw, rawBody);
        if (!isVerified) {
            const unauthorized = error(401, "Invalid webhook signature");
            return c.json(unauthorized.body, unauthorized.status);
        }

        let parsedBody: unknown;
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            const invalidJson = error(400, "Invalid JSON payload");
            return c.json(invalidJson.body, invalidJson.status);
        }

        const parsed = neonAuthUserCreatedSchema.safeParse(parsedBody);
        if (!parsed.success) {
            const invalidPayload = error(400, "Invalid Neon Auth user.created payload");
            return c.json(invalidPayload.body, invalidPayload.status);
        }

        const headerEventType = c.req.header("x-neon-event-type");
        if (headerEventType && headerEventType !== parsed.data.event_type) {
            const mismatch = error(400, "Event type header does not match payload");
            return c.json(mismatch.body, mismatch.status);
        }

        const event = parsed.data;
        const webhookUser = event.user;
        if (!webhookUser?.id) {
            const missingUser = error(400, "user.id is required for user.created");
            return c.json(missingUser.body, missingUser.status);
        }

        const metadata = typeof webhookUser.metadata === "object" && webhookUser.metadata !== null
            ? (webhookUser.metadata as Record<string, unknown>)
            : null;
        const fields = userFieldsFromMetadata(metadata, webhookUser.name);
        const role = roleFromMetadata(metadata);
        const store = createJobPortalStore(c.env);
        const user = await syncAuthUser(store, {
            sub: webhookUser.id,
            role,
            username:
                (typeof metadata?.username === "string" ? metadata.username : undefined)
                ?? webhookUser.email
                ?? webhookUser.name
                ?? webhookUser.id,
            firstName: fields.firstName ?? undefined,
            lastName: fields.lastName ?? undefined,
            legalName: fields.legalName ?? undefined,
            companyId: fields.companyId ?? undefined,
            raw: {
                source: "neon-auth-webhook",
                ...event,
            },
        });

        return c.json(ok(user), 201);
    });
}
