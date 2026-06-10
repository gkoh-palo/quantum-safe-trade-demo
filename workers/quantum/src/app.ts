// qstd-quantum HTTP app — liability-trade CRUD (FX, IRS, CCS). Same shape as the
// Sentry app, scoped to the liability products. Built from injected deps (a
// TradesRepository and an optional WireEmitter) so it is testable without a DB or
// queues. On create, the trade is sealed and mirrored to the queues (PLAN §8).
import { Hono } from "hono";
import type { TradesRepository, WireEmitter } from "@qstd/db";
import {
  QUANTUM_PRODUCTS,
  clampLimit,
  errorBody,
  makeCreateTradeSchema,
  toTradeInput,
} from "@qstd/shared";
import type { Collection, Trade } from "@qstd/shared";

const SYSTEM = "quantum" as const;
const CreateTrade = makeCreateTradeSchema(QUANTUM_PRODUCTS);

export interface AppDeps {
  trades: TradesRepository;
  wire?: WireEmitter;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ service: SYSTEM, status: "ok" }));

  app.post("/trades", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = CreateTrade.safeParse(body);
    if (!parsed.success) {
      return c.json(errorBody("VALIDATION_ERROR", "Invalid trade", parsed.error.issues), 400);
    }
    const { trade, created } = await deps.trades.create(
      toTradeInput(parsed.data, SYSTEM),
      c.req.header("Idempotency-Key") ?? null,
    );
    if (!created) return c.json(trade, 200); // idempotent replay — don't re-emit

    if (deps.wire) {
      try {
        await deps.wire.emit(trade);
      } catch (err) {
        console.error("wire emit failed", err);
      }
    }
    c.header("Location", `/trades/${trade.id}`);
    return c.json(trade, 201);
  });

  app.get("/trades", async (c) => {
    const limit = clampLimit(c.req.query("limit"));
    const { data, nextCursor } = await deps.trades.list({
      system: SYSTEM,
      limit,
      cursor: c.req.query("cursor") ?? null,
    });
    const out: Collection<Trade> = { data, page: { nextCursor, limit } };
    return c.json(out);
  });

  app.get("/trades/:id", async (c) => {
    const trade = await deps.trades.get(c.req.param("id"));
    if (!trade) return c.json(errorBody("NOT_FOUND", "Trade not found"), 404);
    return c.json(trade);
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json(errorBody("INTERNAL", "Unexpected error"), 500);
  });

  return app;
}
