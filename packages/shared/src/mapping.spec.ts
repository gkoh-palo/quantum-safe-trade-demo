import { describe, it, expect } from "vitest";
import type { Trade } from "./trades.js";
import { canonicalTradePayload } from "./wire.js";
import { MAPPING_RULES_VERSION, mapTrade, parseCanonicalTrade } from "./mapping.js";

const sentryLoan: Trade = {
  id: "11111111-1111-1111-1111-111111111111",
  system: "sentry",
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

describe("Sentry⇄Quantum mapping", () => {
  it("re-books a Sentry asset into Quantum's taxonomy, preserving its asset class", () => {
    const { target, direction, rulesVersion } = mapTrade(sentryLoan);
    expect(direction).toBe("sentry->quantum");
    expect(rulesVersion).toBe(MAPPING_RULES_VERSION);
    expect(target).toMatchObject({
      system: "quantum",
      assetClass: "asset", // class is intrinsic — preserved across the migration
      product: "money-market", // loan → Quantum's "Money Market"
      counterparty: "Helios Capital",
      notional: 25_000_000,
      currency: "USD",
    });
  });

  it("re-books a Quantum liability into Sentry's taxonomy, preserving its class", () => {
    const fx: Trade = { ...sentryLoan, system: "quantum", assetClass: "liability", product: "fx" };
    const { target, direction } = mapTrade(fx);
    expect(direction).toBe("quantum->sentry");
    expect(target).toMatchObject({
      system: "sentry",
      assetClass: "liability", // still a liability, just labelled for Sentry
      product: "currency-forward", // fx → Sentry's "Currency Forward"
    });
  });

  it("loan ↔ money-market round-trips", () => {
    const toQuantum = mapTrade(sentryLoan).target;
    expect(toQuantum.product).toBe("money-market");
    const back = mapTrade({ ...sentryLoan, ...toQuantum, id: "x", createdAt: "x" }).target;
    expect(back.product).toBe("loan");
    expect(back.system).toBe("sentry");
  });

  it("parseCanonicalTrade round-trips the sealed payload", () => {
    const parsed = parseCanonicalTrade(canonicalTradePayload(sentryLoan));
    expect(parsed).toMatchObject({
      id: sentryLoan.id,
      product: "loan",
      counterparty: "Helios Capital",
      notional: 25_000_000,
    });
  });
});
