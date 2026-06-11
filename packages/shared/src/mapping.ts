// Keystone⇄Helix migration mapping (PLAN §1/§8). The integration layer opens a trade
// from one system and re-books it into the other — translating the product into that
// system's taxonomy while **preserving the instrument's asset/liability class**. This
// is a product-code translation between two vendor systems, not an economic transform.
import type { Product, System, Trade, TradeInput } from "./trades.js";
import { productToAssetClass } from "./trades.js";

export const MAPPING_RULES_VERSION = "v2";

export type MigrationDirection = "keystone->helix" | "helix->keystone";

// Each product's label in the other system, for the same underlying instrument:
//   Keystone assets → Helix:   loan → money-market, bond → security
//   Helix liabilities → Keystone: fx → currency-forward, irs → interest-rate-swap,
//                                  ccs → cross-currency-swap
// Target products map back to their origin so a migrated trade round-trips.
const PRODUCT_MAP: Record<Product, Product> = {
  loan: "money-market",
  bond: "security",
  fx: "currency-forward",
  irs: "interest-rate-swap",
  ccs: "cross-currency-swap",
  "money-market": "loan",
  security: "bond",
  "currency-forward": "fx",
  "interest-rate-swap": "irs",
  "cross-currency-swap": "ccs",
};

export interface MappingResult {
  target: TradeInput;
  direction: MigrationDirection;
  rulesVersion: string;
}

/** Map a persisted trade into the equivalent trade on the other system. */
export function mapTrade(source: Trade): MappingResult {
  const targetSystem: System = source.system === "keystone" ? "helix" : "keystone";
  const targetProduct = PRODUCT_MAP[source.product];
  return {
    direction: source.system === "keystone" ? "keystone->helix" : "helix->keystone",
    rulesVersion: MAPPING_RULES_VERSION,
    target: {
      system: targetSystem,
      assetClass: productToAssetClass(targetProduct),
      product: targetProduct,
      counterparty: source.counterparty,
      notional: source.notional,
      currency: source.currency,
      rate: source.rate,
      tenor: source.tenor,
      tradeDate: source.tradeDate,
      status: "active",
    },
  };
}

const decoder = new TextDecoder();

/** Parse the canonical trade payload bytes (from crypto.open) back into a Trade. */
export function parseCanonicalTrade(payload: Uint8Array): Trade {
  return JSON.parse(decoder.decode(payload)) as Trade;
}
