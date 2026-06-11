// qstd-quantum HTTP app — liability-trade CRUD (FX, IRS, CCS) + Better Auth (Phase 2).
// Same shape as the Sentry app, scoped to liability products. Built from injected deps
// so it stays testable. When auth is present, /api/auth/* is mounted and booking
// requires a logged-in user; the trade records booked_by.
import { Hono } from "hono";
import type { AuthProvider } from "@qstd/auth";
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
  auth?: AuthProvider;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ service: SYSTEM, status: "ok" }));

  if (deps.auth) {
    app.all("/api/auth/*", (c) => deps.auth!.handler(c.req.raw));
  }

  app.post("/trades", async (c) => {
    let bookedBy: string | null = null;
    if (deps.auth) {
      const user = await deps.auth.requireUser(c.req.raw);
      if (!user) return c.json(errorBody("UNAUTHENTICATED", "Log in to book a trade"), 401);
      bookedBy = user.id;
    }

    const body = await c.req.json().catch(() => undefined);
    const parsed = CreateTrade.safeParse(body);
    if (!parsed.success) {
      return c.json(errorBody("VALIDATION_ERROR", "Invalid trade", parsed.error.issues), 400);
    }

    const { trade, created } = await deps.trades.create(
      { ...toTradeInput(parsed.data, SYSTEM), bookedBy },
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
    let bookedBy: string | undefined;
    if (c.req.query("mine") && deps.auth) {
      const user = await deps.auth.requireUser(c.req.raw);
      if (!user) return c.json(errorBody("UNAUTHENTICATED", "Log in to view your trades"), 401);
      bookedBy = user.id;
    }
    const { data, nextCursor } = await deps.trades.list({
      system: SYSTEM,
      bookedBy,
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
