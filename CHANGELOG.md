# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project is **pre-release**, so
everything currently lives under **[Unreleased]**.

> **Maintenance rule:** update this file whenever something is completed or a feature is
> added — in the same change. Add a dated bullet under the right category (Added / Changed /
> Fixed / Removed). Pair it with a status update in [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md).

## [Unreleased]

### Added

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

- _nothing yet_

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
