# Project State — resume here

> **Purpose:** the durable "pick up where we left off" snapshot. It replaces disposable
> session memory — read this first when starting a session, and **update it whenever state
> changes** (alongside a [CHANGELOG.md](../CHANGELOG.md) entry). Keep it short and current;
> design detail lives in [PLAN.md](PLAN.md).

**Last updated:** 2026-06-11

## What this is

A live, deployable demo of the **Harvest-Now-Decrypt-Later** threat against a Keystone (assets)
⇄ Helix (liabilities) trade integration, with configurable crypto and a post-quantum
(ML-KEM) defence. Built for a pre-sales pitch + an admin control plane. Full story:
[README](../README.md), full design: [PLAN.md](PLAN.md).

## Phase

**Phase 1 (M0–M8) complete + deployed live; build paused here.** The full HNDL demo — data,
crypto, wire+harvest, break+era, migration, pitch UI, token-gated admin control plane, and
self-running cron feeds — all green and verified in production (incl. the keyring-rotation fix,
PR #13, that resolved the "$0 / RSA looks safe" bug).

**Phase 2 (PLAN §14) — COMPLETE.** Keystone & Helix are now standalone, authenticated,
UI-bearing products. **M10** `@qstd/auth` (per-system Better Auth, namespaced `keystone_*`/`helix_*`
tables + `trades.booked_by`, migration `0004`) — verified live. **M11** Keystone booking UI (served
from the `keystone` worker; login → book loan/bond → per-user blotter) + the `INTERNAL_TOKEN` bypass
so the cron/injector survive the gate — verified live (login/book/injector all confirmed). **M12**
Helix booking UI (same config-driven app on `helix`, fx/irs/ccs) — in review. **Decisions
(PLAN §14):** no roles, per-user blotter via `trades.booked_by`,
admin-seeded accounts (no self sign-up), HTTP API contract (no RPC). (Optional backlog: **M7b** admin Better
Auth, **M9** copy/rehearsal polish.)

**Live ops state:** queues created; `NEON_DATABASE_URL` on keystone/helix/hacker/ui;
DB seeded; smoke-tested live. Workers at `https://qstd-<name>.gkoh.workers.dev`. The pitch UI
lives at the `ui` root; headless pitch still works:
`POST ui /api/era/advance` → `POST hacker /break` → `GET hacker /scorecard`.

**Deploy prerequisites (M11):** the deploy job now builds `workers/keystone/web/dist` (generic
asset-build step). **Set `INTERNAL_TOKEN` (same value) on `ui`, `keystone`, and `helix`** —
`wrangler secret put INTERNAL_TOKEN --name qstd-<w>` — else the cron/injector hit the now-gated
`POST /trades` and 401. The Keystone booking UI is served at the `keystone` worker root
(`https://qstd-keystone.gkoh.workers.dev`).

**M10 prereqs (done live 2026-06-11):** migration `0004` applied; `BETTER_AUTH_SECRET` +
`BETTER_AUTH_URL` set on keystone & helix; demo users seeded (`demo@keystone.local` /
`demo@helix.local`, `password1234`). Prior prereqs still stand: M8 crons no-op until toggled;
`ADMIN_TOKEN` on `ui`; `NEON_DATABASE_URL` on all of keystone/helix/hacker/ui/**integration**.

## Repo & access

- **Remote:** `git@github.com:gkoh-palo/quantum-safe-trade-demo.git` (private).
- **Local:** `/Users/gkoh/Code/quantum-safe-trade-demo` (separate from `cc-integrations`).
- **Push identity:** SSH key `~/.ssh/gkoh-palo`, pinned via repo-local
  `core.sshCommand`. gh account **gkoh-palo** (key registered on the account this session).
  Just `git push` — no extra auth steps.

## Decisions locked (don't re-litigate)

- **Both vendors are real systems:** Keystone = assets (loans/bonds), Helix = liabilities
  (FX/IRS/CCS); integration layer maps/migrates **both directions**.
- **5 Cloudflare Workers:** `keystone`, `helix`, `integration` (business) + `hacker`, `ui`.
  Service Bindings + Queues + Durable Objects (`EpochClock`, `HarvestArchive`) + Cron.
- **Real PQC:** `@noble/post-quantum` (ML-KEM-768 / ML-DSA-65) + `@noble/curves` + WebCrypto.
  Two honest break modes: `genuine` (small keys, real live break) vs `projected` (real keys,
  simulated countdown). **Never claim to break a real PQC scheme.**
- **DB:** Neon Postgres + Drizzle (`neon-http` driver; `Pool` only for transactions).
- **Auth:** admin (`/admin` in `ui`) is `ADMIN_TOKEN`-gated today (M7). **Phase 2:** separate
  Better Auth per business system (Keystone login ≠ Helix login), namespaced Drizzle tables.
- **Frontend:** React + Vite. `ui` serves Pitch + Admin; **Phase 2:** `keystone` & `helix` each
  serve their own booking UI from their own Workers Assets binding.
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
   seed; `@qstd/shared` trade domain; `keystone`/`helix` trade CRUD (Hono + injected repo).
   Better Auth tables deferred to M7.
4. ✅ **M3 wire + harvest (capture half)** — `crypto_config` keyring + `wire_messages` /
   `harvested_packets` repos; keystone/helix seal + fan out to `trade-migration` + `harvest-tap`;
   hacker consumes `harvest-tap` into the `HarvestArchive` DO. Migration `0001`.
5. ✅ **M4 break + era** — `EpochClock` DO (era/CRQC, mirrored to `crypto_config`); break engine
   (`runBreakBatch`, hacker `POST /break`); scorecard (hacker `GET /scorecard`); migration `0002`.
   Signature `forge()` deferred (no signatures on wire messages yet).
6. ✅ **M5 integration mapper** — `@qstd/shared` mapping rules (`mapTrade`); `@qstd/db`
   `mappings` repo + `migrateFromEnvelope`; integration consumes `trade-migration` (open → map →
   persist → re-seal → mirror). Representative product map (PLAN §13 Q2).
7. ✅ **M6 pitch UI** — React + Vite app served from `ui` (Workers Assets); BFF `GET /api/state`
   and `POST /api/break`; the era badge, scorecard, "Advance to the Quantum Era" lever, HNDL
   timeline, live wire feed. The deploy job builds `web/dist` before `wrangler deploy`.
8. ✅ **M7 admin control plane** — `/admin` view + `/api/admin/*` (scheme/break-mode, CRQC,
   trade injector via service bindings, raw inspector), token-gated by `ADMIN_TOKEN`.
9. ✅ **M8 cron feeds** — `trade-generator` + `epoch-tick` Cron Triggers on `ui`, gated by
   `auto_generate` / `auto_tick` (migration `0003`), with admin toggles. Hands-off demo.
   **— Phase 1 (M0–M8) complete here. —**

**Phase 2 (PLAN §14) — trade-booking product:**

10. ✅ **M10 per-system auth** — `@qstd/auth` (`createAuth`/`seedUser`); Better Auth on `keystone`
    **and** `helix` (separate instances, email+password, sign-up disabled, namespaced
    `keystone_*` / `helix_*` tables, migration `0004` + `trades.booked_by`); `/api/auth/*` mounted,
    `POST /trades` gated + records `booked_by`, `GET /trades?mine=1`. **Verified live** (2026-06-11):
    secrets set on both workers, demo users seeded (`demo@keystone.local` / `demo@helix.local`),
    login → gated booking → cross-system isolation all confirmed. (Seed fix: better-auth blocks
    server `signUpEmail` under `disableSignUp`, so the seed uses an `allowSignUp: true` instance;
    runtime workers stay gated.)
11. ✅ **M11 Keystone booking UI** — `workers/keystone/web` (React+Vite, served via the `keystone`
    worker's assets binding): login → book loan/bond → per-user blotter (`?mine=1`). Generic build
    wiring (`workers/*/web`, deploy builds any worker with a `build` script). Plus the
    `INTERNAL_TOKEN` bypass so the cron/injector survive the gate. **Needs live verify** after
    setting `INTERNAL_TOKEN` (book via the UI; confirm cron/injector restored).
12. ✅ **M12 Helix booking UI** — `workers/helix/web` (the Keystone app with a Helix `SYSTEM`
    block + distinct accent), served from the `helix` worker; login → book fx/irs/ccs → blotter.
    No new secrets (INTERNAL_TOKEN + Better Auth already set). **— Phase 2 (M10–M12) complete. —**

**Optional backlog:** **M7b** (give `ui` admin its own Better Auth instead of `ADMIN_TOKEN`);
**M9** (copy/captions, demo-script rehearsal — full reset already shipped as admin "Clear
archive").

## Open questions (from PLAN §13)

1. Break-mode default for the pitch: `genuine` vs `projected`?
2. Keystone⇄Helix mapping fidelity: mirror real cc-integrations mappings, or a subset?
3. Branding: neutral or skinned for a specific prospect?

## How to resume a session

Read, in order: **this file → [CHANGELOG.md](../CHANGELOG.md) → [CLAUDE.md](../CLAUDE.md) →
[PLAN.md](PLAN.md)**. Then continue from **Next steps** above.
