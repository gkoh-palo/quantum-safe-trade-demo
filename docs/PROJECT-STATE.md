# Project State — resume here

> **Purpose:** the durable "pick up where we left off" snapshot. It replaces disposable
> session memory — read this first when starting a session, and **update it whenever state
> changes** (alongside a [CHANGELOG.md](../CHANGELOG.md) entry). Keep it short and current;
> design detail lives in [PLAN.md](PLAN.md).

**Last updated:** 2026-06-10

## What this is

A live, deployable demo of the **Harvest-Now-Decrypt-Later** threat against a Sentry (assets)
⇄ Quantum (liabilities) trade integration, with configurable crypto and a post-quantum
(ML-KEM) defence. Built for a pre-sales pitch + an admin control plane. Full story:
[README](../README.md), full design: [PLAN.md](PLAN.md).

## Phase

**M0–M3 merged + deployed live; M4 done — in review.** The full HNDL loop works: capture
(M3) plus the break payoff (M4). EpochClock DO owns era/CRQC (mirrored to `crypto_config`);
hacker `POST /break` runs the break engine over harvested packets; `GET /scorecard` rolls up
the damage. Next on the critical path: **M5** (integration `trade-migration` consumer: open +
map + re-seal + forward), then **M6** (pitch UI) / **M7** (admin UI + Better Auth, which gates
the era + scheme controls).

**Live ops state:** queues created (`trade-migration`, `harvest-tap`, `harvest-tap-dlq`);
`NEON_DATABASE_URL` secret set on sentry/quantum/hacker; DB seeded with the default posture
plus baseline trades. Workers deployed at `https://qstd-<name>.gkoh.workers.dev`. Smoke-tested:
the capture path is confirmed live (POST trade → loot archived; idempotent replay).

**Deploy prerequisites (M4):** set `NEON_DATABASE_URL` runtime secret on **ui** too (the
EpochClock DO writes `crypto_config`). The `EpochClock` DO auto-creates via its migration tag.
Migration `0002` (harvested_packets `scheme`/`envelope`) applies via the deploy migrate job.

## Repo & access

- **Remote:** `git@github.com:gkoh-palo/quantum-safe-trade-demo.git` (private).
- **Local:** `/Users/gkoh/Code/quantum-safe-trade-demo` (separate from `cc-integrations`).
- **Push identity:** SSH key `~/.ssh/gkoh-palo`, pinned via repo-local
  `core.sshCommand`. gh account **gkoh-palo** (key registered on the account this session).
  Just `git push` — no extra auth steps.

## Decisions locked (don't re-litigate)

- **Both vendors are real systems:** Sentry = assets (loans/bonds), Quantum = liabilities
  (FX/IRS/CCS); integration layer maps/migrates **both directions**.
- **5 Cloudflare Workers:** `sentry`, `quantum`, `integration` (business) + `hacker`, `ui`.
  Service Bindings + Queues + Durable Objects (`EpochClock`, `HarvestArchive`) + Cron.
- **Real PQC:** `@noble/post-quantum` (ML-KEM-768 / ML-DSA-65) + `@noble/curves` + WebCrypto.
  Two honest break modes: `genuine` (small keys, real live break) vs `projected` (real keys,
  simulated countdown). **Never claim to break a real PQC scheme.**
- **DB:** Neon Postgres + Drizzle (`neon-http` driver; `Pool` only for transactions).
- **Auth:** Better Auth in the `ui` BFF, Drizzle adapter on Neon, email+password, gates `/admin`.
- **Frontend:** React + Vite served from `ui` worker (Pitch view + Admin view).
- **Env/CD:** one environment, deployed straight from `main`. pnpm, Node 22, ESM, TS strict.

## Environment / secrets

- **GitHub repo secrets (CI):** ✅ all 4 set — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`. (Values are not stored in the repo.)
- **Worker runtime secrets:** still TODO — set per-worker via `wrangler secret put` when the
  workers exist (reuse the same `NEON_DATABASE_URL` / `BETTER_AUTH_SECRET`).
- **Neon project:** assumed created (its URL is in the secret); confirm the project/branch
  before first migration.

## Quality gate

`pnpm check` = `format:check + lint + typecheck + test`. Currently green (no app code yet;
Vitest `passWithNoTests`). The `/check` skill runs and fixes it. CI enforces the same on PRs.

## Next steps (M1 onward)

1. ✅ **M0 scaffold** — workspaces + five `workers/*` with `wrangler.jsonc` (merged, PR #1).
2. ✅ **M2 `packages/crypto`** — `SchemeRegistry` (`seal/open/break` + `sign/verify`) for every
   PLAN §5 scheme, both break modes, round-trip + PQC-resistance tests. (`forge()` → M4.)
3. ✅ **M1 data + trades** — `@qstd/db` schema (all §4 tables) + `0000_*` migration + idempotent
   seed; `@qstd/shared` trade domain; `sentry`/`quantum` trade CRUD (Hono + injected repo).
   Better Auth tables deferred to M7.
4. ✅ **M3 wire + harvest (capture half)** — `crypto_config` keyring + `wire_messages` /
   `harvested_packets` repos; sentry/quantum seal + fan out to `trade-migration` + `harvest-tap`;
   hacker consumes `harvest-tap` into the `HarvestArchive` DO. Migration `0001`.
5. ✅ **M4 break + era** — `EpochClock` DO (era/CRQC, mirrored to `crypto_config`); break engine
   (`runBreakBatch`, hacker `POST /break`); scorecard (hacker `GET /scorecard`); migration `0002`.
   Signature `forge()` deferred (no signatures on wire messages yet).
6. **M5**: integration `trade-migration` consumer — open + map + re-seal + forward to the target
   system (the legit migration half).
7. **M6/M7**: pitch UI + admin UI (Better Auth gates the era + scheme controls now open on `ui`).

**Outstanding for M4 deploy:** set the `NEON_DATABASE_URL` runtime secret on **ui** (the new
EpochClock DO writes `crypto_config`). Everything else (queues, secrets on sentry/quantum/hacker,
seed, migrations) is already in place; CI deploys from `main` automatically.

## Open questions (from PLAN §13)

1. Break-mode default for the pitch: `genuine` vs `projected`?
2. Sentry⇄Quantum mapping fidelity: mirror real cc-integrations mappings, or a subset?
3. Branding: neutral or skinned for a specific prospect?

## How to resume a session

Read, in order: **this file → [CHANGELOG.md](../CHANGELOG.md) → [CLAUDE.md](../CLAUDE.md) →
[PLAN.md](PLAN.md)**. Then continue from **Next steps** above.
