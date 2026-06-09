import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTradesRepository } from "@qstd/db";
import { createApp } from "./app.js";

const bond = {
  product: "bond",
  counterparty: "Northwind Treasury",
  notional: 50_000_000,
  currency: "usd",
  rate: 4.1,
  tenor: "10Y",
};

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp(new InMemoryTradesRepository());
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

describe("qstd-sentry trades API", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: "sentry", status: "ok" });
  });

  it("POST /trades creates an asset trade (201 + Location)", async () => {
    const res = await post(bond);
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toMatch(/^\/trades\/[0-9a-f-]{36}$/);
    const trade = await json(res);
    expect(trade).toMatchObject({
      system: "sentry",
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

  it("is idempotent on Idempotency-Key (replay returns 200, same id)", async () => {
    const first = await post(bond, { "Idempotency-Key": "abc-123" });
    expect(first.status).toBe(201);
    const second = await post(bond, { "Idempotency-Key": "abc-123" });
    expect(second.status).toBe(200);
    expect((await json(second)).id).toBe((await json(first)).id);
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
