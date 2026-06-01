import type { Env } from "../bindings";

const CV_PREFIX = "cv";

function normalizeFilename(filename: string) {
    const fallback = "cv.pdf";
    const sanitized = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
    return sanitized.length > 0 ? sanitized : fallback;
}

export function buildCvObjectKey(userId: string, filename: string) {
    return `${CV_PREFIX}/${userId}/${crypto.randomUUID()}-${normalizeFilename(filename)}`;
}

export function extractUserIdFromCvObjectKey(key: string) {
    const parts = key.split("/");
    if (parts.length < 3 || parts[0] !== CV_PREFIX) {
        return null;
    }

    return parts[1] || null;
}

export function buildCvUrl(env: Env, key: string) {
    const baseUrl = env.CV_PUBLIC_BASE_URL?.replace(/\/$/, "");
    return baseUrl ? `${baseUrl}/cv/${key}` : `/cv/${key}`;
}
