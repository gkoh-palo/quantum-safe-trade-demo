import { describe, it, expect } from "vitest";
import type { Trade } from "./trades.js";
import { canonicalTradePayload } from "./wire.js";
import { MAPPING_RULES_VERSION, mapTrade, parseCanonicalTrade } from "./mapping.js";

const keystoneLoan: Trade = {
  id: "11111111-1111-1111-1111-111111111111",
  system: "keystone",
  assetClass: "asset",
  product: "loan",
  counterparty: "Helios Capital",
  notional: 25_000_000,
  currency: "USD",
  rate: 5.25,
  tenor: "5Y",
  tradeDate: "2026-01-15",
  status: "active",
  createdAt: "2026-01-15T00:00:00.000Z",
};

describe("Keystone⇄Helix mapping", () => {
  it("re-books a Keystone asset into Helix's taxonomy, preserving its asset class", () => {
    const { target, direction, rulesVersion } = mapTrade(keystoneLoan);
    expect(direction).toBe("keystone->helix");
    expect(rulesVersion).toBe(MAPPING_RULES_VERSION);
    expect(target).toMatchObject({
      system: "helix",
      assetClass: "asset", // class is intrinsic — preserved across the migration
      product: "money-market", // loan → Helix's "Money Market"
      counterparty: "Helios Capital",
      notional: 25_000_000,
      currency: "USD",
    });
  });

  it("re-books a Helix liability into Keystone's taxonomy, preserving its class", () => {
    const fx: Trade = { ...keystoneLoan, system: "helix", assetClass: "liability", product: "fx" };
    const { target, direction } = mapTrade(fx);
    expect(direction).toBe("helix->keystone");
    expect(target).toMatchObject({
      system: "keystone",
      assetClass: "liability", // still a liability, just labelled for Keystone
      product: "currency-forward", // fx → Keystone's "Currency Forward"
    });
  });

  it("loan ↔ money-market round-trips", () => {
    const toHelix = mapTrade(keystoneLoan).target;
    expect(toHelix.product).toBe("money-market");
    const back = mapTrade({ ...keystoneLoan, ...toHelix, id: "x", createdAt: "x" }).target;
    expect(back.product).toBe("loan");
    expect(back.system).toBe("keystone");
  });

  it("parseCanonicalTrade round-trips the sealed payload", () => {
    const parsed = parseCanonicalTrade(canonicalTradePayload(keystoneLoan));
    expect(parsed).toMatchObject({
      id: keystoneLoan.id,
      product: "loan",
      counterparty: "Helios Capital",
      notional: 25_000_000,
    });
  });
});
