import { describe, it, expect } from "vitest";
import {
  HELIX_PRODUCTS,
  KEYSTONE_PRODUCTS,
  clampLimit,
  makeCreateTradeSchema,
  productToAssetClass,
  randomTradeBody,
  systemForProduct,
  toTradeInput,
} from "./trades.js";

describe("trade domain helpers", () => {
  it("maps products to asset class and owning system", () => {
    expect(productToAssetClass("loan")).toBe("asset");
    expect(productToAssetClass("ccs")).toBe("liability");
    expect(systemForProduct("bond")).toBe("keystone");
    expect(systemForProduct("fx")).toBe("helix");
  });

  it("clampLimit defaults to 50 and caps at 200", () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit("0")).toBe(50);
    expect(clampLimit("abc")).toBe(50);
    expect(clampLimit("10")).toBe(10);
    expect(clampLimit("9999")).toBe(200);
  });

  it("toTradeInput enriches system/assetClass, uppercases currency, defaults date", () => {
    const input = toTradeInput(
      {
        product: "bond",
        counterparty: "X",
        notional: 1,
        currency: "eur",
        rate: 1,
        tenor: "5Y",
        status: "active",
      },
      "keystone",
    );
    expect(input).toMatchObject({ system: "keystone", assetClass: "asset", currency: "EUR" });
    expect(input.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("randomTradeBody produces a valid trade for the system (cron feed)", () => {
    for (let i = 0; i < 30; i++) {
      const s = randomTradeBody("keystone");
      expect(KEYSTONE_PRODUCTS).toContain(s.product);
      expect(s.notional).toBeGreaterThanOrEqual(5_000_000);
      expect(s.currency).toHaveLength(3);
      const q = randomTradeBody("helix");
      expect(HELIX_PRODUCTS).toContain(q.product);
    }
  });

  it("the create schema restricts products to the worker's system", () => {
    const schema = makeCreateTradeSchema(KEYSTONE_PRODUCTS);
    expect(
      schema.safeParse({
        product: "bond",
        counterparty: "X",
        notional: 1,
        currency: "USD",
        rate: 1,
        tenor: "5Y",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        product: "fx",
        counterparty: "X",
        notional: 1,
        currency: "USD",
        rate: 1,
        tenor: "5Y",
      }).success,
    ).toBe(false);
  });
});
