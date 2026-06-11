# Pre-Sales Demo Script

A ~7-minute live walkthrough. Presenter drives the **Admin** view on one screen, audience
watches the **Pitch** view on the main screen. Times are approximate.

> For setup, URLs, logins, and how to use the booking UIs, see the **[Playbook](PLAYBOOK.md)**.
> This file is just the narrated script. (Phase 2: in Act 1 you can also **book a Bond live from
> the Keystone booking UI** instead of the admin injector — same pipeline, more tangible.)

---

## Act 0 — Setup (before the room)

- Open `/pitch` on the projector, `/admin` on your laptop.
- Click **Reset**. Confirm scheme = `plaintext`, era = `classical`, CRQC progress = 0%.
- Leave the trade-generator cron running so the wire is alive.

## Act 1 — "This is how your trades move today" (90s)

- Point at the **live wire**: Bonds/Loans leaving **Keystone**, FX/IRS/CCS leaving **Helix**,
  meeting in the **Integration Layer** that maps and migrates between them.
- **Inject a trade** from Admin: Bond, $50m, "CounterpartyX." Watch it travel.
- Note the small figure tapping the line — **Eve**. "She's passive. She can't break anything.
  She just keeps a copy."

## Act 2 — "Encryption looks safe… today" (90s)

- Switch scheme to **`rsa-oaep`**. The packets visibly become 🔒 ciphertext.
- Open the **inspector** on a captured `wire_message`: show the ciphertext blob. "Eve has
  this. So do you feel safe? Today — yes. She can't read it."
- Let the **loot pile** grow for a few seconds. "Every trade, archived. Cheap. Undetectable.
  This is **Harvest Now**."

## Act 3 — "Decrypt Later" (the payoff) (120s)

- Pull the **"Advance to the Quantum Era"** lever (or ramp CRQC progress to 100%).
- The archive flips: harvested RSA packets go 🔒→🔓. The scorecard ticks up **exposed
  notional** and **leaked counterparties**.
- Inspector now shows **recovered plaintext** — the $50m Bond, CounterpartyX, the rate.
- "The trade was captured _years ago_. It was broken _today_. Nothing she did at capture
  time changed — the math just caught up. That gap on the timeline? It was never safe."

## Act 4 — "Now turn on quantum-safe" (90s)

- **Reset**, set scheme to **`hybrid-mlkem`** (X25519 + ML-KEM-768). Re-run the same trades.
- Eve harvests again — identical capture, identical loot pile.
- Advance to the Quantum Era again. **The packets stay 🔒.** Break engine reports `failed`.
- "Same attacker. Same archive. Same quantum computer. The difference is one library and a
  hybrid handshake. Everything sent after you deploy this is safe — retroactively and forever."

## Act 5 — "Hashing is not the answer" (optional, 45s)

- For the skeptic who says "we hash everything": set scheme to **`sha256`**, advance era.
- Plaintext is **still exposed** — a hash protects integrity, not confidentiality.
- "If your only control is hashing, you have an integrity story, not a confidentiality story.
  HNDL eats it for free."

## Close — Mosca's Inequality (30s)

- Show the one-liner: **X (secrecy lifetime) + Y (migration time) > Z (time to CRQC) ⟹ you're
  already exposed.** "Your trades need to stay private for a decade. Migration takes years.
  The clock started when you captured this room's attention — it actually started years ago."

---

### Failure-mode toggles

- Network/Worker hiccup → switch to **`projected` break mode** (fully server-side, no live factoring).
- Audience wants proof it's real → switch to **`genuine` mode** and let the small-key RSA
  factor live on stage; caption explains the key-size shrink.
