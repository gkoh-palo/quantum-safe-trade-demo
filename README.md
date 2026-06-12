# Quantum-Safe Trade Migration Demo

A live, deployable demo of the **Harvest-Now-Decrypt-Later (HNDL)** threat against
inter-system trade flows — and how **post-quantum cryptography** defeats it. It pairs a
cinematic pitch view with real, logged-in trade booking on two independent systems.

## Walkthrough video

A short end-to-end tour: booking a trade, harvesting it on the wire, and advancing to the
quantum era to break it.

https://github.com/user-attachments/assets/1d482c55-d7c6-4f54-b5e2-b79d2faa259e

## The story

Two vendor systems exchange trades through an integration layer:

- **Keystone** — books **asset** trades (loans, bonds).
- **Helix** — books **liability** trades (FX, interest-rate swaps, cross-currency swaps).
- An **integration layer** maps and migrates trades between the two.

A passive attacker, **Eve**, taps the wire between the services. She can't break today's
encryption, so she simply records every encrypted payload into her own store. Years later,
once a cryptographically-relevant quantum computer exists, she replays the archive and
decrypts it after the fact — exposing notionals, counterparties, and rates that were meant
to stay confidential for a decade.

The demo lets you switch the protection scheme (plaintext → hashing → classical RSA/ECDH →
a hybrid X25519 + ML-KEM handshake) and then advance the world into the quantum era to show,
live, which harvested traffic Eve can read and which stays sealed.

## Try it live

| What                          | Where                                   | Sign in with                           |
| ----------------------------- | --------------------------------------- | -------------------------------------- |
| Pitch view                    | https://qstd-ui.gkoh.workers.dev/       | — (public)                             |
| Admin control plane           | https://qstd-ui.gkoh.workers.dev/admin  | break-glass token                      |
| Keystone — book asset trades  | https://qstd-keystone.gkoh.workers.dev/ | `demo@keystone.local` / `password1234` |
| Helix — book liability trades | https://qstd-helix.gkoh.workers.dev/    | `demo@helix.local` / `password1234`    |

Full walkthrough and operator notes: **[docs/PLAYBOOK.md](docs/PLAYBOOK.md)**.

## What's real here

- **Real post-quantum crypto** — `@noble/post-quantum` (ML-KEM-768, ML-DSA-65),
  `@noble/curves` (X25519, P-256), and WebCrypto (RSA-OAEP, AES-GCM). No mocked handshakes.
  When the demo "breaks" classical traffic it really does (Shor-style, on shrunken keys in
  the genuine mode); the hybrid post-quantum scheme genuinely never breaks.
- **Real auth** — each system has its own email-and-password login (Better Auth), so the
  trade-booking screens are gated like a real product. Accounts are seeded by an operator.
- **Live database** — Neon Postgres holding trades, migration mappings, the harvested
  packets, and an audit trail.
- **Live deployment** — five Cloudflare Workers wired with service bindings, queues for
  async migration, durable objects for the harvest archive and the era clock, and cron
  triggers that keep a trade feed running on their own.

## The systems

Keystone and Helix are standalone, authenticated products that each serve their own booking
UI and expose a plain HTTP trade API, so another team can build a further quantum-safe layer
on either one without touching the demo. Every booked trade flows through the real encrypt →
wire → harvest → migrate path, so it shows up in the pitch immediately.

## Deploy your own

One script stands the whole thing up on a fresh Cloudflare account — it creates the queues,
builds and deploys the five workers, sets every runtime secret (generating the random ones and
saving them to a gitignored file), runs the database migrations, and seeds the demo users. All
it needs from you is a Neon Postgres URL:

```bash
pnpm install
pnpm exec wrangler login          # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
NEON_DATABASE_URL="postgres://…" ./scripts/setup.sh
```

It's idempotent — re-run it anytime, and it reuses the secrets it generated. Details and the
per-worker breakdown are in the [Playbook](docs/PLAYBOOK.md).

## Docs

- **[docs/PLAYBOOK.md](docs/PLAYBOOK.md)** — how to use the services and how to run a demo.
- **[docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md)** — the narrated pre-sales walkthrough.
- **[docs/PLAN.md](docs/PLAN.md)** — architecture, data model, crypto matrix, deployment.

## Stack

Cloudflare Workers (service bindings, queues, durable objects, cron) · TypeScript (ESM,
strict) · Neon Postgres + Drizzle · Better Auth · React + Vite · pnpm workspaces.

Status: **live and deployed.**
