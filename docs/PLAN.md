# Build Plan — Quantum-Safe Trade Migration Demo

> Goal: a live, deployed simulation proving the Harvest-Now-Decrypt-Later threat against
> a Sentry↔Quantum trade integration, with a presenter-controllable PQC defence.

---

## 1. Actors & narrative

| Actor | Role | Asset classes | Notes |
|---|---|---|---|
| **Sentry** | Vendor system, **asset** trades | Loans, Bonds | Source/target of migration |
| **Quantum** | Vendor system, **liability** trades | FX, IRS, CCS | Source/target of migration |
| **Integration Layer** | Maps & migrates trades both directions | — | Re-shapes + re-encrypts payloads; the richest interception point |
| **Eve (Hacker)** | Passive wiretap — *harvest now, decrypt later* | — | Mirrors every wire message to a loot store; breaks it once the "quantum era" arrives |

**Plot beats the presenter controls:**
1. Trades flow Sentry ↔ Quantum (auto-generated + manual).
2. Every inter-service message is encrypted under the **current scheme** and mirrored to Eve's archive.
3. Today (classical era) Eve can't read protected traffic — she just stores it.
4. Presenter flips **"Advance to the Quantum Era."**
5. Eve runs her break engine over the archive:
   - plaintext / hash-only → readable (teaches *hashing ≠ encryption*)
   - classical RSA / ECDH → **broken** (Shor) → trade economics exposed
   - **hybrid X25519 + ML-KEM** → break **fails** → traffic stays opaque
6. Dashboards quantify the damage: % harvested, % broken, $ notional exposed, counterparties leaked.

> **Naming note:** in the real cc-integrations codebase "Sentry→Quantum" is the asset
> integration flow. Here both are treated as independent vendor systems (Sentry=assets,
> Quantum=liabilities) so the migration is genuinely bidirectional. The pun — that the
> *Quantum* system is undone by *quantum* computing — is intentional and good pitch theatre.

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
│ sentry-worker │ ────────────────▶ │ integration-worker │ ───────────────▶│ quantum-worker│
│ assets        │ ◀──────────────── │ map + re-encrypt   │ ◀───────────────│ liabilities   │
│ loans / bonds │   via Queue       │ (Sentry⇄Quantum)   │   via Queue     │ FX / IRS / CCS│
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

**Why 5 Workers** (3 services + UI + hacker): the "3 webservices" are sentry/quantum/integration.
`hacker` and `ui` are infrastructure for the demo, not part of the simulated business flow.

**Modelling the wiretap honestly.** Cloudflare Service Bindings can't be truly
man-in-the-middled, so each sender *also* mirrors the exact ciphertext bytes to the
hacker tap. This faithfully models a **passive network sniffer** (which is the real HNDL
threat model) — Eve never sees plaintext or private keys at capture time, only what
travels on the wire.

---

## 3. Cloudflare resource map

| Resource | Name | Purpose |
|---|---|---|
| Worker | `sentry` | Asset-trade REST API; encrypts + emits wire messages |
| Worker | `quantum` | Liability-trade REST API; receives migrated trades |
| Worker | `integration` | Queue consumer; maps + re-encrypts + forwards |
| Worker | `hacker` | Harvest tap + break engine |
| Worker | `ui` | Static React assets + BFF/admin endpoints |
| Queue | `trade-migration` | Async Sentry⇄Quantum handoff (producer: sentry/quantum, consumer: integration) |
| Queue | `harvest-tap` | Fan-out of ciphertext to the hacker (decouples capture from break) |
| Durable Object | `EpochClock` | Single global era state (classical/quantum) + CRQC progress % |
| Durable Object | `HarvestArchive` | Append-only loot log, break orchestration, per-key cache |
| Cron | `*/1 * * * *` | `trade-generator` — emits random trades to keep the feed live |
| Cron | `*/2 * * * *` | `epoch-tick` — advances CRQC progress when in auto mode |
| Hyperdrive (opt.) | `neon` | Pooled Postgres access from Workers |

Secrets via `wrangler secret`: `NEON_DATABASE_URL`, `ADMIN_TOKEN`, per-service `SIGNING_SEED`.

---

## 4. Data model (Neon Postgres, via Drizzle ORM)

```sql
-- current security posture (single active row, versioned for audit)
crypto_config(
  id, active boolean, scheme text,            -- see §5 scheme matrix
  era text,                                    -- 'classical' | 'quantum'
  crqc_progress int,                           -- 0..100, drives the break
  kem_public_key bytea, kem_secret_ref text,   -- ML-KEM keypair handle
  classical_pub bytea, classical_priv_size int,-- RSA/ECDH (priv kept server-side)
  created_at, updated_at
)

trades(
  id uuid, system text,                        -- 'sentry' | 'quantum'
  asset_class text,                            -- 'asset' | 'liability'
  product text,                                -- loan|bond|fx|irs|ccs
  counterparty text, notional numeric, currency text,
  rate numeric, tenor text, trade_date date, status text,
  payload_json jsonb,                          -- canonical trade body
  created_at
)

mappings(
  id uuid, source_trade_id uuid, target_trade_id uuid,
  direction text,                              -- 'sentry->quantum' | 'quantum->sentry'
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

Admin selects the **active scheme**; it governs how `integration`/`sentry`/`quantum`
protect each wire message. Each scheme has a defined *break outcome* in the quantum era.

| Scheme key | Construction | Confidentiality | Quantum-safe? | Quantum-era outcome |
|---|---|---|---|---|
| `plaintext` | none | ❌ none | n/a | readable immediately (baseline shock) |
| `sha256` | hash of payload only | ❌ none (integrity) | n/a | teaches **hash ≠ encryption** — still readable |
| `hmac-sha256` | keyed MAC, no encryption | ❌ none (auth) | symmetric-ok | still readable; shows auth ≠ confidentiality |
| `rsa-oaep` | RSA-OAEP wrap + AES-GCM | ✅ | ❌ **no** | **broken** by Shor → plaintext recovered |
| `ecdh-aes` | ECDH(P-256) → HKDF → AES-GCM | ✅ | ❌ **no** | **broken** by Shor (DLP) → recovered |
| `hybrid-mlkem` | X25519 **+ ML-KEM-768** → HKDF → AES-GCM | ✅ | ✅ **yes** | **break fails** — stays opaque |
| signatures | `ecdsa-p256` vs **`ml-dsa-65`** | integrity/auth | classical forgeable | quantum era can **forge** ECDSA, not ML-DSA |

**Honesty about "the break."** RSA-2048 / P-256 cannot be factored on a laptop. Two modes,
both presenter-selectable, both labelled in the UI so the demo never lies:

- **`genuine` mode** — classical path uses a deliberately *small* key (e.g. RSA-512 or a
  toy curve) so Eve's break **actually runs live** in seconds via `sympy`-style factoring /
  Pollard-rho (ported to JS/WASM). Caption: *"We shrank the key so it breaks in seconds; a
  CRQC does this to 2048-bit in hours."*
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
│  ├─ shared/                    # types, trade schemas (zod), Sentry⇄Quantum mapping rules
│  ├─ crypto/                    # scheme registry: seal()/open()/sign()/verify()/break()
│  └─ db/                        # drizzle schema, migrations, seed, neon client
├─ workers/
│  ├─ sentry/                    # asset-trade API   (wrangler.toml + src)
│  ├─ quantum/                   # liability-trade API
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

## 7. Front-end: two views

### Pitch view (`/pitch`) — cinematic, presenter-facing
- **Live wire** — animated packets flowing Sentry ⇄ Integration ⇄ Quantum; Eve's tap
  pulling a copy aside into a growing "loot pile."
- **HNDL timeline** — the signature visual: a capture marker at *today* connected by a
  long line to a break marker in the *quantum era*; the gap is labelled
  *"years of confidentiality that were never actually there."*
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

---

## 8. Request/data flow (one migrated trade)

1. `POST /trades` on **sentry** (Bond, $50m, CounterpartyX).
2. sentry persists trade, builds canonical payload, **`crypto.seal(payload, scheme)`**,
   writes a `wire_messages` row, **enqueues** to `trade-migration`, and **mirrors
   ciphertext** to `harvest-tap`.
3. **hacker** consumes `harvest-tap` → `HarvestArchive` DO appends → `harvested_packets` row
   (`broken=false`). Eve now holds the ciphertext forever.
4. **integration** consumes `trade-migration` → `crypto.open()` (it legitimately holds keys)
   → maps Bond → the Quantum-side representation (`mappings` row) → **re-seals** →
   forwards to **quantum** (+ mirrors to tap again).
5. **quantum** opens, persists the liability-side trade, acks.
6. Presenter advances era → **hacker** break engine iterates `harvested_packets`, applies
   the §5 outcome per `scheme`, writes `recovered_plaintext` / `failed`, updates scorecard.

---

## 9. Milestones

| # | Milestone | Deliverable |
|---|---|---|
| M0 | Scaffolding | workspaces, turbo, 5 `wrangler.toml`, CI, Neon project created |
| M1 | Data + trades | drizzle schema + migrations + seed; sentry & quantum CRUD |
| M2 | Crypto registry | `packages/crypto` with all §5 schemes: seal/open/sign/verify + tests |
| M3 | Wire + harvest | wire_messages, Queues, harvest-tap, HarvestArchive DO |
| M4 | Break + era | EpochClock DO, break engine (genuine + projected), scorecard query |
| M5 | Integration mapper | Sentry⇄Quantum mapping rules, bidirectional migration via queue |
| M6 | Pitch UI | live wire, HNDL timeline, the switch, scorecard |
| M7 | Admin UI | scheme/break-mode/CRQC controls, trade injector, inspector |
| M8 | Deploy + crons | service bindings, secrets, cron feeds, end-to-end on Cloudflare |
| M9 | Polish | demo script rehearsal, reset button, copy/captions, fallbacks |

**Critical path:** M2 (crypto) gates M3/M4; M3+M4 gate the pitch payoff (M6). Build M2 first
and hardest — everything credible flows from it.

---

## 10. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| Real PQC break impossible to show live | Two explicit modes (§5); never claim to break PQC |
| Factoring RSA-2048 live is infeasible | `genuine` mode uses small keys; caption the shrink honestly |
| Workers can't truly MITM bindings | Model passive sniffer via ciphertext mirror — the correct HNDL model anyway |
| `@noble/post-quantum` bundle size / CPU on Workers | Pre-warm keys; cache KEM keypair in DO; ML-KEM-768 is fast (<5ms) |
| Neon cold starts in Workers | `@neondatabase/serverless` HTTP driver or Hyperdrive pooling |
| Demo state drift between runs | One-click **reset** + idempotent seed |
| Live-demo network failure | `projected` mode runs fully server-side; record a fallback video |

---

## 11. Open questions for the next session

1. **Break mode default** — ship `genuine` (real live factoring, small keys) or `projected`
   (real keys, simulated countdown) as the out-of-the-box pitch default?
2. **Mapping fidelity** — how realistic should Sentry⇄Quantum field mapping be? (Mirror the
   real cc-integrations asset/liability mappings, or a representative subset?)
3. **Auth on the live deployment** — is `ADMIN_TOKEN` enough, or do we need Cloudflare Access
   in front of `/admin` for a public-facing pitch URL?
4. **Branding** — neutral demo branding, or skinned for a specific prospect?
