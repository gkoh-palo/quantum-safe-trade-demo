# CLAUDE.md — quantum-safe-trade-demo

Repo conventions and the quality gate. Read this before changing code.

## What this repo is

A live, deployable simulation of the **Harvest-Now-Decrypt-Later** threat against a
Sentry (assets) ⇄ Quantum (liabilities) trade integration, with configurable crypto and a
post-quantum defence. See [docs/PLAN.md](docs/PLAN.md) for the architecture.

## Stack

- **Runtime:** Cloudflare Workers (Service Bindings, Queues, Durable Objects, Cron).
- **Language:** TypeScript, ESM only (`"type": "module"`), `strict` + `noUncheckedIndexedAccess`.
- **DB:** Neon Postgres via Drizzle ORM (`@neondatabase/serverless`).
- **Crypto:** `@noble/post-quantum` (ML-KEM-768, ML-DSA-65), `@noble/curves`, WebCrypto.
- **Frontend:** React + Vite (in `workers/ui/web`).
- **Monorepo:** pnpm workspaces — `packages/*` (shared, crypto, db) and `workers/*`.

## Package manager

Use **pnpm** (`packageManager` is pinned). Do not use npm/yarn. Node ≥ 20 (`.nvmrc`).

## The quality gate — run before every commit

```bash
pnpm check        # format:check + lint + typecheck + test  (the full gate)
```

Individual steps:

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `pnpm format`       | Prettier — **write** (auto-fix formatting) |
| `pnpm format:check` | Prettier — verify only (CI/gate)           |
| `pnpm lint`         | ESLint (flat config + typescript-eslint)   |
| `pnpm lint:fix`     | ESLint with `--fix`                        |
| `pnpm typecheck`    | `tsc --noEmit` across the workspace        |
| `pnpm test`         | Vitest (run once)                          |
| `pnpm test:cov`     | Vitest with v8 coverage                    |

**Workflow when finishing a change:** `pnpm format && pnpm lint:fix` to auto-fix, then
`pnpm check` to confirm the gate is green. Or just run the **`/check`** skill, which does
this and reports/fixes failures.

## Conventions

- **Imports:** `consistent-type-imports` is enforced — use `import type { Foo }` for types.
- **Unused vars:** prefix intentionally-unused with `_` (`_ctx`, `_unused`).
- **Equality:** `eqeqeq` (smart) — use `===`/`!==`.
- **Logging:** no stray `console.log` (warn-level lint); `console.warn`/`console.error` allowed.
- **Tests:** colocate as `*.spec.ts` / `*.test.ts` next to the unit under test.
- **Crypto correctness is non-negotiable:** every scheme in `packages/crypto` must have
  round-trip (`seal`→`open`) tests and, for the break engine, a test asserting PQC schemes
  are **not** recoverable while classical schemes are.

## Do not

- Commit secrets. Use `wrangler secret` / `.dev.vars` (gitignored). Never hardcode
  `NEON_DATABASE_URL` or signing seeds.
- Claim to "break" a real PQC scheme. The demo's honesty (`genuine` vs `projected` break
  modes) is the whole value — keep captions truthful.
