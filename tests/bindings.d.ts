import type { Env as AppEnv } from "../src/bindings";

export type Env = AppEnv;

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {}
}
