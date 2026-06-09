import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTradesRepository } from "@qstd/db";
import { createApp } from "./app.js";

const irs = {
  product: "irs",
  counterparty: "Atlas Derivatives",
  notional: 75_000_000,
  currency: "usd",
  rate: 4.75,
  tenor: "5Y",
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

// .json() is typed `unknown` under types:["node"]; read dynamic shapes as `any`.
const json = async (res: Response): Promise<any> => res.json();

describe("qstd-quantum trades API", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: "quantum", status: "ok" });
  });

  it("POST /trades creates a liability trade (201)", async () => {
    const res = await post(irs);
    expect(res.status).toBe(201);
    const trade = await json(res);
    expect(trade).toMatchObject({ system: "quantum", assetClass: "liability", product: "irs" });
  });

  it("rejects an asset product (bond) — wrong system — with 400", async () => {
    const res = await post({ ...irs, product: "bond" });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
  });

  it("is idempotent on Idempotency-Key", async () => {
    const a = await post(irs, { "Idempotency-Key": "k1" });
    const b = await post(irs, { "Idempotency-Key": "k1" });
    expect(b.status).toBe(200);
    expect((await json(b)).id).toBe((await json(a)).id);
  });

  it("GET /trades returns only this system's trades", async () => {
    await post(irs);
    const res = await app.request("/trades");
    const body = await json(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].system).toBe("quantum");
  });
});
