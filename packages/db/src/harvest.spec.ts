import { describe, it, expect } from "vitest";
import type { BreakMode, EncryptionScheme } from "@qstd/crypto";
import { generateEncryptionKeys, seal } from "@qstd/crypto";
import { canonicalTradePayload } from "@qstd/shared";
import type { TradeInput } from "@qstd/shared";
import { runBreakBatch, summarizeScorecard } from "./harvest.js";
import type { BreakOutcome, HarvestBreakRepo, UnattemptedPacket } from "./harvest.js";
import { sealedToEnvelope } from "./wire.js";

const TRADE: TradeInput = {
  system: "keystone",
  assetClass: "asset",
  product: "bond",
  counterparty: "Northwind Treasury",
  notional: 50_000_000,
  currency: "USD",
  rate: 4.1,
  tenor: "10Y",
  tradeDate: "2026-02-03",
  status: "active",
};

class FakeBreakRepo implements HarvestBreakRepo {
  readonly outcomes = new Map<string, BreakOutcome>();
  constructor(private readonly packets: UnattemptedPacket[]) {}
  async listUnattempted(): Promise<UnattemptedPacket[]> {
    return this.packets.filter((p) => !this.outcomes.has(p.id));
  }
  async markAttempted(id: string, outcome: BreakOutcome): Promise<void> {
    this.outcomes.set(id, outcome);
  }
}

async function packetFor(scheme: EncryptionScheme, mode: BreakMode) {
  const keys = await generateEncryptionKeys(scheme, mode);
  const sealed = await seal(scheme, canonicalTradePayload(TRADE), keys);
  const envelope = sealedToEnvelope("wm-1", "keystone", "helix", "classical", sealed);
  const repo = new FakeBreakRepo([{ id: "p1", scheme, envelope }]);
  return { keys, repo };
}

describe("break engine (runBreakBatch)", () => {
  it("genuine: classical rsa-oaep is recovered with exposed economics", async () => {
    const { keys, repo } = await packetFor("rsa-oaep", "genuine");
    const summary = await runBreakBatch(repo, {
      scheme: "rsa-oaep",
      mode: "genuine",
      crqcProgress: 100,
      keys,
    });

    expect(summary.recovered).toBe(1);
    expect(summary.exposedNotional).toBe(50_000_000);
    const outcome = repo.outcomes.get("p1");
    expect(outcome?.broken).toBe(true);
    expect(outcome?.breakMethod).toBe("shor-rsa");
    expect(outcome?.exposedCounterparty).toBe("Northwind Treasury");
  });

  it("hybrid-mlkem is never recovered — marked permanently protected", async () => {
    const { keys, repo } = await packetFor("hybrid-mlkem", "genuine");
    const summary = await runBreakBatch(repo, {
      scheme: "hybrid-mlkem",
      mode: "genuine",
      crqcProgress: 100,
      keys,
    });

    expect(summary.recovered).toBe(0);
    expect(summary.protectedCount).toBe(1);
    expect(repo.outcomes.get("p1")).toMatchObject({ broken: false, breakMethod: "failed" });
  });

  it("projected: gated below 100% (left for a later pass), recovered at 100%", async () => {
    const { keys, repo } = await packetFor("rsa-oaep", "projected");

    const gated = await runBreakBatch(repo, {
      scheme: "rsa-oaep",
      mode: "projected",
      crqcProgress: 60,
      keys,
    });
    expect(gated.recovered).toBe(0);
    expect(gated.gatedSkipped).toBe(1);
    expect(repo.outcomes.has("p1")).toBe(false); // not marked → retried later

    const done = await runBreakBatch(repo, {
      scheme: "rsa-oaep",
      mode: "projected",
      crqcProgress: 100,
      keys,
    });
    expect(done.recovered).toBe(1);
    expect(repo.outcomes.get("p1")?.broken).toBe(true);
  });

  it("skips packets sealed under a different scheme than the active keyring", async () => {
    const { keys, repo } = await packetFor("ecdh-aes", "genuine");
    // active scheme is rsa-oaep, but the packet is ecdh-aes → skipped, not attempted
    const summary = await runBreakBatch(repo, {
      scheme: "rsa-oaep",
      mode: "genuine",
      crqcProgress: 100,
      keys,
    });
    expect(summary.attempted).toBe(0);
    expect(repo.outcomes.size).toBe(0);
  });

  it("isolates a packet sealed under a different keyring — one bad packet can't abort the batch", async () => {
    const keys = await generateEncryptionKeys("rsa-oaep", "projected");
    const orphanKeys = await generateEncryptionKeys("rsa-oaep", "projected");
    const good = await seal("rsa-oaep", canonicalTradePayload(TRADE), keys);
    const orphan = await seal("rsa-oaep", canonicalTradePayload(TRADE), orphanKeys);
    const repo = new FakeBreakRepo([
      {
        id: "good",
        scheme: "rsa-oaep",
        envelope: sealedToEnvelope("wm-good", "keystone", "helix", "classical", good),
      },
      {
        id: "orphan",
        scheme: "rsa-oaep",
        envelope: sealedToEnvelope("wm-orphan", "keystone", "helix", "classical", orphan),
      },
    ]);

    const summary = await runBreakBatch(repo, {
      scheme: "rsa-oaep",
      mode: "projected",
      crqcProgress: 100,
      keys,
    });

    expect(summary.recovered).toBe(1); // the matching packet still breaks
    expect(summary.errored).toBe(1); // the orphan is isolated, not fatal
    expect(repo.outcomes.get("good")?.broken).toBe(true);
    expect(repo.outcomes.get("orphan")).toMatchObject({ broken: false, breakMethod: "error" });
  });
});

describe("scorecard (summarizeScorecard)", () => {
  it("rolls up harvested / broken / protected, exposed notional and leaked counterparties", () => {
    const card = summarizeScorecard([
      { scheme: "rsa-oaep", broken: true, exposedNotional: "50000000", exposedCounterparty: "A" },
      { scheme: "rsa-oaep", broken: true, exposedNotional: "30000000", exposedCounterparty: "B" },
      { scheme: "rsa-oaep", broken: true, exposedNotional: "20000000", exposedCounterparty: "A" }, // dup cpty
      { scheme: "hybrid-mlkem", broken: false, exposedNotional: null, exposedCounterparty: null },
      { scheme: "hybrid-mlkem", broken: false, exposedNotional: null, exposedCounterparty: null },
    ]);

    expect(card.totals).toEqual({
      harvested: 5,
      broken: 3,
      protected: 2,
      exposedNotional: 100_000_000,
      leakedCounterparties: 2, // A, B (A deduped)
    });

    const rsa = card.byScheme.find((s) => s.scheme === "rsa-oaep");
    expect(rsa).toMatchObject({
      harvested: 3,
      broken: 3,
      exposedNotional: 100_000_000,
      leakedCounterparties: 2,
      quantumSafe: false,
    });

    const hybrid = card.byScheme.find((s) => s.scheme === "hybrid-mlkem");
    expect(hybrid).toMatchObject({ harvested: 2, broken: 0, protected: 2, quantumSafe: true });
  });
});
