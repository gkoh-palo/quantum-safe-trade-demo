---
name: cloudflare-workers
description: Cloudflare Workers patterns for this repo — wrangler config, Service Bindings (RPC + fetch), Queues, Durable Objects (SQLite-backed), Cron Triggers, Workers Assets, secrets, and local dev. Use when creating or editing any worker in workers/*, wiring bindings between services, or touching wrangler.jsonc / deployment.
---

# Cloudflare Workers — repo conventions

The demo is 5 Workers wired with bindings: `sentry`, `quantum`, `integration` (business
flow) + `hacker`, `ui` (demo infra). Single environment, deployed from `main`. Always check
current API with the **`/docs`** skill (Context7) or https://developers.cloudflare.com/workers
before relying on memory — the platform moves fast.

## Config: prefer `wrangler.jsonc`

One per worker in `workers/<name>/wrangler.jsonc`. Minimal shape:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "qstd-sentry",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"], // needed for noble/crypto + neon driver
  "observability": { "enabled": true },
}
```

- Pin `compatibility_date`; keep it consistent across workers.
- `nodejs_compat` is required for `@neondatabase/serverless` and parts of `@noble/*`.
- Put runtime config in vars/secrets, never literals in code.

## Service Bindings (worker → worker)

Wire callers to callees. Prefer **RPC** (`WorkerEntrypoint`) for typed calls; `fetch` is fine
for simple proxies.

```jsonc
// caller (e.g. integration) wrangler.jsonc
"services": [
  { "binding": "SENTRY", "service": "qstd-sentry", "entrypoint": "SentryRpc" },
  { "binding": "QUANTUM", "service": "qstd-quantum" }
]
```

```ts
// callee exposes RPC
import { WorkerEntrypoint } from "cloudflare:workers";
export class SentryRpc extends WorkerEntrypoint<Env> {
  async receiveTrade(msg: WireMessage): Promise<Ack> {
    /* ... */
  }
}
// caller invokes: await env.SENTRY.receiveTrade(msg)  // typed, no HTTP
```

> Bindings can't be man-in-the-middled — that's why the HNDL "tap" works by each sender
> **also** mirroring ciphertext to the `harvest-tap` queue (see PLAN §2). Model the wiretap,
> don't try to intercept the binding.

## Queues

Async Sentry⇄Quantum handoff (`trade-migration`) and ciphertext fan-out (`harvest-tap`).

```jsonc
"queues": {
  "producers": [{ "binding": "MIGRATION", "queue": "trade-migration" }],
  "consumers": [{ "queue": "trade-migration", "max_batch_size": 10, "max_retries": 3, "dead_letter_queue": "trade-migration-dlq" }]
}
```

```ts
await env.MIGRATION.send(payload); // producer
export default {
  async queue(batch: MessageBatch<Payload>, env: Env) {
    for (const m of batch.messages) {
      try {
        await handle(m.body, env);
        m.ack();
      } catch {
        m.retry();
      }
    }
  },
};
```

Always `ack()`/`retry()` explicitly and configure a DLQ.

## Durable Objects (use SQLite-backed)

For `EpochClock` (global era state) and `HarvestArchive` (loot log). New DOs must use
SQLite storage via the migration tag.

```jsonc
"durable_objects": { "bindings": [{ "name": "EPOCH", "class_name": "EpochClock" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["EpochClock", "HarvestArchive"] }]
```

```ts
export class EpochClock extends DurableObject<Env> {
  // use this.ctx.storage.sql for queries; one instance = one source of truth
}
```

Address the singleton via `env.EPOCH.idFromName("global")`.

## Cron Triggers

`trade-generator` (live feed) and `epoch-tick` (auto CRQC progress).

```jsonc
"triggers": { "crons": ["*/1 * * * *"] }
```

```ts
export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(generateTrades(env));
  },
};
```

## Workers Assets (ui-worker serves React)

Build Vite to `workers/ui/web/dist`, serve via the assets binding; the Worker handles
`/api/*` and SPA fallback.

```jsonc
"assets": { "directory": "./web/dist", "binding": "ASSETS", "not_found_handling": "single-page-application" }
```

## Secrets & local dev

- Local: `workers/<name>/.dev.vars` (gitignored) for `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.
- Deployed: `wrangler secret put NAME` (or Cloudflare dashboard). Never commit secrets.
- Run: `wrangler dev` per worker; `vars` for non-secret config in `wrangler.jsonc`.
- Typegen: `wrangler types` → `worker-configuration.d.ts` (gitignored, lint-ignored).

## Deploy

`wrangler deploy` per worker dir. CI does this via a matrix over `workers/*` containing a
`wrangler.{jsonc,toml}` (see `.github/workflows/deploy.yml`). One environment, from `main`.
