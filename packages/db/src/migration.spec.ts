import { describe, it, expect } from "vitest";
import { generateEncryptionKeys, open, seal } from "@qstd/crypto";
import { canonicalTradePayload, mapTrade, parseCanonicalTrade } from "@qstd/shared";
import type { Trade } from "@qstd/shared";
import { envelopeToSealed, sealedToEnvelope } from "./wire.js";

const source: Trade = {
  id: "22222222-2222-2222-2222-222222222222",
  system: "sentry",
  assetClass: "asset",
  product: "bond",
  counterparty: "Northwind Treasury",
  notional: 50_000_000,
  currency: "USD",
  rate: 4.1,
  tenor: "10Y",
  tradeDate: "2026-02-03",
  status: "active",
  createdAt: "2026-02-03T00:00:00.000Z",
};

// The integration step's crypto+mapping core, without the DB: a sealed wire message
// is opened by the legitimate key holder and mapped to the counterpart system.
describe("integration open → map pipeline", () => {
  it("opens a sealed trade and maps it across systems", async () => {
    const keys = await generateEncryptionKeys("rsa-oaep", "projected");
    const sealed = await seal("rsa-oaep", canonicalTradePayload(source), keys);
    const envelope = sealedToEnvelope("wm-1", "sentry", "quantum", "classical", sealed);

    const opened = parseCanonicalTrade(await open(envelopeToSealed(envelope), keys));
    expect(opened.id).toBe(source.id);

    const { target, direction } = mapTrade(opened);
    expect(direction).toBe("sentry->quantum");
    expect(target).toMatchObject({
      system: "quantum",
      assetClass: "liability",
      product: "ccs", // bond → cross-currency swap
      counterparty: "Northwind Treasury",
      notional: 50_000_000,
    });
  });
});
