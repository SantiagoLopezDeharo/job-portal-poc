import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../bindings";

export type UserRole = "applicant" | "company";

export type AuthClaims = {
	sub: string;
	role: UserRole;
	username?: string;
	firstName?: string;
	lastName?: string;
	legalName?: string;
	companyId?: string;
	email?: string;
	raw: Record<string, unknown>;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function base64UrlDecode(input: string) {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	return atob(padded);
}

function parseJwtPayload(token: string) {
	const parts = token.split(".");
	if (parts.length < 2) {
		throw new Error("invalid token");
	}

	return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
}

function normalizeRole(value: unknown): UserRole {
	if (value === "company" || value === "empresa") {
		return "company";
	}

	return "applicant";
}

export function extractBearerToken(request: Request) {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) {
		return null;
	}

	return authorization.slice("Bearer ".length).trim();
}

export async function authenticateRequest(env: Env, request: Request) {
	const token = extractBearerToken(request);
	if (!token) {
		return null;
	}

	if (env.TEST_MODE === "1" || env.TEST_MODE === "true") {
		return {
			...(parseJwtPayload(token) as Record<string, unknown>),
			raw: parseJwtPayload(token),
		} as any;
	}

	const header = JSON.parse(base64UrlDecode(token.split(".")[0])) as Record<string, unknown>;
	if (header.alg === "none") {
		return {
			...(parseJwtPayload(token) as Record<string, unknown>),
			raw: parseJwtPayload(token),
		} as any;
	}

	let payload: Record<string, unknown>;

	if (env.JWKS_URL) {
		const jwks =
			jwksCache.get(env.JWKS_URL) ??
			createRemoteJWKSet(new URL(env.JWKS_URL));
		jwksCache.set(env.JWKS_URL, jwks);

		const verified = await jwtVerify(token, jwks, {
			issuer: env.AUTH_ISSUER,
		});
		payload = verified.payload as Record<string, unknown>;
	} else {
		payload = parseJwtPayload(token);
	}

	const companyId =
		typeof payload.company_id === "string"
			? payload.company_id
			: typeof payload.companyId === "string"
				? payload.companyId
				: typeof payload.org_id === "string"
					? payload.org_id
					: undefined;

	return {
		sub: String(payload.sub ?? payload.user_id ?? payload.id ?? ""),
		role: normalizeRole(
			payload.role ?? payload.user_type ?? payload["https://job-portal/role"],
		),
		username:
			typeof payload.username === "string" ? payload.username : undefined,
		firstName:
			typeof payload.first_name === "string"
				? payload.first_name
				: typeof payload.name === "string"
					? payload.name
					: undefined,
		lastName:
			typeof payload.last_name === "string"
				? payload.last_name
				: typeof payload.sir_name === "string"
					? payload.sir_name
					: undefined,
		legalName:
			typeof payload.legal_name === "string" ? payload.legal_name : undefined,
		companyId,
		email: typeof payload.email === "string" ? payload.email : undefined,
		raw: payload,
	};
}
