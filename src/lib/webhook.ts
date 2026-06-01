import type { Env } from "../bindings";

const MAX_SKEW_SECONDS = 5 * 60;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

type Jwk = JsonWebKey & { kid?: string };
type JwksDocument = { keys: Jwk[] };

const jwksCache = new Map<string, { document: JwksDocument; fetchedAt: number }>();

function stripBase64Padding(value: string) {
	return value.replace(/=+$/g, "");
}

function base64UrlEncode(input: Uint8Array) {
	let binary = "";
	for (const byte of input) {
		binary += String.fromCharCode(byte);
	}

	const base64 = btoa(binary);
	return stripBase64Padding(base64).replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string) {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	const binary = atob(padded);
	const result = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		result[index] = binary.charCodeAt(index);
	}

	return result;
}

function isUnixMsTimestampFresh(value: string) {
	const timestampMs = Number(value);
	if (!Number.isFinite(timestampMs)) {
		return false;
	}

	const skewMs = Math.abs(Date.now() - timestampMs);
	return skewMs <= MAX_SKEW_SECONDS * 1000;
}

function resolveNeonAuthJwksUrl(env: Env) {
	if (env.NEON_AUTH_WEBHOOK_JWKS_URL) {
		return env.NEON_AUTH_WEBHOOK_JWKS_URL;
	}

	if (!env.NEON_AUTH_URL) {
		return null;
	}

	return `${env.NEON_AUTH_URL.replace(/\/$/, "")}/.well-known/jwks.json`;
}

async function fetchJwksDocument(jwksUrl: string, forceRefresh = false) {
	const cached = jwksCache.get(jwksUrl);
	if (!forceRefresh && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
		return cached.document;
	}

	const response = await fetch(jwksUrl, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(`Unable to fetch JWKS: ${response.status}`);
	}

	const json = await response.json<unknown>();
	if (!json || typeof json !== "object" || !("keys" in json) || !Array.isArray((json as any).keys)) {
		throw new Error("Invalid JWKS payload");
	}

	const document: JwksDocument = { keys: (json as { keys: Jwk[] }).keys };
	jwksCache.set(jwksUrl, { document, fetchedAt: Date.now() });
	return document;
}

async function findJwkByKid(jwksUrl: string, kid: string) {
	const current = await fetchJwksDocument(jwksUrl, false);
	const cachedMatch = current.keys.find((key) => key.kid === kid);
	if (cachedMatch) {
		return cachedMatch;
	}

	const refreshed = await fetchJwksDocument(jwksUrl, true);
	return refreshed.keys.find((key) => key.kid === kid) ?? null;
}

async function verifyDetachedEd25519Signature(rawBody: string, timestamp: string, signature: string, jwk: Jwk) {
	const parts = signature.split(".");
	if (parts.length !== 3 || parts[1] !== "") {
		return false;
	}

	const [headerB64, , signatureB64] = parts;
	const payloadB64 = base64UrlEncode(new TextEncoder().encode(rawBody));
	const signaturePayload = `${timestamp}.${payloadB64}`;
	const signaturePayloadB64 = base64UrlEncode(new TextEncoder().encode(signaturePayload));
	const signingInput = `${headerB64}.${signaturePayloadB64}`;

	const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
	return crypto.subtle.verify(
		"Ed25519",
		key,
		base64UrlDecode(signatureB64),
		new TextEncoder().encode(signingInput),
	);
}

export async function verifyNeonAuthWebhook(env: Env, request: Request, rawBody: string) {
	if ((env.TEST_MODE === "1" || env.TEST_MODE === "true") && request.headers.get("x-neon-test-bypass") === "1") {
		return true;
	}

	const neonSignature = request.headers.get("x-neon-signature");
	const neonSignatureKid = request.headers.get("x-neon-signature-kid");
	const neonTimestamp = request.headers.get("x-neon-timestamp");
	const jwksUrl = resolveNeonAuthJwksUrl(env);

	if (!neonSignature || !neonSignatureKid || !neonTimestamp || !jwksUrl) {
		return false;
	}

	if (!isUnixMsTimestampFresh(neonTimestamp)) {
		return false;
	}

	try {
		const jwk = await findJwkByKid(jwksUrl, neonSignatureKid);
		if (!jwk) {
			return false;
		}

		return verifyDetachedEd25519Signature(rawBody, neonTimestamp, neonSignature, jwk);
	} catch {
		return false;
	}
}
