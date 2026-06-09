---
name: check
description: Run the repo quality gate for quantum-safe-trade-demo — Prettier (format), ESLint (lint), tsc (typecheck) and Vitest (test). Auto-fixes formatting/lint where safe, then verifies the gate is green. Use before committing, after finishing a change, or when the user asks to lint/format/test/check the repo.
---

# /check — repo quality gate

Run the full quality gate for this repo and get it green. Order matters: **format → lint →
typecheck → test**. Fix what is safely auto-fixable; surface the rest for the user.

## Steps

1. **Ensure deps are installed.** If `node_modules` is missing, run `pnpm install` first.

2. **Format (auto-fix).**

   ```bash
   pnpm format
   ```

   Prettier rewrites files in place. This is safe — apply it.

3. **Lint (auto-fix, then verify).**

   ```bash
   pnpm lint:fix && pnpm lint
   ```

   `lint:fix` clears the mechanical issues; the second `lint` reports what needs a human.
   Fix remaining ESLint errors yourself when the fix is obvious and low-risk (unused
   imports, `import type`, `===`); otherwise list them for the user with file:line.

4. **Typecheck.**

   ```bash
   pnpm typecheck
   ```

   Resolve type errors. Do **not** silence them with `any` or `@ts-ignore` unless the user
   approves — prefer a correct type.

5. **Test.**

   ```bash
   pnpm test
   ```

   If tests fail, read the failure, fix the cause (not the assertion, unless the assertion
   is wrong), and re-run. For crypto code, never weaken a round-trip or PQC-resistance test
   to make it pass.

6. **Final verification — the gate as CI sees it.**
   ```bash
   pnpm check
   ```
   This runs `format:check + lint + typecheck + test` with no auto-fix. Report the result
   plainly: green ✅, or the exact failing step and output.

## Notes

- Single command shortcut for verify-only: `pnpm check`. Use the staged steps above when you
  need to _fix_, not just check.
- Scope to a package when iterating: `pnpm --filter @qstd/crypto test`.
- Report honestly: if a step fails or you skipped one, say so with the output. Do not claim
  green unless step 6 actually passed.
