// Sentry⇄Quantum migration mapping (PLAN §1/§8). The integration layer opens a
// trade from one system and re-shapes it into its counterpart on the other.
//
// PLAN §13 Q2 (mapping fidelity) is left as a *representative* product map, not the
// real cc-integrations asset/liability rules — enough to make the bidirectional
// migration real and demonstrable. Swap in richer rules later without touching the
// pipeline; the rulesVersion lets us tell them apart.
import type { Product, System, Trade, TradeInput } from "./trades.js";
import { productToAssetClass } from "./trades.js";

export const MAPPING_RULES_VERSION = "v1";

export type MigrationDirection = "sentry->quantum" | "quantum->sentry";

// Each product maps to a counterpart on the other system. Assets (loan/bond) ⇄
// liabilities (fx/irs/ccs). loan↔irs and bond↔ccs round-trip; fx maps inbound to bond.
const PRODUCT_MAP: Record<Product, Product> = {
  loan: "irs", // interest-bearing loan → interest-rate swap
  bond: "ccs", // bond → cross-currency swap
  fx: "bond",
  irs: "loan",
  ccs: "bond",
};

export interface MappingResult {
  target: TradeInput;
  direction: MigrationDirection;
  rulesVersion: string;
}

/** Map a persisted trade into the equivalent trade on the other system. */
export function mapTrade(source: Trade): MappingResult {
  const targetSystem: System = source.system === "sentry" ? "quantum" : "sentry";
  const targetProduct = PRODUCT_MAP[source.product];
  return {
    direction: source.system === "sentry" ? "sentry->quantum" : "quantum->sentry",
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
