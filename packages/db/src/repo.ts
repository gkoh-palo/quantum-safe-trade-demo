// TradesRepository — the data-access seam the workers depend on. A Drizzle-backed
// implementation for production and an in-memory one for tests (so route handlers
// are fully testable without a live Neon database, which the CI gate has no URL for).
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { System, Trade, TradeInput } from "@qstd/shared";
import type { Database } from "./client.js";
import { trades } from "./schema.js";

export interface ListOptions {
  system?: System;
  /** Phase 2: scope the blotter to one booker. */
  bookedBy?: string;
  limit: number;
  cursor?: string | null;
}

export interface ListResult {
  data: Trade[];
  nextCursor: string | null;
}

export interface CreateResult {
  trade: Trade;
  /** false when an idempotency key matched an existing trade (replay). */
  created: boolean;
}

export interface TradesRepository {
  create(input: TradeInput, idempotencyKey?: string | null): Promise<CreateResult>;
  list(opts: ListOptions): Promise<ListResult>;
  get(id: string): Promise<Trade | null>;
}

// --- opaque keyset cursor: base64("<createdAtISO>|<id>") --------------------

interface Cursor {
  createdAt: string;
  id: string;
}

const encodeCursor = (c: Cursor): string => btoa(`${c.createdAt}|${c.id}`);

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = atob(raw).split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// --- Drizzle-backed implementation -----------------------------------------

type Row = typeof trades.$inferSelect;

function rowToTrade(row: Row): Trade {
  return {
    id: row.id,
    system: row.system as System,
    assetClass: row.assetClass as Trade["assetClass"],
    product: row.product as Trade["product"],
    counterparty: row.counterparty,
    notional: Number(row.notional),
    currency: row.currency,
    rate: Number(row.rate),
    tenor: row.tenor,
    tradeDate: row.tradeDate,
    status: row.status as Trade["status"],
    bookedBy: row.bookedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

const insertValues = (input: TradeInput, idempotencyKey: string | null) => ({
  system: input.system,
  assetClass: input.assetClass,
  product: input.product,
  counterparty: input.counterparty,
  notional: String(input.notional),
  currency: input.currency,
  rate: String(input.rate),
  tenor: input.tenor,
  tradeDate: input.tradeDate,
  status: input.status,
  payloadJson: input,
  bookedBy: input.bookedBy ?? null,
  idempotencyKey,
});

export function drizzleTradesRepository(db: Database): TradesRepository {
  return {
    async create(input, idempotencyKey = null) {
      if (idempotencyKey) {
        const existing = await db
          .select()
          .from(trades)
          .where(eq(trades.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing[0]) return { trade: rowToTrade(existing[0]), created: false };
      }
      const inserted = await db
        .insert(trades)
        .values(insertValues(input, idempotencyKey))
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("trades.create: insert returned no row");
      return { trade: rowToTrade(row), created: true };
    },

    async list({ system, bookedBy, limit, cursor }) {
      const c = decodeCursor(cursor);
      const conditions = [
        system ? eq(trades.system, system) : undefined,
        bookedBy ? eq(trades.bookedBy, bookedBy) : undefined,
        c
          ? or(
              lt(trades.createdAt, new Date(c.createdAt)),
              and(eq(trades.createdAt, new Date(c.createdAt)), lt(trades.id, c.id)),
            )
          : undefined,
      ].filter(Boolean);

      const rows = await db
        .select()
        .from(trades)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(trades.createdAt), desc(trades.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit).map(rowToTrade);
      const last = page[page.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null;
      return { data: page, nextCursor };
    },

    async get(id) {
      const rows = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
      return rows[0] ? rowToTrade(rows[0]) : null;
    },
  };
}

// --- In-memory implementation (tests / local) ------------------------------

const afterCursor = (t: Trade, c: Cursor): boolean =>
  t.createdAt < c.createdAt || (t.createdAt === c.createdAt && t.id < c.id);

export class InMemoryTradesRepository implements TradesRepository {
  private readonly rows: Trade[] = [];
  private readonly byKey = new Map<string, Trade>();

  async create(input: TradeInput, idempotencyKey: string | null = null): Promise<CreateResult> {
    if (idempotencyKey) {
      const existing = this.byKey.get(idempotencyKey);
      if (existing) return { trade: existing, created: false };
    }
    const trade: Trade = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.rows.push(trade);
    if (idempotencyKey) this.byKey.set(idempotencyKey, trade);
    return { trade, created: true };
  }

  async list({ system, bookedBy, limit, cursor }: ListOptions): Promise<ListResult> {
    const c = decodeCursor(cursor);
    const sorted = [...this.rows]
      .filter((t) => (system ? t.system === system : true))
      .filter((t) => (bookedBy ? t.bookedBy === bookedBy : true))
      .filter((t) => (c ? afterCursor(t, c) : true))
      .sort((a, b) =>
        a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
      );

    const page = sorted.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      sorted.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;
    return { data: page, nextCursor };
  }

  async get(id: string): Promise<Trade | null> {
    return this.rows.find((t) => t.id === id) ?? null;
  }
}
