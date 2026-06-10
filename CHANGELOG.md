# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project is **pre-release**, so
everything currently lives under **[Unreleased]**.

> **Maintenance rule:** update this file whenever something is completed or a feature is
> added — in the same change. Add a dated bullet under the right category (Added / Changed /
> Fixed / Removed). Pair it with a status update in [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md).

## [Unreleased]

### Added

- **2026-06-10 — M7 admin control plane (token-gated).** The `/admin` view + control endpoints,
  gated by an `ADMIN_TOKEN` break-glass header (`x-admin-token`); Better Auth session gating is
  the M7b follow-up. New `ui` BFF routes under `/api/admin/*`: **set scheme + break-mode**
  (`cryptoConfigRepo.setActive`, rotates the keyring — this is what finally drives the
  hybrid-ML-KEM contrast from the UI), **set CRQC progress**, **inject a trade** (forwarded to
  sentry/quantum via new service bindings so it goes through the real seal+emit path), and a
  **raw inspector** (`@qstd/db` `inspectRecent` — recent loot with ciphertext preview +
  recovered plaintext). The React app gains an Admin view (scheme/mode picker, CRQC slider,
  trade injector, live inspector) reachable at `/admin`. `parseSchemeBody` is a pure validator
  with unit tests (2 new). All workers bundle clean.
- **2026-06-10 — M6 pitch UI.** A React + Vite pitch view served from `ui` via Workers Assets.
  The BFF gains `GET /api/state` (era + counts + scorecard + recent trades/wire in one call),
  `POST /api/break` (Eve's decrypt pass), and SPA fallback for non-`/api/*` routes; `@qstd/db`
  adds `getDashboardState` + `harvestedPacketsRepo.resetBreaks` (so a reset un-breaks the loot
  for a repeatable demo). The page polls live state and shows the era badge, headline metrics
  (trades / harvested / migrations / notional exposed), the **"Advance to the Quantum Era"**
  lever (advance → break in one click; reset to today), the HNDL timeline, a per-scheme
  scorecard (broken vs protected, $ exposed, PQ-safe badge), a live wire feed (🔒/🔓 per
  packet), and the honesty footer. Build wiring: `ui` build compiles `web/dist` (tsc + vite),
  the deploy job builds it before `wrangler deploy`, and `workers/ui/web` is its own toolchain
  (own tsconfig, excluded from root lint/typecheck). 48 KB gzipped; all workers bundle clean.
  Era/break routes are open until M7 gates them with Better Auth.
- **2026-06-10 — M5 integration mapper.** The legitimate Sentry⇄Quantum migration half. New
  `@qstd/shared` mapping rules (`mapTrade`) + `parseCanonicalTrade`. A migration re-books a trade
  into the other system's product taxonomy **while preserving its asset/liability class** — a
  vendor product-code translation, not an economic transform. Sentry assets become Quantum
  labels (loan → money-market, bond → security); Quantum liabilities become Sentry labels (fx →
  currency-forward, irs → interest-rate-swap, ccs → cross-currency-swap); each round-trips.
  `PRODUCT_LABELS` added for the UI. `@qstd/db` adds the `mappings` repo and
  `migrateFromEnvelope`: open the wire message (the integration legitimately holds the keys), map
  to the counterpart system, persist the target trade (idempotent on the source id) + a
  `mappings` link, then re-seal the migrated leg onto the wire and mirror it to `harvest-tap` (so
  Eve sniffs the second hop too). The **integration** worker now consumes `trade-migration` (the
  queue sentry/quantum have produced since M3) and exposes `GET /mappings/count`. 5 new tests
  (mapping both directions + round-trip + the open→map pipeline); all five workers bundle clean.
- **2026-06-10 — M4 break + era (the payoff).** "Advance to the Quantum Era" now genuinely
  breaks the harvested traffic. **EpochClock DO** (in `ui`) is the single global era + CRQC-progress
  state, write-through to the active `crypto_config` row so every worker reads it over Neon;
  `ui` exposes `GET /api/era` + `POST /api/era/{advance,reset,progress}` (open for now; Better
  Auth gating is M7). The **break engine** (`@qstd/db` `runBreakBatch`, exposed at hacker
  `POST /break`) iterates un-attempted `harvested_packets`, reconstructs each sniffed envelope,
  applies the §5 outcome via `@qstd/crypto` (genuine breaks live; projected gates on CRQC=100;
  hybrid-ML-KEM stays opaque), and records `recovered_plaintext` + exposed notional/counterparty.
  The **scorecard** (`summarizeScorecard`, hacker `GET /scorecard`) rolls it up by scheme:
  harvested vs broken vs protected, $ exposed, counterparties leaked. `harvested_packets` gains
  `scheme` + `envelope` columns (migration `0002`). 5 new tests (break genuine/projected/PQC/
  scheme-mismatch + scorecard); all five workers bundle clean. Signature `forge()` deferred
  (signatures aren't applied to wire messages yet).
- **2026-06-09 — M3 wire + harvest (capture half).** The HNDL capture path is live in code.
  `@qstd/crypto` gains `serializeKeyMaterial`/`deserializeKeyMaterial` (bytes/bigints → hex,
  RSA `CryptoKey` → SPKI/PKCS8) so the active keyring persists. `@qstd/db` adds the
  `crypto_config` repo (single active row + serialized keyring + `ensureActive` bootstrap, plus
  a `keyring` column and migration `0001`), the `wire_messages` repo + `WireEnvelope`
  converters, the `harvested_packets` repo, and `sealAndPersist` + `createWireEmitter`.
  `@qstd/shared` adds the `WireEnvelope`/queue-message contract and `canonicalTradePayload`. On
  create, **sentry** and **quantum** now seal the trade under the active scheme, write a
  `wire_messages` row, and fan the envelope out to the `trade-migration` (legit handoff, M5
  consumer) and `harvest-tap` (Eve's mirror) queues. **hacker** consumes `harvest-tap` into the
  new `HarvestArchive` Durable Object (SQLite loot log) and writes a `harvested_packets` row.
  12 new tests (serialization round-trips, envelope round-trips, emit-on-create); all five
  workers bundle clean under wrangler v4. Break engine + era wiring is M4; integration consumer
  is M5.
- **2026-06-09 — M1 data + trades.** `@qstd/db`: Drizzle schema for the full PLAN §4 model
  (`trades`, `crypto_config`, `mappings`, `wire_messages`, `harvested_packets`, `audit_log`),
  the `neon-http` client (`getDb`), the first generated migration, and an idempotent seed.
  `@qstd/shared`: the trade domain (products/systems, the Zod create-trade schema, the error
  envelope, helpers). `sentry` (loans/bonds) and `quantum` (fx/irs/ccs) now serve real trade
  CRUD via Hono — `POST/GET /trades`, `GET /trades/:id`, Zod validation, the `{ data, page }`
  collection shape, keyset pagination, and `Idempotency-Key` replay. Route handlers take an
  injected `TradesRepository` (Drizzle in prod, in-memory in tests), so they're tested without
  a live DB. 20 new tests; both workers bundle clean under wrangler v4.
- **2026-06-09 — M2 crypto registry (`@qstd/crypto`).** The keystone `SchemeRegistry`:
  `seal`/`open`/`break` for all six confidentiality schemes (plaintext, sha256, hmac-sha256,
  rsa-oaep, ecdh-aes, hybrid-mlkem) and `sign`/`verify` for both signature schemes
  (ecdsa-p256, ml-dsa-65). Real crypto throughout — AES-256-GCM bulk, HKDF, ML-KEM-768 +
  X25519 hybrid, ML-DSA-65 (`@noble/post-quantum` + `@noble/curves` + `@noble/ciphers`).
  Both break modes (PLAN §5): **genuine** factors a toy RSA modulus / solves a toy discrete
  log live (Pollard's rho, baby-step giant-step); **projected** gates on CRQC progress then
  reveals real RSA-2048 / P-256 via the held key. **Hybrid ML-KEM never breaks, in any mode.**
  24 tests: seal→open round-trips per scheme/mode, signature verify+tamper, the toy number
  theory, and the headline gate (classical recoverable, PQC not). `forge()` deferred to M4.
- **2026-06-09 — Project state tracking.** `CHANGELOG.md` + `docs/PROJECT-STATE.md` so context
  survives memory clears; CLAUDE.md convention to keep both current.
- **2026-06-09 — GitHub repo + CI/CD.** Created private repo `gkoh-palo/quantum-safe-trade-demo`,
  pushed `main` over SSH (key pinned to `~/.ssh/gkoh-palo`). Added GitHub Actions:
  `ci.yml` (quality gate on PR/push) and `deploy.yml` (main-only: gate → migrate → discover →
  deploy workers matrix via wrangler-action; no-op until worker configs land). The 4 deploy
  secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEON_DATABASE_URL`,
  `BETTER_AUTH_SECRET`) are configured in the repo.
- **2026-06-09 — Auth + environment decisions.** Plan §11 Better Auth (Drizzle adapter on
  Neon, email+password, BFF-gated `/admin`); plan §12 single environment deployed from `main`.
- **2026-06-09 — Project skills.** `.claude/skills/`: `cloudflare-workers`, `api-design`,
  `neon-db`, and `check` (quality-gate runner).
- **2026-06-09 — Quality gate + tooling.** pnpm workspaces (Node 20, ESM, TS strict),
  Prettier, ESLint 9 flat config, Vitest (+v8 coverage), `pnpm check` aggregate, `.editorconfig`.
- **2026-06-09 — Design docs.** `docs/PLAN.md` (architecture, data model, crypto-scheme matrix,
  milestones, risks), `docs/DEMO-SCRIPT.md` (pre-sales walkthrough), README.

### Changed

- **2026-06-09 — Commit convention.** Stop appending the `Co-Authored-By: Claude` trailer to
  commits (recorded in CLAUDE.md → Commits).

### Fixed

- **2026-06-10 — Break survived key rotation; isolated per-packet failures.** Switching the
  active scheme (or re-applying one) minted a brand-new keyring, orphaning already-harvested
  packets — the break engine then threw decrypting them with the wrong key, and with no
  per-packet error isolation the whole batch 500'd, so the scorecard showed everything
  "protected / $0" (RSA looking _safe_ — the opposite of the truth). Fixes: (1) `runBreakBatch`
  now isolates per-packet failures (a packet that can't be opened is marked `error`, the batch
  continues); (2) `setActive` **reuses the existing keyring for a (scheme, breakMode) pair**
  instead of regenerating, so switching schemes back and forth no longer orphans loot; (3) new
  admin **Clear archive** (`POST /api/admin/reset-archive` + button) wipes trades/wire/loot for
  a clean slate. 1 new test (per-packet isolation).
- **2026-06-10 — Seed auto-loads `packages/db/.env`.** `pnpm --filter @qstd/db seed` runs as a
  plain `tsx` script and didn't load any env file, so it failed with "NEON_DATABASE_URL is
  required" even with a local `.env` present. The seed now `process.loadEnvFile(".env")` when
  the file exists (local only; no-op in CI). `migrate` already auto-loads it via drizzle-kit.
- **2026-06-09 — Deploy: bump CI to Node 22 for wrangler v4.** With wrangler v4 as a root
  devDependency, `wrangler-action`'s `pnpm exec wrangler --version` failed ("Wrangler requires
  Node.js v22") because CI ran Node 20 (`.nvmrc`), so the action fell back to wrangler 3.90.0 →
  "Missing entry-point" again. Bumped `.nvmrc` → 22 (all CI jobs use `node-version-file`) and
  `engines.node` → `>=22`. wrangler 4 needs Node ≥ 22.
- **2026-06-09 — Deploy: workspace deps broke wrangler install.** Once `sentry`/`quantum`
  gained `workspace:^` deps (`@qstd/db`), `cloudflare/wrangler-action` died with
  `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:"` — it was running `npm i wrangler`
  inside the worker dir and npm can't parse `workspace:`. Added `wrangler` as a root
  devDependency (so the action detects it and skips the install) and set the action's
  `packageManager: pnpm` for any fallback.
- **2026-06-09 — Deploy pinned to wrangler v4.** The first `deploy.yml` run failed at every
  worker with "Missing entry-point": `cloudflare/wrangler-action@v3` fell back to wrangler
  3.90.0, which predates `wrangler.jsonc` config support (added in 3.91.0) and so never read
  `main`. (Superseded by the root-devDependency approach above.)

### Removed

- _nothing yet_

---

<!--
Template for a future release cut:

## [0.1.0] - YYYY-MM-DD
### Added
### Changed
### Fixed
### Removed
-->
