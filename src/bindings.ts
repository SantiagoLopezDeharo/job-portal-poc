export interface Env {
    AI?: {
        run(model: string, input: unknown): Promise<unknown>;
    };
    CV_BUCKET?: R2Bucket;
    CV_PUBLIC_BASE_URL?: string;
    NEON_AUTH_WEBHOOK_SECRET?: string;
    NEON_AUTH_URL?: string;
    NEON_AUTH_WEBHOOK_JWKS_URL?: string;
    NEON_DATABASE_URL?: string;
    JWKS_URL?: string;
    AUTH_AUDIENCE?: string;
    AUTH_ISSUER?: string;
    MATCH_QUEUE?: Queue;
    TEST_MODE?: string;
}