---
name: neon-db
description: Neon Postgres + Drizzle ORM on Cloudflare Workers — serverless driver choice (neon-http vs Pool), the packages/db layout, drizzle-kit migrations, seeding, transactions, and the Better Auth Drizzle adapter. Use when touching the schema, writing queries, running migrations, or wiring the database into any worker.
---

# Neon + Drizzle — repo conventions

One Neon project, one database, one environment (from `main`). All DB code lives in
`packages/db` and is imported by the Workers. Check current driver/Drizzle API via the
**`/docs`** skill (Context7) when unsure — APIs shift.

## Driver choice (Workers)

- **`drizzle-orm/neon-http`** + `@neondatabase/serverless` `neon()` — default. One round-trip
  per query over HTTP, no connections to manage. Use for nearly everything.
- **`drizzle-orm/neon-serverless`** + `Pool` (WebSocket) — only when you need **multi-statement
  transactions**. Requires `nodejs_compat`. Create the pool per request, close after.

```ts
// packages/db/src/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function getDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}
// In a worker: const db = getDb(env.NEON_DATABASE_URL)
```

Pass `env.NEON_DATABASE_URL` in — never read process.env in a Worker.

## Layout (`packages/db`)

```
packages/db/
  src/
    schema.ts        # drizzle tables (PLAN §4) + Better Auth tables
    client.ts        # getDb(url)
    seed.ts          # idempotent baseline trades + admin user
  drizzle.config.ts  # drizzle-kit config
  migrations/        # generated SQL — committed
```

## Schema

Define the PLAN §4 tables (`trades`, `mappings`, `wire_messages`, `harvested_packets`,
`crypto_config`, `audit_log`) here. Use `bytea` for ciphertext/keys, `jsonb` for payloads,
`uuid` PKs with `defaultRandom()`, and `timestamptz` with `defaultNow()`.

## Migrations (drizzle-kit)

```jsonc
// drizzle.config.ts
{ "schema": "./src/schema.ts", "out": "./migrations", "dialect": "postgresql",
  "dbCredentials": { "url": process.env.NEON_DATABASE_URL } }
```

- Author change → `pnpm --filter @qstd/db generate` (creates SQL in `migrations/`, commit it).
- Apply → `pnpm --filter @qstd/db migrate` (runs in CI `deploy.yml` before Worker deploy).
- Use **generate + migrate** (versioned SQL), not `push`, so prod is reproducible.

## Transactions

Only with the WebSocket Pool driver:

```ts
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
await db.transaction(async (tx) => {
  /* mapping + target trade insert atomically */
});
await pool.end();
```

The Sentry⇄Quantum migration (insert mapping + target trade together) is the main place a
transaction matters.

## Seeding

`seed.ts` must be **idempotent** (upsert / guard on count) so the demo `reset` and fresh
deploys are repeatable. Seed a baseline of trades and the single Better Auth admin user.

## Better Auth adapter

Better Auth persists to the same DB via its Drizzle adapter:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
export const auth = betterAuth({
  database: drizzleAdapter(getDb(env.NEON_DATABASE_URL), { provider: "pg" }),
  emailAndPassword: { enabled: true },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});
```

Generate its tables once with `npx @better-auth/cli generate`, fold the output into
`schema.ts`, then `generate` + `migrate` so one migration provisions app + auth tables.

## Don't

- Don't hardcode the connection string — always `env.NEON_DATABASE_URL` (secret).
- Don't open a Pool for single reads — use `neon-http`.
- Don't edit generated migration SQL by hand; regenerate from the schema.
