---
name: status
description: Report build progress for quantum-safe-trade-demo against docs/PLAN.md — which milestones (M0–M9), packages, and workers are built vs in-progress vs pending, with concrete evidence from the repo. Use when the user asks where the project stands, what's done, what's left, or to check the state of the project.
---

# /status — project progress vs PLAN.md

Produce an honest, evidence-backed snapshot of how far the build has come against the plan
in [docs/PLAN.md](../../../docs/PLAN.md). Do **not** guess — every "done" must be backed by
a file that actually exists and (where relevant) passes. Lean conservative: half-built is
**in-progress**, not done.

## Source of truth

PLAN.md defines the targets. The two that drive this report:

- **§9 Milestones** — M0–M9, each with a deliverable. This is the spine of the report.
- **§6 Repo layout** + **§3 Cloudflare resource map** — the concrete artifacts (packages,
  workers, wrangler configs, DB schema, crypto registry, DOs, queues, crons) that evidence
  each milestone.

If PLAN.md has changed since this skill was written, re-read §9 and §6 and adapt — the
milestone list below is a snapshot, not the authority.

## Steps

1. **Re-read the plan.** Read [docs/PLAN.md](../../../docs/PLAN.md) §6 and §9 so the report
   reflects the current plan, not a stale copy.

2. **Inventory what exists.** Gather evidence in parallel — fast, read-only:

   ```bash
   # Workspace shape
   ls -d packages/*/ workers/*/ 2>/dev/null
   # Worker configs (presence ⇒ deployable target exists)
   find workers -maxdepth 2 -name 'wrangler.*' 2>/dev/null
   # DB: schema, migrations, seed
   ls packages/db/src 2>/dev/null; ls packages/db/drizzle 2>/dev/null; find . -path ./node_modules -prune -o -name '*.sql' -print 2>/dev/null
   # Crypto registry + the §5 scheme keys
   ls packages/crypto/src 2>/dev/null; grep -rEl 'plaintext|sha256|hmac-sha256|rsa-oaep|ecdh-aes|hybrid-mlkem|ml-dsa' packages/crypto/src 2>/dev/null
   # DOs, queues, crons (declared in any wrangler config)
   grep -rEl 'durable_objects|EpochClock|HarvestArchive' workers 2>/dev/null
   grep -rEl 'queues|trade-migration|harvest-tap' workers 2>/dev/null
   grep -rEl 'triggers|crons|trade-generator|epoch-tick' workers 2>/dev/null
   # Auth + UI
   grep -rEl 'better-auth' . --include='*.ts' --include='package.json' 2>/dev/null | grep -v node_modules
   ls workers/ui/web 2>/dev/null
   # CI/CD
   ls .github/workflows 2>/dev/null
   # Git / PR state (feature-PR workflow — see CLAUDE.md "Delivery workflow")
   git status --short && git branch --show-current
   ```

   For anything ambiguous (a worker dir exists but is it wired? does crypto have tests?),
   open the file and look. A `wrangler.jsonc` with no `src/index.ts` is scaffolding, not a
   working worker.

3. **Check the gate (optional but recommended).** If the user wants a health read, run
   `pnpm check` (or invoke the **`/check`** skill). A milestone whose code exists but fails
   typecheck/test is **in-progress**, not done. Skip if they only asked "what's built."

4. **Score each milestone.** Map evidence → status using these definitions:

   | Status             | Meaning                                                  |
   | ------------------ | -------------------------------------------------------- |
   | ✅ **Done**        | Deliverable exists in the repo and passes the gate       |
   | 🟡 **In progress** | Some artifacts exist but incomplete, unwired, or failing |
   | ⬜ **Not started** | No evidence in the repo                                  |

   Milestone → evidence to look for (per PLAN.md §9):
   - **M0 Scaffolding** — `pnpm-workspace.yaml`, root `package.json` workspaces, `turbo.json`,
     5 `wrangler.*` under `workers/*`, `.github/workflows/*`, Neon project (can't verify from
     repo — note as external).
   - **M1 Data + trades** — `packages/db` drizzle schema + migrations + seed; `keystone` &
     `helix` workers with trade CRUD.
   - **M2 Crypto registry** — `packages/crypto` SchemeRegistry with all §5 schemes
     (seal/open/sign/verify/break) **and** round-trip + PQC-resistance tests (gate item).
   - **M3 Wire + harvest** — `wire_messages` table, `trade-migration` + `harvest-tap` queues,
     `HarvestArchive` DO.
   - **M4 Break + era** — `EpochClock` DO, break engine (genuine + projected), scorecard query.
   - **M5 Integration mapper** — Keystone⇄Helix mapping rules, bidirectional queue migration.
   - **M6 Pitch UI** — `workers/ui/web` /pitch: live wire, HNDL timeline, the switch, scorecard.
   - **M7 Admin UI** — /admin: scheme + break-mode + CRQC controls, trade injector, inspector,
     Better Auth gating (§11).
   - **M8 Deploy + crons** — service bindings, secrets, cron feeds, `deploy.yml`, live on CF.
   - **M9 Polish** — demo-script rehearsal, reset button, copy/captions, fallbacks.

5. **Report.** Output in this shape:
   - **One-line headline** — e.g. "M0 done, M2 in progress; on the critical path (M2 → M3/M4 → M6)."
   - **Milestone table** — `# | Milestone | Status | Evidence / gap` (cite `file:line` or the
     missing artifact).
   - **Critical path note** — PLAN.md §9: "M2 gates M3/M4; M3+M4 gate M6. Build M2 first and
     hardest." Call out whether current work respects that ordering.
   - **Recommended next step** — the single highest-leverage thing to do next, and (per the
     **Delivery workflow** in CLAUDE.md) a reminder that it should land as a PR.

## Notes

- **Honesty is the point.** This skill mirrors the repo's own ethos (`genuine` vs `projected`
  — never overclaim). Don't mark a milestone done because the file exists; mark it done because
  it works. When unsure, say "in progress" and name the gap.
- Read-only by default — this skill reports, it doesn't build. If the user then says "do the
  next one," switch to building it on a feature branch + PR.
- Cross-reference open PRs (`gh pr list` if `gh` is available) — work can be done-but-unmerged
  under the feature-PR workflow.
