# Build Plan — Quantum-Safe Trade Migration Demo

> Goal: a live, deployed simulation proving the Harvest-Now-Decrypt-Later threat against
> a Keystone↔Helix trade integration, with a presenter-controllable PQC defence.

---

## 1. Actors & narrative

| Actor                 | Role                                           | Asset classes | Notes                                                                                |
| --------------------- | ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| **Keystone**          | Vendor system, **asset** trades                | Loans, Bonds  | Source/target of migration                                                           |
| **Helix**             | Vendor system, **liability** trades            | FX, IRS, CCS  | Source/target of migration                                                           |
| **Integration Layer** | Maps & migrates trades both directions         | —             | Re-shapes + re-encrypts payloads; the richest interception point                     |
| **Eve (Hacker)**      | Passive wiretap — _harvest now, decrypt later_ | —             | Mirrors every wire message to a loot store; breaks it once the "quantum era" arrives |

**Plot beats the presenter controls:**

1. Trades flow Keystone ↔ Helix (auto-generated + manual).
2. Every inter-service message is encrypted under the **current scheme** and mirrored to Eve's archive.
3. Today (classical era) Eve can't read protected traffic — she just stores it.
4. Presenter flips **"Advance to the Quantum Era."**
5. Eve runs her break engine over the archive:
   - plaintext / hash-only → readable (teaches _hashing ≠ encryption_)
   - classical RSA / ECDH → **broken** (Shor) → trade economics exposed
   - **hybrid X25519 + ML-KEM** → break **fails** → traffic stays opaque
6. Dashboards quantify the damage: % harvested, % broken, $ notional exposed, counterparties leaked.

> **Naming note:** in the real cc-integrations codebase "Keystone→Helix" is the asset
> integration flow. Here both are treated as independent vendor systems (Keystone=assets,
> Helix=liabilities) so the migration is genuinely bidirectional. The pun — that the
> _Helix_ system is undone by _helix_ computing — is intentional and good pitch theatre.

---

## 2. High-level architecture

```
                            ┌─────────────────────────────────────────────┐
                            │              ui-worker (BFF + React)         │
                            │   Pitch view  ·  Admin control plane         │
                            └───────────────┬─────────────────────────────┘
                                            │ service bindings (control + read)
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                    ▼                                    ▼
┌───────────────┐   wire msg (enc)  ┌────────────────────┐  wire msg (enc) ┌───────────────┐
│ keystone-worker │ ────────────────▶ │ integration-worker │ ───────────────▶│ helix-worker│
│ assets        │ ◀──────────────── │ map + re-encrypt   │ ◀───────────────│ liabilities   │
│ loans / bonds │   via Queue       │ (Keystone⇄Helix)   │   via Queue     │ FX / IRS / CCS│
└──────┬────────┘                   └─────────┬──────────┘                 └──────┬────────┘
       │  passive tap (mirror ciphertext)     │  passive tap                      │
       └──────────────────────┬───────────────┴───────────────┬───────────────────┘
                              ▼                                ▼
                      ┌─────────────────────────────────────────────┐
                      │            hacker-worker (Eve)               │
                      │  HarvestArchive (Durable Object) → Neon      │
                      │  break engine · "decrypt later" endpoint     │
                      └─────────────────────────────────────────────┘

   Cron Triggers: trade-generator (live feed) · epoch-tick (CRQC progress)
   Durable Objects: EpochClock (era state) · HarvestArchive (loot log + break orchestration)
   Neon Postgres: trades · mappings · wire_messages · harvested_packets · crypto_config · audit_log
```

**Why 5 Workers** (3 services + UI + hacker): the "3 webservices" are keystone/helix/integration.
`hacker` and `ui` are infrastructure for the demo, not part of the simulated business flow.

**Modelling the wiretap honestly.** Cloudflare Service Bindings can't be truly
man-in-the-middled, so each sender _also_ mirrors the exact ciphertext bytes to the
hacker tap. This faithfully models a **passive network sniffer** (which is the real HNDL
threat model) — Eve never sees plaintext or private keys at capture time, only what
travels on the wire.

---

## 3. Cloudflare resource map

| Resource          | Name              | Purpose                                                                           |
| ----------------- | ----------------- | --------------------------------------------------------------------------------- |
| Worker            | `keystone`        | Asset-trade REST API **+ booking UI + Better Auth**; encrypts + emits wire msgs   |
| Worker            | `helix`           | Liability-trade REST API **+ booking UI + Better Auth**; receives migrated trades |
| Worker            | `integration`     | Queue consumer; maps + re-encrypts + forwards                                     |
| Worker            | `hacker`          | Harvest tap + break engine                                                        |
| Worker            | `ui`              | Pitch + admin React app + BFF/control endpoints                                   |
| Queue             | `trade-migration` | Async Keystone⇄Helix handoff (producer: keystone/helix, consumer: integration)    |
| Queue             | `harvest-tap`     | Fan-out of ciphertext to the hacker (decouples capture from break)                |
| Durable Object    | `EpochClock`      | Single global era state (classical/helix) + CRQC progress %                       |
| Durable Object    | `HarvestArchive`  | Append-only loot log, break orchestration, per-key cache                          |
| Cron              | `*/1 * * * *`     | `trade-generator` — emits random trades to keep the feed live                     |
| Cron              | `*/2 * * * *`     | `epoch-tick` — advances CRQC progress when in auto mode                           |
| Hyperdrive (opt.) | `neon`            | Pooled Postgres access from Workers                                               |

Secrets via `wrangler secret`: `NEON_DATABASE_URL`, `ADMIN_TOKEN`, per-service `SIGNING_SEED`,
and per-system `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` (Phase 2 — keystone & helix each run
their own auth; see §11/§14).

---

## 4. Data model (Neon Postgres, via Drizzle ORM)

```sql
-- current security posture (single active row, versioned for audit)
crypto_config(
  id, active boolean, scheme text,            -- see §5 scheme matrix
  era text,                                    -- 'classical' | 'helix'
  crqc_progress int,                           -- 0..100, drives the break
  kem_public_key bytea, kem_secret_ref text,   -- ML-KEM keypair handle
  classical_pub bytea, classical_priv_size int,-- RSA/ECDH (priv kept server-side)
  created_at, updated_at
)

trades(
  id uuid, system text,                        -- 'keystone' | 'helix'
  asset_class text,                            -- 'asset' | 'liability'
  product text,                                -- loan|bond|fx|irs|ccs
  counterparty text, notional numeric, currency text,
  rate numeric, tenor text, trade_date date, status text,
  payload_json jsonb,                          -- canonical trade body
  booked_by text,                              -- Phase 2: the system's user who booked it (blotter scope)
  created_at
)

mappings(
  id uuid, source_trade_id uuid, target_trade_id uuid,
  direction text,                              -- 'keystone->helix' | 'helix->keystone'
  rules_version text, status text, created_at
)

wire_messages(                                 -- every inter-service payload
  id uuid, from_service text, to_service text,
  scheme text, era_at_send text,
  ciphertext bytea, nonce bytea,
  encapsulated_key bytea,                      -- KEM ciphertext (hybrid/ECDH)
  signature bytea, sig_scheme text,
  plaintext_sha256 bytea,                      -- for integrity demo only
  created_at
)

harvested_packets(                             -- Eve's loot
  id uuid, wire_message_id uuid, harvested_at,
  broken boolean default false,
  break_method text,                           -- 'shor-rsa'|'shor-ecdh'|'plaintext'|'failed'
  recovered_plaintext jsonb, broken_at,
  exposed_notional numeric, exposed_counterparty text
)

audit_log(id, ts, actor, event, detail jsonb)  -- powers the timeline UI
```

Neon driver: `@neondatabase/serverless` + `drizzle-orm/neon-http`. Migrations with
`drizzle-kit`. A `seed` script creates a baseline of trades so a fresh demo isn't empty.

---

## 5. Configurable security methods (the core knob)

Admin selects the **active scheme**; it governs how `integration`/`keystone`/`helix`
protect each wire message. Each scheme has a defined _break outcome_ in the quantum era.

| Scheme key     | Construction                             | Confidentiality     | Helix-safe?         | Helix-era outcome                              |
| -------------- | ---------------------------------------- | ------------------- | ------------------- | ---------------------------------------------- |
| `plaintext`    | none                                     | ❌ none             | n/a                 | readable immediately (baseline shock)          |
| `sha256`       | hash of payload only                     | ❌ none (integrity) | n/a                 | teaches **hash ≠ encryption** — still readable |
| `hmac-sha256`  | keyed MAC, no encryption                 | ❌ none (auth)      | symmetric-ok        | still readable; shows auth ≠ confidentiality   |
| `rsa-oaep`     | RSA-OAEP wrap + AES-GCM                  | ✅                  | ❌ **no**           | **broken** by Shor → plaintext recovered       |
| `ecdh-aes`     | ECDH(P-256) → HKDF → AES-GCM             | ✅                  | ❌ **no**           | **broken** by Shor (DLP) → recovered           |
| `hybrid-mlkem` | X25519 **+ ML-KEM-768** → HKDF → AES-GCM | ✅                  | ✅ **yes**          | **break fails** — stays opaque                 |
| signatures     | `ecdsa-p256` vs **`ml-dsa-65`**          | integrity/auth      | classical forgeable | quantum era can **forge** ECDSA, not ML-DSA    |

**Honesty about "the break."** RSA-2048 / P-256 cannot be factored on a laptop. Two modes,
both presenter-selectable, both labelled in the UI so the demo never lies:

- **`genuine` mode** — classical path uses a deliberately _small_ key (e.g. RSA-512 or a
  toy curve) so Eve's break **actually runs live** in seconds via `sympy`-style factoring /
  Pollard-rho (ported to JS/WASM). Caption: _"We shrank the key so it breaks in seconds; a
  CRQC does this to 2048-bit in hours."_
- **`projected` mode** — classical path uses real RSA-2048/P-256; the break is **gated on
  `crqc_progress` reaching 100%** (a simulated countdown) and then reveals plaintext from a
  server-held key, representing the future capability. PQC path **never** reveals, in either
  mode, because no known algorithm recovers it.

The PQC path is **always real and always unbroken** — that asymmetry is the whole pitch.

---

## 6. Repo layout (pnpm workspaces + Turborepo)

```
quantum-safe-trade-demo/
├─ package.json                  # workspaces + turbo pipeline
├─ pnpm-workspace.yaml
├─ turbo.json
├─ packages/
│  ├─ shared/                    # types, trade schemas (zod), Keystone⇄Helix mapping rules
│  ├─ crypto/                    # scheme registry: seal()/open()/sign()/verify()/break()
│  └─ db/                        # drizzle schema, migrations, seed, neon client
├─ workers/
│  ├─ keystone/                    # asset-trade API + Better Auth, serves its own booking UI
│  │  └─ web/                    # Vite + React: login + book asset trades (Phase 2)
│  ├─ helix/                   # liability-trade API + Better Auth, serves its own booking UI
│  │  └─ web/                    # Vite + React: login + book liability trades (Phase 2)
│  ├─ integration/              # queue consumer, mapper, re-encrypt + forward
│  ├─ hacker/                    # HarvestArchive DO + break engine + "decrypt later" API
│  └─ ui/                        # EpochClock DO, BFF/admin endpoints, serves React assets
│     └─ web/                    # Vite + React: /pitch and /admin
└─ docs/
   ├─ PLAN.md  (this file)
   ├─ ARCHITECTURE.md
   └─ DEMO-SCRIPT.md
```

`packages/crypto` is the keystone — a single `SchemeRegistry` so every Worker and the
hacker agree on `seal/open/sign/verify/break` for each scheme key in §5.

---

## 7. Front-end

The demo has two presenter-facing views in the `ui` worker (pitch + admin). **Phase 2 (§14)**
adds a third surface: a **trade-booking UI on each business system**, so real users log in and
book trades directly into Keystone and Helix.

### Pitch view (`/pitch`) — cinematic, presenter-facing

- **Live wire** — animated packets flowing Keystone ⇄ Integration ⇄ Helix; Eve's tap
  pulling a copy aside into a growing "loot pile."
- **HNDL timeline** — the signature visual: a capture marker at _today_ connected by a
  long line to a break marker in the _quantum era_; the gap is labelled
  _"years of confidentiality that were never actually there."_
- **The big switch** — "Advance to the Quantum Era" lever; on pull, harvested packets
  flip from 🔒→🔓 (or stay 🔒 for PQC) with a counter of exposed notional / counterparties.
- **Scorecard** — harvested vs broken vs protected, by scheme.

### Admin view (`/admin`) — control plane (token-gated)

- Select **active scheme** (§5) and **break mode** (`genuine`/`projected`).
- Set **CRQC progress** manually or toggle auto-tick (cron).
- **Inject trade** (pick system/product/notional/counterparty) to control the narrative.
- **Replay / reset** the archive; **rotate keys**.
- Raw inspector: pick any `wire_message` → show ciphertext, and (post-break) recovered plaintext.

Stack: **React + Vite**, served as static assets from `ui-worker`; data via BFF endpoints +
SSE/poll for the live feed. Recharts for the scorecard, framer-motion for packet animation.

### Booking UIs (per system) — real user-facing apps (Phase 2, §14)

Each business worker serves **its own** React + Vite app from its own Workers Assets binding,
gated by that system's **own Better Auth** (§11):

- **Keystone booking UI** (served at the `keystone` worker root) — log in, then list and **book
  asset trades** (loans, bonds): a real create-trade form (the same Zod-validated `POST /trades`)
  plus a list/blotter of the user's trades. Every booked trade flows through the normal
  seal → wire → harvest → migrate pipeline, so the pitch view stays live with genuine traffic.
- **Helix booking UI** (served at the `helix` worker root) — the same, for **liability
  trades** (FX, IRS, CCS).

These are deliberately standalone so a separate team can build a further quantum-safe POC layer
on either system independently. Keep them simple and product-like (not cinematic) — login,
book, see your blotter.

---

## 8. Request/data flow (one migrated trade)

1. `POST /trades` on **keystone** (Bond, $50m, CounterpartyX).
2. keystone persists trade, builds canonical payload, **`crypto.seal(payload, scheme)`**,
   writes a `wire_messages` row, **enqueues** to `trade-migration`, and **mirrors
   ciphertext** to `harvest-tap`.
3. **hacker** consumes `harvest-tap` → `HarvestArchive` DO appends → `harvested_packets` row
   (`broken=false`). Eve now holds the ciphertext forever.
4. **integration** consumes `trade-migration` → `crypto.open()` (it legitimately holds keys)
   → maps Bond → the Helix-side representation (`mappings` row) → **re-seals** →
   forwards to **helix** (+ mirrors to tap again).
5. **helix** opens, persists the liability-side trade, acks.
6. Presenter advances era → **hacker** break engine iterates `harvested_packets`, applies
   the §5 outcome per `scheme`, writes `recovered_plaintext` / `failed`, updates scorecard.

---

## 9. Milestones

| #   | Milestone          | Deliverable                                                          |
| --- | ------------------ | -------------------------------------------------------------------- |
| M0  | Scaffolding        | workspaces, turbo, 5 `wrangler.toml`, CI, Neon project created       |
| M1  | Data + trades      | drizzle schema + migrations + seed; keystone & helix CRUD            |
| M2  | Crypto registry    | `packages/crypto` with all §5 schemes: seal/open/sign/verify + tests |
| M3  | Wire + harvest     | wire_messages, Queues, harvest-tap, HarvestArchive DO                |
| M4  | Break + era        | EpochClock DO, break engine (genuine + projected), scorecard query   |
| M5  | Integration mapper | Keystone⇄Helix mapping rules, bidirectional migration via queue      |
| M6  | Pitch UI           | live wire, HNDL timeline, the switch, scorecard                      |
| M7  | Admin UI           | scheme/break-mode/CRQC controls, trade injector, inspector           |
| M8  | Deploy + crons     | service bindings, secrets, cron feeds, end-to-end on Cloudflare      |
| M9  | Polish             | demo script rehearsal, reset button, copy/captions, fallbacks        |

**Critical path:** M2 (crypto) gates M3/M4; M3+M4 gate the pitch payoff (M6). Build M2 first
and hardest — everything credible flows from it.

### Phase 2 — trade-booking product (new requirements, §14)

Turns the two business systems into standalone, authenticated, UI-bearing products that a
separate team can layer a further quantum-safe POC on. M0–M8 are complete and deployed; M10–M12
are the new scope.

| #   | Milestone           | Deliverable                                                                                                                                                                 |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M10 | Per-system auth     | **Better Auth** on `keystone` **and** `helix` — separate instances, email+pwd, namespaced Drizzle tables (`keystone_*` / `helix_*`), `/api/auth/*` per worker, seeded users |
| M11 | Keystone booking UI | React+Vite app on `keystone`: login → book asset trades (loan/bond) + personal blotter; gated by Keystone auth; assets binding + deploy build                               |
| M12 | Helix booking UI    | Same on `helix` for liability trades (fx/irs/ccs)                                                                                                                           |

(Optional, pre-existing backlog: **M7b** — give the `ui` admin its own Better Auth instead of
the `ADMIN_TOKEN` break-glass.)

**Phase 2 critical path:** M10 (per-system auth) gates M11/M12 (each booking UI sits behind its
system's login). The booking forms reuse the existing Zod `POST /trades` + seal/emit path, so no
new backend pipeline is needed — only auth + the two front-ends.

---

## 10. Key risks & mitigations

| Risk                                               | Mitigation                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Real PQC break impossible to show live             | Two explicit modes (§5); never claim to break PQC                           |
| Factoring RSA-2048 live is infeasible              | `genuine` mode uses small keys; caption the shrink honestly                 |
| Workers can't truly MITM bindings                  | Model passive sniffer via ciphertext mirror — the correct HNDL model anyway |
| `@noble/post-quantum` bundle size / CPU on Workers | Pre-warm keys; cache KEM keypair in DO; ML-KEM-768 is fast (<5ms)           |
| Neon cold starts in Workers                        | `@neondatabase/serverless` HTTP driver or Hyperdrive pooling                |
| Demo state drift between runs                      | One-click **reset** + idempotent seed                                       |
| Live-demo network failure                          | `projected` mode runs fully server-side; record a fallback video            |

---

## 11. Authentication — Better Auth

We use [**Better Auth**](https://www.better-auth.com) (framework-agnostic, runs on Workers,
persists to Neon). There are now **two distinct auth concerns**:

### 11a. Per-system user auth (Phase 2 — the new requirement)

Each business system owns its **own** Better Auth so users log in to **Keystone** and **Helix**
**separately** (the decision: separate auth per system — stronger isolation between the two
"vendor" systems, and each is independently consumable by another team).

- **Where it lives:** in the `keystone` and `helix` workers themselves. Each owns `/api/auth/*`
  and gates its booking UI + its mutating `POST /trades`. This changes the earlier posture where
  business workers only trusted Service-Binding calls — they now also authenticate their own
  browser users. (Internal hops — integration's migrate, the ui injector — still go via Service
  Bindings and bypass user auth.)
- **Adapter:** Better Auth **Drizzle adapter** against the shared Neon DB. Because both run on
  one database, **namespace each system's tables** (`keystone_user`/`keystone_session`/… and
  `helix_user`/…) — Better Auth's `usePlural`/table-name config, generated via the CLI and
  folded into our Drizzle migrations so one `migrate` provisions everything.
- **Method:** email + password, with seeded demo users per system.
- **Session:** cookie-based, scoped to each worker's origin; protected routes check
  `auth.api.getSession()` and 401 otherwise.
- **Secrets (per system):** `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` (that worker's origin),
  plus the shared `NEON_DATABASE_URL`.

### 11b. Admin control plane

The `/admin` view in `ui` is currently gated by an `ADMIN_TOKEN` break-glass header (shipped in
M7). Optionally (M7b) give it its own Better Auth instance too; keep `ADMIN_TOKEN` for the
cron/agent paths that aren't browser sessions. The **Pitch** view stays public.

See the **`/neon-db`** and **`/cloudflare-workers`** skills for adapter + Workers specifics.

---

## 12. Environments & CI/CD

**One environment, deployed straight from `main`.** No staging/preview tier — keep the demo
simple and the URL stable. Branch protection + the CI gate are what keep `main` releasable.

- **`.github/workflows/ci.yml`** — the **quality gate**. Runs on every PR and on push to
  `main`: `pnpm install --frozen-lockfile` → `pnpm check` (format:check + lint + typecheck +
  test). This is the same gate as the local **`/check`** skill.
- **`.github/workflows/deploy.yml`** — runs on **push to `main`** only:
  1. **quality** — re-runs `pnpm check` (no green gate, no deploy).
  2. **migrate** — runs Drizzle migrations against Neon (`NEON_DATABASE_URL`), only if
     `packages/db` exists.
  3. **discover** — finds every `workers/*` dir containing a `wrangler.{jsonc,toml}`.
  4. **deploy** — matrix over discovered Workers, each via `cloudflare/wrangler-action`
     (`wrangler deploy`). Deploys nothing until the first Worker config lands, so the
     pipeline is safe to merge now.

**Required GitHub repo secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`. Worker runtime secrets are pushed separately via
`wrangler secret put` (or set in the Cloudflare dashboard) — Actions only needs the deploy
token + the migration DB URL.

---

## 13. Open questions

1. **Break mode default** — ship `genuine` (real live factoring, small keys) or `projected`
   (real keys, simulated countdown) as the out-of-the-box pitch default?
2. **Mapping fidelity** — how realistic should Keystone⇄Helix field mapping be? (Mirror the
   real cc-integrations asset/liability mappings, or a representative subset?)
3. **Branding** — neutral demo branding, or skinned for a specific prospect?
4. ✅ **Phase 2 — user/role model** → **no roles.** Any logged-in user can book on the system.
5. ✅ **Phase 2 — trade ownership** → **per-user blotter.** `trades.booked_by` records the booker;
   the booking UI shows that user's own trades. (The pitch view still sees the whole book.)
6. ✅ **Phase 2 — sign-up** → **admin-seeded accounts only.** No public self-registration; seed
   demo users per system (disable Better Auth sign-up, provision via seed/CLI).
7. ✅ **Phase 2 — what the other team consumes** → the **HTTP API** (auth + Zod `POST /trades`).
   Universal (any stack/browser/cloud); no RPC/service-binding entrypoints planned.

---

## 14. Phase 2 — from demo to platform (new requirements)

The M0–M8 build is a working HNDL **demo**. Phase 2 turns the two business systems into
standalone, authenticated, UI-bearing **products**, so a **separate team can build a further
quantum-safe POC layer** on either one independently.

**Requirements (as stated):**

1. Keystone **and** Helix each have a **trade-booking user interface**.
2. Both are **loginable via Better Auth**.
3. Logged-in users can **interact with both systems to book trades**.

**Decisions taken** (see §7 booking UIs, §9 M10–M12, §11a, §13 Q4–Q7):

- **UI placement:** each business worker **serves its own** booking UI (standalone systems), not
  a shared front-end. → `workers/keystone/web`, `workers/helix/web`.
- **Auth:** **separate Better Auth per system** (Keystone login ≠ Helix login), namespaced
  Drizzle tables on the shared Neon DB.
- **Roles:** none — **any logged-in user can book** on that system.
- **Blotter:** **per-user** — `trades.booked_by` records the booker; the UI shows the user's own
  trades (the pitch view still sees the whole book).
- **Accounts:** **admin-seeded only**, no public self-registration (disable Better Auth sign-up).
- **Contract for the other team:** the **HTTP API** (auth + Zod `POST /trades`) — universal, any
  stack/browser/cloud; no RPC entrypoints planned.

**Implications / notes:**

- The business workers gain a **public, auth-gated surface** (login + booking) on top of the
  internal service-binding trust they already have. Internal hops (integration migrate, ui
  injector) stay on Service Bindings and bypass user auth.
- **No new backend pipeline** — booking reuses the existing Zod `POST /trades` + seal/emit path,
  so booked trades still flow through harvest/migrate/break and keep the pitch view live.
- Keep the demo (`ui` pitch/admin) and the product (per-system booking UIs) as **separate
  surfaces** so neither complicates the other.
- The build is currently **paused here** (M0–M8 done); Phase 2 (M10–M12) is queued, not started.
