import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTradesRepository } from "@qstd/db";
import type { WireEmitter } from "@qstd/db";
import type { Trade } from "@qstd/shared";
import { createApp } from "./app.js";

class FakeWireEmitter implements WireEmitter {
  readonly emitted: Trade[] = [];
  async emit(trade: Trade) {
    this.emitted.push(trade);
    return { wireMessageId: `wm-${this.emitted.length}` };
  }
}

const bond = {
  product: "bond",
  counterparty: "Northwind Treasury",
  notional: 50_000_000,
  currency: "usd",
  rate: 4.1,
  tenor: "10Y",
};

let app: ReturnType<typeof createApp>;
let wire: FakeWireEmitter;
beforeEach(() => {
  wire = new FakeWireEmitter();
  app = createApp({ trades: new InMemoryTradesRepository(), wire });
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  app.request("/trades", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

// app.request returns a standard Response whose .json() is typed `unknown` under
// types:["node"]; tests assert on dynamic shapes, so read it as `any`.
const json = async (res: Response): Promise<any> => res.json();

describe("qstd-keystone trades API", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: "keystone", status: "ok" });
  });

  it("POST /trades creates an asset trade (201 + Location)", async () => {
    const res = await post(bond);
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toMatch(/^\/trades\/[0-9a-f-]{36}$/);
    const trade = await json(res);
    expect(trade).toMatchObject({
      system: "keystone",
      assetClass: "asset",
      product: "bond",
      currency: "USD", // normalised
      notional: 50_000_000,
    });
    expect(trade.id).toBeTruthy();
  });

  it("rejects an invalid body with 400 VALIDATION_ERROR", async () => {
    const res = await post({ ...bond, counterparty: "", notional: -1 });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a liability product (fx) — wrong system — with 400", async () => {
    const res = await post({ ...bond, product: "fx" });
    expect(res.status).toBe(400);
  });

  it("is idempotent on Idempotency-Key (replay returns 200, same id, no re-emit)", async () => {
    const first = await post(bond, { "Idempotency-Key": "abc-123" });
    expect(first.status).toBe(201);
    const second = await post(bond, { "Idempotency-Key": "abc-123" });
    expect(second.status).toBe(200);
    expect((await json(second)).id).toBe((await json(first)).id);
    expect(wire.emitted).toHaveLength(1); // replay must not re-emit to the queues
  });

  it("emits the created trade to the wire (seal + queue fan-out)", async () => {
    const res = await post(bond);
    const trade = await json(res);
    expect(wire.emitted).toHaveLength(1);
    expect(wire.emitted[0]).toMatchObject({ id: trade.id, system: "keystone", product: "bond" });
  });

  it("GET /trades returns the collection shape", async () => {
    await post(bond);
    const res = await app.request("/trades");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toHaveLength(1);
    expect(body.page).toMatchObject({ limit: 50, nextCursor: null });
  });

  it("GET /trades/:id returns 404 for an unknown id", async () => {
    const res = await app.request("/trades/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe("NOT_FOUND");
  });
});

// Phase 2: when an auth provider is injected, booking requires a session and records
// booked_by; the ?mine blotter scopes to that user.
class FakeAuth {
  constructor(private user: { id: string; email: string; name: string } | null) {}
  async handler() {
    return new Response("auth", { status: 200 });
  }
  async requireUser() {
    return this.user;
  }
  async signUp() {}
}

describe("qstd-keystone auth gating (Phase 2)", () => {
  const repo = () => new InMemoryTradesRepository();
  const book = (a: ReturnType<typeof createApp>) =>
    a.request("/trades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bond),
    });

  it("rejects booking without a session (401)", async () => {
    const app = createApp({ trades: repo(), auth: new FakeAuth(null) });
    const res = await book(app);
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHENTICATED");
  });

  it("books for a logged-in user and records booked_by", async () => {
    const user = { id: "u-1", email: "demo@keystone.local", name: "Keystone Demo" };
    const app = createApp({ trades: repo(), auth: new FakeAuth(user) });
    const res = await book(app);
    expect(res.status).toBe(201);
    expect((await json(res)).bookedBy).toBe("u-1");
  });

  it("internal token bypasses the gate (ui injector / cron) with no booked_by", async () => {
    const app = createApp({ trades: repo(), auth: new FakeAuth(null), internalToken: "s3cret" });
    const res = await app.request("/trades", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": "s3cret" },
      body: JSON.stringify(bond),
    });
    expect(res.status).toBe(201);
    expect((await json(res)).bookedBy).toBeNull();
  });

  it("a wrong internal token still requires a session (401)", async () => {
    const app = createApp({ trades: repo(), auth: new FakeAuth(null), internalToken: "s3cret" });
    const res = await app.request("/trades", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": "nope" },
      body: JSON.stringify(bond),
    });
    expect(res.status).toBe(401);
  });

  it("GET /trades?mine=1 scopes to the logged-in user", async () => {
    const trades = repo();
    const app = createApp({ trades, auth: new FakeAuth({ id: "u-1", email: "e", name: "n" }) });
    await book(app); // booked by u-1
    await trades.create({
      system: "keystone",
      assetClass: "asset",
      product: "loan",
      counterparty: "X",
      notional: 1,
      currency: "USD",
      rate: 1,
      tenor: "5Y",
      tradeDate: "2026-01-01",
      status: "active",
      bookedBy: "someone-else",
    });

    const mine = await json(await app.request("/trades?mine=1"));
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0].bookedBy).toBe("u-1");

    const all = await json(await app.request("/trades"));
    expect(all.data.length).toBe(2); // unscoped sees both
  });
});
