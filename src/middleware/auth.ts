import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "../bindings";
import { authenticateRequest, extractBearerToken, type UserRole } from "../lib/auth";

export type AppContext = Context<{ Bindings: Env }>;

export type RouteError = {
    status: ContentfulStatusCode;
    body: {
        success: false;
        errors: Array<{ code: number; message: string }>;
    };
};

export function ok<T>(result: T) {
    return { success: true as const, result };
}

export function error(status: ContentfulStatusCode, message: string): RouteError {
    return { status, body: { success: false, errors: [{ code: status * 10, message }] } };
}

export async function requireClaims(c: AppContext, roles?: UserRole[]) {
    const claims = await authenticateRequest(c.env, c.req.raw);
    if (!claims) {
        return error(401 as ContentfulStatusCode, "Unauthorized");
    }

    //if (roles && !roles.includes(claims.role)) {
    //    return error(403 as ContentfulStatusCode, "Forbidden");
    //}

    return claims;
}

export async function optionalClaims(c: AppContext) {
    const bearer = extractBearerToken(c.req.raw);
    if (!bearer) {
        return null;
    }

    return authenticateRequest(c.env, c.req.raw);
}
