# Playbook — Quantum-Safe Trade Demo

How to **use the services** (Part 1) and **run a demo** (Part 2). For the architecture see
[PLAN.md](PLAN.md); for the full narrated pitch see [DEMO-SCRIPT.md](DEMO-SCRIPT.md).

---

## Surfaces & URLs

| Surface              | URL                                       | What it is                                              |
| -------------------- | ----------------------------------------- | ------------------------------------------------------- |
| **Pitch view**       | `https://qstd-ui.gkoh.workers.dev/`       | The cinematic HNDL story — public, no login             |
| **Admin control**    | `https://qstd-ui.gkoh.workers.dev/admin`  | Presenter control plane — token-gated                   |
| **Keystone booking** | `https://qstd-keystone.gkoh.workers.dev/` | Book **asset** trades (loan/bond) — login required      |
| **Helix booking**    | `https://qstd-helix.gkoh.workers.dev/`    | Book **liability** trades (FX/IRS/CCS) — login required |

## Credentials

- **Booking logins** (admin-seeded; no public sign-up):
  - Keystone — `demo@keystone.local` / `password1234`
  - Helix — `demo@helix.local` / `password1234`
- **Admin token** — the `x-admin-token` value. It is the `ADMIN_TOKEN` secret (kept in
  `packages/db/.env` locally / `wrangler secret` in prod). Paste it once into the Admin token
  field; it's stored in your browser. Never commit or screen-share it.

> New booking users are created by an operator, not self-service:
> `pnpm --filter @qstd/auth seed` (needs `NEON_DATABASE_URL` + `BETTER_AUTH_SECRET` in
> `packages/auth/.env`). Edit the `SEED` list in `packages/auth/src/seed.ts` to add accounts.

---

# Part 1 — Using the services

## A. Book a trade (Keystone / Helix booking UIs)

Each system is a standalone product with its **own** login.

1. Open the **Keystone** (assets) or **Helix** (liabilities) URL.
2. **Sign in** with that system's account (logins are separate — a Keystone session does **not**
   work on Helix).
3. **Book a trade** — pick a product, counterparty, notional, currency, rate, tenor → **Book
   trade**.
   - Keystone products: **Loan, Bond**. Helix products: **FX, IRS, CCS**.
4. Your booking appears in **My blotter** (your own trades only).
5. **Sign out** from the top bar.

Every booked trade is **real traffic**: it's sealed under the active scheme, written to the
wire, mirrored to Eve's archive, and migrated to the counterpart system — so it immediately
shows up in the pitch view and is subject to the break engine.

## B. The pitch view (`/`)

Public, read-only, auto-refreshing. Shows:

- **Era badge** — _Classical_ (today) or _Quantum_ (CRQC has arrived).
- **Headline metrics** — trades booked, harvested by Eve, migrations, **notional exposed**.
- **⚛ Advance to the Quantum Era** — the lever: jumps to the quantum era **and** runs Eve's
  break pass in one click. **Reset to Today** rewinds (re-locks the loot for a repeatable demo).
- **HNDL timeline** — capture-now vs break-later, and the "confidentiality gap."
- **Scorecard by scheme** — harvested vs **broken** vs **protected**, $ exposed, and a **PQ-safe**
  badge (hybrid-mlkem only).
- **Live wire feed** — packets with 🔒 (opaque) / 🔓 (recovered).

## C. The admin control plane (`/admin`)

Paste the admin token, then:

| Control              | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Active scheme**    | Set the encryption scheme + **break mode** (`genuine` / `projected`). Rotates keys. |
| **CRQC countdown**   | Slide 0–100% and **Set** — drives `projected`-mode breaks (100% = quantum arrives). |
| **Inject a trade**   | Book a trade into Keystone/Helix via service binding (no login needed — internal).  |
| **Auto-mode (cron)** | Toggle **Trade generator** (a trade/min) and **CRQC auto-tick** (countdown climbs). |
| **Clear archive**    | Wipe all trades / wire / loot for a clean slate (start-over button).                |
| **Raw inspector**    | Eve's archive: per packet, ciphertext preview and (post-break) recovered plaintext. |

## D. What happens when you book (the pipeline)

`POST /trades` → seal under the active scheme → write `wire_messages` → fan out to
**trade-migration** (legit Keystone⇄Helix handoff) **and** **harvest-tap** (Eve's mirror). The
hacker worker archives the ciphertext; advancing the era runs the break engine over it. Booking
requires a user session; internal callers (admin injector, cron) carry an `x-internal-token`
and bypass the login gate (their trades have no `booked_by`).

---

# Part 2 — Running a demo

Two-screen setup: **Pitch** on the projector, **Admin** on your laptop. Full narration:
[DEMO-SCRIPT.md](DEMO-SCRIPT.md). Condensed runbook below.

## Pre-flight checklist (2 min before the room)

1. Open `/admin`, paste the token. Open `/pitch` on the projector.
2. **Clear archive** → clean slate.
3. Set **Active scheme = `plaintext`**, **CRQC = 0%**, era shows _Classical_.
4. Turn on **Auto-mode → Trade generator** so the wire is alive when you walk up. (Leave
   CRQC auto-tick **off** — you want to pull that lever yourself.)
5. Have a **Keystone booking tab** logged in (`demo@keystone.local`) ready for the live-booking beat.

## The run (~8 min)

| Beat                               | Do this                                                                                                                          | The line                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **1. Today's flow**                | Point at the live wire. **Book a Bond ($50m) live from the Keystone UI.** Watch it travel; note Eve tapping the line.            | "She's passive. She just keeps a copy."                                         |
| **2. Looks safe**                  | Admin → scheme **`rsa-oaep`**. Open the **inspector** on a captured packet → ciphertext. Let the loot pile grow.                 | "Every trade archived. Cheap, undetectable. This is **Harvest Now**."           |
| **3. Decrypt later**               | Pull **⚛ Advance to the Quantum Era**. RSA packets flip 🔒→🔓; **exposed notional** climbs; inspector shows recovered plaintext. | "Captured years ago, broken today. The math just caught up."                    |
| **4. Turn on PQC**                 | **Reset to Today** → scheme **`hybrid-mlkem`** → book again → **Advance** again. Packets **stay 🔒**; scheme is **PQ-safe**.     | "Same attacker, same archive, same quantum computer. One library's difference." |
| **5. Hashing ≠ crypto** (optional) | Scheme **`sha256`** → Advance → plaintext **still exposed**.                                                                     | "Hashing is integrity, not confidentiality."                                    |
| **Close**                          | Mosca's inequality: **X + Y > Z ⟹ already exposed.**                                                                             | "Your trades must stay private for a decade. The clock started years ago."      |

## Failure toggles / recovery

- **Network or Worker hiccup mid-break** → use **`projected`** break mode (fully server-side,
  no live factoring).
- **Audience wants proof it's real** → **`genuine`** mode factors a small-key RSA live on stage
  (caption explains the key-size shrink — we never fake-break a real PQC scheme).
- **Demo state got messy / RSA looks "safe"** → **Clear archive**, then re-book a couple of
  trades under the current scheme before advancing.
- **Hands-off booth mode** → turn on both **Auto-mode** toggles and let it run itself.

## Reset between runs

- **Reset to Today** — rewind the era, re-lock the loot (keeps the data). Use between back-to-back runs.
- **Clear archive** — full wipe (trades + wire + loot). Use to start completely fresh.

---

# Part 3 — Deploy to a new Cloudflare account

`scripts/setup.sh` stands the whole stack up on a fresh account in one shot, and is safe to
re-run. You bring a Neon Postgres URL; it does the rest.

```bash
pnpm install
pnpm exec wrangler login          # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
NEON_DATABASE_URL="postgres://…" ./scripts/setup.sh
```

What it does, in order:

1. **Generates the shared secrets** (`ADMIN_TOKEN`, `BETTER_AUTH_SECRET`, `INTERNAL_TOKEN`) the
   first time and saves them to `.deploy-secrets.env` (gitignored); re-runs reuse them. Pass any
   of them as env vars to override.
2. **Creates the queues** (`trade-migration`, `harvest-tap`).
3. **Builds** the three Vite apps and **deploys** all five workers, capturing each one's
   `*.workers.dev` URL.
4. **Sets the runtime secrets** per worker — including each booking system's `BETTER_AUTH_URL`,
   derived from the URL it just deployed to (so it works on any account's subdomain):

   | Worker                            | Secrets                                                                        |
   | --------------------------------- | ------------------------------------------------------------------------------ |
   | `qstd-keystone`, `qstd-helix`     | `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `INTERNAL_TOKEN` |
   | `qstd-ui`                         | `NEON_DATABASE_URL`, `ADMIN_TOKEN`, `INTERNAL_TOKEN`                           |
   | `qstd-integration`, `qstd-hacker` | `NEON_DATABASE_URL`                                                            |

5. **Runs the migrations** against Neon and **seeds** the demo users (and trades).

At the end it prints the three URLs and where the admin token lives. The only thing it can't do
for you is create the Neon database — provision that (any Postgres works) and pass its URL.

> CI (`.github/workflows/deploy.yml`) handles **ongoing** deploys on push to `main`; the GitHub
> repo needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEON_DATABASE_URL`, and
> `BETTER_AUTH_SECRET`. The setup script is the one-time bootstrap CI doesn't cover (queues,
> per-worker runtime secrets, seeding).

---

## Appendix

### Schemes (confidentiality)

| Scheme         | Breaks in the quantum era? | Teaching point                    |
| -------------- | -------------------------- | --------------------------------- |
| `plaintext`    | Always readable            | Baseline — no protection          |
| `sha256`       | Always readable            | Hashing ≠ encryption              |
| `hmac-sha256`  | Always readable            | Integrity, not confidentiality    |
| `rsa-oaep`     | **Broken** (Shor)          | Classical asymmetric falls        |
| `ecdh-aes`     | **Broken** (Shor)          | Classical key exchange falls      |
| `hybrid-mlkem` | **Survives** — PQ-safe     | X25519 + ML-KEM-768 — the defence |

### Break modes (honesty matters)

- **`projected`** — real RSA-2048 / P-256 keys; the break is gated on the CRQC countdown and
  revealed via a server-held key. Reliable on stage; the caption says "projected."
- **`genuine`** — shrunken toy keys factored **live** (Pollard's rho / baby-step giant-step).
  Real math, on stage; the caption says the keys were shrunk. **Hybrid-mlkem never breaks in
  either mode** — that's the whole point.

### Troubleshooting

- **Booking returns 401** — you're not logged in (or `BETTER_AUTH_*` secrets aren't set on that
  worker). Sign in; check secrets.
- **Cron/injector trades stop appearing** — `INTERNAL_TOKEN` must be set (same value) on
  `ui`, `keystone`, `helix`.
- **Scorecard shows everything "protected / $0" under RSA** — stale loot from a key rotation;
  **Clear archive** and re-book.
