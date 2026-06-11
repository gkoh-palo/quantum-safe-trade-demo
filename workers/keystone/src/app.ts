// qstd-keystone HTTP app — asset-trade CRUD (loans, bonds) + Better Auth (Phase 2).
// Built from injected deps (TradesRepository, optional WireEmitter, optional
// AuthProvider) so it stays testable. When auth is present, /api/auth/* is mounted
// and booking (POST /trades) requires a logged-in user; the trade records booked_by.
import { Hono } from "hono";
import type { AuthProvider } from "@qstd/auth";
import type { TradesRepository, WireEmitter } from "@qstd/db";
import {
  KEYSTONE_PRODUCTS,
  clampLimit,
  errorBody,
  makeCreateTradeSchema,
  toTradeInput,
} from "@qstd/shared";
import type { Collection, Trade } from "@qstd/shared";

const SYSTEM = "keystone" as const;
const CreateTrade = makeCreateTradeSchema(KEYSTONE_PRODUCTS);

/** The Workers Assets binding — structural so we don't pull in @cloudflare/workers-types. */
export interface AssetFetcher {
  fetch(request: Request): Response | Promise<Response>;
}

export interface AppDeps {
  trades: TradesRepository;
  /** Optional: seals + fans the new trade out to the queues. Omitted in pure CRUD tests. */
  wire?: WireEmitter;
  /** Optional: per-system Better Auth. When present, booking requires a session. */
  auth?: AuthProvider;
  /** Optional: the static booking app. When present, unmatched routes serve the SPA. */
  assets?: AssetFetcher;
  /**
   * Optional shared secret for trusted internal callers (the ui injector + cron
   * trade-generator reach POST /trades via service bindings, with no user session).
   * A matching `x-internal-token` header bypasses the user-auth gate (PLAN §14).
   */
  internalToken?: string;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ service: SYSTEM, status: "ok" }));

  // Better Auth owns /api/auth/* (login, logout, session, …).
  if (deps.auth) {
    app.all("/api/auth/*", (c) => deps.auth!.handler(c.req.raw));
  }

  app.post("/trades", async (c) => {
    const internal =
      !!deps.internalToken && c.req.header("x-internal-token") === deps.internalToken;
    let bookedBy: string | null = null;
    if (!internal && deps.auth) {
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
      // Emission is a side effect: a failure must not lose the persisted trade.
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
    // ?mine=1 → the logged-in user's own blotter (Phase 2).
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

  // Unmatched routes → the booking SPA (assets binding), or a JSON 404 in tests.
  app.notFound((c) => {
    if (deps.assets) return deps.assets.fetch(c.req.raw);
    return c.json(errorBody("NOT_FOUND", "Unknown endpoint"), 404);
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json(errorBody("INTERNAL", "Unexpected error"), 500);
  });

  return app;
}
