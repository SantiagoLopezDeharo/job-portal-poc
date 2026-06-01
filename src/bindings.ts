export interface Env {
	AI?: {
		run(model: string, input: unknown): Promise<unknown>;
	};
	NEON_DATABASE_URL?: string;
	JWKS_URL?: string;
	AUTH_ISSUER?: string;
	AUTH_AUDIENCE?: string;
	MATCH_QUEUE?: Queue;
	TEST_MODE?: string;
}