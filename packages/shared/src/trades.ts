// Trade domain: products, systems, the Zod input schema, and the canonical Trade
// shape shared across workers and (later) the UI. PLAN §1/§4, /api-design skill.
import { z } from "zod";

// Products that ORIGINATE in each system — what you can POST. Sentry books assets,
// Quantum books liabilities.
export const SENTRY_PRODUCTS = ["loan", "bond"] as const;
export const QUANTUM_PRODUCTS = ["fx", "irs", "ccs"] as const;

// Products that only appear as MIGRATION TARGETS: the other system's taxonomy for
// the same instrument (the integration translates product codes between vendors).
// A Sentry asset keeps its asset class but is relabelled for Quantum, and vice versa.
export const QUANTUM_TARGET_PRODUCTS = ["money-market", "security"] as const; // assets, in Quantum
export const SENTRY_TARGET_PRODUCTS = [
  "currency-forward",
  "interest-rate-swap",
  "cross-currency-swap",
] as const; // liabilities, in Sentry

export const PRODUCTS = [
  ...SENTRY_PRODUCTS,
  ...QUANTUM_PRODUCTS,
  ...QUANTUM_TARGET_PRODUCTS,
  ...SENTRY_TARGET_PRODUCTS,
] as const;

export const SYSTEMS = ["sentry", "quantum"] as const;
export const ASSET_CLASSES = ["asset", "liability"] as const;
export const TRADE_STATUSES = ["pending", "active", "settled", "cancelled"] as const;

export type Product = (typeof PRODUCTS)[number];
export type System = (typeof SYSTEMS)[number];
export type AssetClass = (typeof ASSET_CLASSES)[number];
export type TradeStatus = (typeof TRADE_STATUSES)[number];

// Asset-class is intrinsic to the instrument and preserved across a migration —
// loans/bonds (and their Quantum labels money-market/security) are assets; the rest
// (fx/irs/ccs and their Sentry labels) are liabilities.
const ASSET_PRODUCTS = new Set<string>([...SENTRY_PRODUCTS, ...QUANTUM_TARGET_PRODUCTS]);
// Which system a product lives in (origins + the targets booked into each).
const SENTRY_RESIDENT = new Set<string>([...SENTRY_PRODUCTS, ...SENTRY_TARGET_PRODUCTS]);

export function productToAssetClass(product: Product): AssetClass {
  return ASSET_PRODUCTS.has(product) ? "asset" : "liability";
}

/** The system a product lives in (origins natively; targets once migrated in). */
export function systemForProduct(product: Product): System {
  return SENTRY_RESIDENT.has(product) ? "sentry" : "quantum";
}

/** Human-facing product labels for the UI. */
export const PRODUCT_LABELS: Record<Product, string> = {
  loan: "Loan",
  bond: "Bond",
  fx: "FX",
  irs: "IRS",
  ccs: "CCS",
  "money-market": "Money Market",
  security: "Security",
  "currency-forward": "Currency Forward",
  "interest-rate-swap": "Interest Rate Swaps",
  "cross-currency-swap": "Cross Currency Swaps",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the create-trade body schema for a specific worker, restricting `product`
 * to that system's products (so Sentry rejects an FX trade with a 400, etc.).
 */
export function makeCreateTradeSchema<T extends readonly [string, ...string[]]>(products: T) {
  return z.object({
    product: z.enum(products),
    counterparty: z.string().min(1).max(120),
    notional: z.number().positive(),
    currency: z.string().length(3),
    rate: z.number(),
    tenor: z.string().min(1).max(20),
    tradeDate: z.string().regex(ISO_DATE, "expected YYYY-MM-DD").optional(),
    status: z.enum(TRADE_STATUSES).default("active"),
  });
}

/** The validated body of any create-trade request (product not yet system-checked). */
export interface CreateTradeBody {
  product: Product;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
  tradeDate?: string;
  status: TradeStatus;
}

/** A trade ready to persist — enriched with system + derived asset class. */
export interface TradeInput {
  system: System;
  assetClass: AssetClass;
  product: Product;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
  tradeDate: string;
  status: TradeStatus;
}

/** A persisted trade, as returned over the wire. */
export interface Trade extends TradeInput {
  id: string;
  createdAt: string;
}

const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** Enrich a validated body into a persistable TradeInput for the given system. */
export function toTradeInput(body: CreateTradeBody, system: System): TradeInput {
  return {
    system,
    assetClass: productToAssetClass(body.product),
    product: body.product,
    counterparty: body.counterparty,
    notional: body.notional,
    currency: body.currency.toUpperCase(),
    rate: body.rate,
    tenor: body.tenor,
    tradeDate: body.tradeDate ?? todayISO(),
    status: body.status,
  };
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** Parse + clamp a `limit` query param into [1, MAX_PAGE_LIMIT]. */
export function clampLimit(raw: string | undefined | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}
