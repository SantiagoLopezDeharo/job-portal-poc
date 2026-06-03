# Job Portal PoC

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/chanfana-openapi-template)

<!-- dash-content-start -->

This repository now acts as a Cloudflare Workers PoC for a job portal backend using Neon as the primary database, managed identity for authentication, and worker-driven business logic for jobs, applications, storage events, and async match scoring.

The worker keeps a memory fallback for tests when `NEON_DATABASE_URL` is not configured, but the production path is Neon Postgres.

<!-- dash-content-end -->

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/openapi-template#setup-steps) before deploying.

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/openapi-template
```

A live public deployment of this template is available at [https://openapi-template.templates.workers.dev](https://openapi-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Store the Neon connection string as `NEON_DATABASE_URL` using either `npx wrangler secret put NEON_DATABASE_URL` or a local `.dev.vars` file.
3. If you want JWT verification against a managed identity provider, also configure `JWKS_URL`, `AUTH_ISSUER`, and `AUTH_AUDIENCE` on wrangler.jsonc variables.
4. Apply the PostgreSQL schema in [`migrations/0001_add_tasks_table.sql`](migrations/0001_add_tasks_table.sql) to your Neon database.
5. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
6. Monitor your worker
   ```bash
   npx wrangler tail
   ```

## Testing

This project includes integration tests using [Vitest](https://vitest.dev/). To run the tests locally:

```bash
npm run test
```

Test files are located in the `tests/` directory and run against the in-memory store, so they do not require a Neon connection.

## Project structure

1. Your main router is defined in `src/index.ts`.
2. Neon and auth helpers live in `src/lib/`.
3. Integration tests are located in the `tests/` directory.
4. For more information read the [Hono documentation](https://hono.dev/docs) and [Vitest documentation](https://vitest.dev/guide/).
