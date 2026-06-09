// Trade domain: products, systems, the Zod input schema, and the canonical Trade
// shape shared across workers and (later) the UI. PLAN §1/§4, /api-design skill.
import { z } from "zod";

/** Asset products live in Sentry; liability products live in Quantum. */
export const SENTRY_PRODUCTS = ["loan", "bond"] as const;
export const QUANTUM_PRODUCTS = ["fx", "irs", "ccs"] as const;
export const PRODUCTS = [...SENTRY_PRODUCTS, ...QUANTUM_PRODUCTS] as const;

export const SYSTEMS = ["sentry", "quantum"] as const;
export const ASSET_CLASSES = ["asset", "liability"] as const;
export const TRADE_STATUSES = ["pending", "active", "settled", "cancelled"] as const;

export type Product = (typeof PRODUCTS)[number];
export type System = (typeof SYSTEMS)[number];
export type AssetClass = (typeof ASSET_CLASSES)[number];
export type TradeStatus = (typeof TRADE_STATUSES)[number];

/** loans/bonds are assets (Sentry); fx/irs/ccs are liabilities (Quantum). */
export function productToAssetClass(product: Product): AssetClass {
  return (SENTRY_PRODUCTS as readonly string[]).includes(product) ? "asset" : "liability";
}

/** The system that natively owns a product. */
export function systemForProduct(product: Product): System {
  return productToAssetClass(product) === "asset" ? "sentry" : "quantum";
}

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
