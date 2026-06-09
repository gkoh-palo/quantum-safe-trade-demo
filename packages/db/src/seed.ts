// Idempotent baseline seed (PLAN §4 / §10 reset). Re-running is safe: each row
// carries a stable idempotency key, so a fresh deploy or demo reset never
// double-inserts. Run with: pnpm --filter @qstd/db seed (needs NEON_DATABASE_URL).
import { productToAssetClass, systemForProduct } from "@qstd/shared";
import type { Product, TradeInput, TradeStatus } from "@qstd/shared";
import { getDb } from "./client.js";
import { cryptoConfigRepo } from "./crypto-config.js";
import { drizzleTradesRepository } from "./repo.js";

interface SeedRow {
  product: Product;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
  tradeDate: string;
  status: TradeStatus;
}

const SEED: SeedRow[] = [
  {
    product: "loan",
    counterparty: "Helios Capital",
    notional: 25_000_000,
    currency: "USD",
    rate: 5.25,
    tenor: "5Y",
    tradeDate: "2026-01-15",
    status: "active",
  },
  {
    product: "bond",
    counterparty: "Northwind Treasury",
    notional: 50_000_000,
    currency: "USD",
    rate: 4.1,
    tenor: "10Y",
    tradeDate: "2026-02-03",
    status: "active",
  },
  {
    product: "bond",
    counterparty: "Sumitomo Mitsui",
    notional: 30_000_000,
    currency: "EUR",
    rate: 3.4,
    tenor: "7Y",
    tradeDate: "2026-02-20",
    status: "active",
  },
  {
    product: "fx",
    counterparty: "Meridian FX",
    notional: 12_000_000,
    currency: "GBP",
    rate: 1.27,
    tenor: "3M",
    tradeDate: "2026-03-01",
    status: "active",
  },
  {
    product: "irs",
    counterparty: "Atlas Derivatives",
    notional: 75_000_000,
    currency: "USD",
    rate: 4.75,
    tenor: "5Y",
    tradeDate: "2026-03-12",
    status: "active",
  },
  {
    product: "ccs",
    counterparty: "Pacific Rim Bank",
    notional: 40_000_000,
    currency: "JPY",
    rate: 0.85,
    tenor: "10Y",
    tradeDate: "2026-03-28",
    status: "active",
  },
];

async function main(): Promise<void> {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is required to seed");
  const db = getDb(url);
  const repo = drizzleTradesRepository(db);

  // Bootstrap the active crypto posture (idempotent: only creates if none active).
  const cfg = await cryptoConfigRepo(db).ensureActive();
  console.warn(`seed: active scheme = ${cfg.scheme} (${cfg.breakMode}, era ${cfg.era})`);

  let created = 0;
  for (const [i, row] of SEED.entries()) {
    const input: TradeInput = {
      ...row,
      system: systemForProduct(row.product),
      assetClass: productToAssetClass(row.product),
    };
    const result = await repo.create(input, `seed-${i}`);
    if (result.created) created += 1;
  }
  console.warn(`seed: ${created} created, ${SEED.length - created} already present`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
