# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project is **pre-release**, so
everything currently lives under **[Unreleased]**.

> **Maintenance rule:** update this file whenever something is completed or a feature is
> added — in the same change. Add a dated bullet under the right category (Added / Changed /
> Fixed / Removed). Pair it with a status update in [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md).

## [Unreleased]

### Added

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
