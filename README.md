# Quantum-Safe Trade Migration Demo

A live, deployable simulation that demonstrates the **Harvest-Now-Decrypt-Later (HNDL)**
threat against inter-system trade flows — and how **post-quantum cryptography (PQC)**
defeats it. Built for a pre-sales pitch with an interactive admin control plane.

## The story (one paragraph)

Two vendor systems exchange trades through an integration layer:

- **Sentry** — executes **asset** trades (Loans, Bonds)
- **Quantum** — executes **liability** trades (FX, IRS, CCS)
- **Integration Layer** — maps & migrates trades **Sentry ↔ Quantum**

A passive attacker, **Eve**, taps the wire between the services. She cannot break the
encryption *today*, so she just **records every encrypted payload** into her own loot
database. Years later, when a cryptographically-relevant quantum computer (CRQC) exists,
she replays the archive and **decrypts it retroactively** — exposing notionals,
counterparties and rates that were supposed to stay confidential for a decade.

The demo lets a presenter **toggle the protection scheme** (plaintext → hash → classical
RSA/ECDH → **hybrid X25519 + ML-KEM**) and **advance the world into the quantum era** to
show, live, which harvested traffic Eve can read and which stays opaque.

## What's real here

- **Real PQC** — `@noble/post-quantum` (ML-KEM-768, ML-DSA-65), `@noble/curves`
  (X25519, P-256), WebCrypto (RSA-OAEP, AES-GCM). No mocked handshakes.
- **Live database** — Neon Postgres, holding trades, mappings, harvested packets and audit log.
- **Live deployment** — 5 Cloudflare Workers wired with Service Bindings, a Queue for
  async migration, Durable Objects for the harvest archive and the "epoch clock", and
  Cron Triggers driving a live trade feed.
- **Two front-ends** — a cinematic **Pitch** view and an **Admin** control plane.

## Where to start

- **[docs/PLAN.md](docs/PLAN.md)** — the full build plan: architecture, data model,
  crypto matrix, repo layout, deployment, and milestones.
- **[docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md)** — the exact pre-sales walkthrough.

> Status: **planning**. No code scaffolded yet — this repo currently holds the design.
