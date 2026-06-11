// qstd-ui — the BFF + control plane. Serves the React pitch app (Workers Assets)
// and owns /api/*: aggregate state for the pitch view, the era controls (EpochClock
// DO), and Eve's break trigger. Better Auth gating of the mutating routes is M7 —
// they are open here.
import type {
  DurableObjectNamespace,
  ExecutionContext,
  Fetcher,
  ScheduledController,
} from "@cloudflare/workers-types";
import {
  cryptoConfigRepo,
  getDashboardState,
  getDb,
  harvestedPacketsRepo,
  runBreakBatch,
} from "@qstd/db";
import { randomTradeBody, type System } from "@qstd/shared";
import { handleAdmin } from "./admin.js";
import { EpochClock } from "./epoch-clock.js";

export { EpochClock };

interface Env {
  readonly NEON_DATABASE_URL: string;
  readonly ADMIN_TOKEN?: string;
  readonly INTERNAL_TOKEN?: string;
  readonly EPOCH: DurableObjectNamespace<EpochClock>;
  readonly ASSETS: Fetcher;
  readonly KEYSTONE: Fetcher;
  readonly HELIX: Fetcher;
}

const epoch = (env: Env) => env.EPOCH.get(env.EPOCH.idFromName("global"));

const GENERATE_CRON = "*/1 * * * *"; // trade-generator
const TICK_CRON = "*/2 * * * *"; // epoch-tick

// Generate one random trade through the originating worker's seal + emit path.
// Sends the internal token so the system feed bypasses the booking auth gate.
async function generateTrade(env: Env): Promise<void> {
  const system: System = Math.random() < 0.5 ? "keystone" : "helix";
  const target = system === "keystone" ? env.KEYSTONE : env.HELIX;
  await target.fetch(
    new Request("https://svc/trades", {
      method: "POST",
      headers: { "content-type": "application/json", ...internalHeader(env) },
      body: JSON.stringify(randomTradeBody(system)),
    }),
  );
}

/** Header that lets the ui's service-binding calls bypass the per-system booking gate. */
export function internalHeader(env: { INTERNAL_TOKEN?: string }): Record<string, string> {
  return env.INTERNAL_TOKEN ? { "x-internal-token": env.INTERNAL_TOKEN } : {};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/health" || pathname === "/api/health") {
      return Response.json({ service: "ui", status: "ok" });
    }

    // Aggregate everything the pitch view polls for, in one call.
    if (pathname === "/api/state" && method === "GET") {
      const db = getDb(env.NEON_DATABASE_URL);
      const [era, dashboard] = await Promise.all([epoch(env).getState(), getDashboardState(db)]);
      return Response.json({ era, ...dashboard });
    }

    // Era control (TODO M7: gate these behind Better Auth).
    if (pathname === "/api/era" && method === "GET") {
      return Response.json(await epoch(env).getState());
    }
    if (pathname === "/api/era/advance" && method === "POST") {
      return Response.json(await epoch(env).advanceEra());
    }
    if (pathname === "/api/era/reset" && method === "POST") {
      // Reset to today AND un-break the loot, so the demo is repeatable.
      await harvestedPacketsRepo(getDb(env.NEON_DATABASE_URL)).resetBreaks();
      return Response.json(await epoch(env).reset());
    }
    if (pathname === "/api/era/progress" && method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { progress?: number };
      if (typeof body.progress !== "number") {
        return Response.json(
          { error: { code: "VALIDATION_ERROR", message: "progress (number) required" } },
          { status: 400 },
        );
      }
      return Response.json(await epoch(env).setProgress(body.progress));
    }

    // Eve's "decrypt later" pass — break whatever the current era allows.
    if (pathname === "/api/break" && method === "POST") {
      const db = getDb(env.NEON_DATABASE_URL);
      const cfg = await cryptoConfigRepo(db).ensureActive();
      const summary = await runBreakBatch(harvestedPacketsRepo(db), {
        scheme: cfg.scheme,
        mode: cfg.breakMode,
        crqcProgress: cfg.crqcProgress,
        keys: cfg.keyring,
      });
      return Response.json(summary);
    }

    // Admin control plane (token-gated).
    const admin = await handleAdmin(request, env, pathname, method);
    if (admin) return admin;

    if (pathname.startsWith("/api/")) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Unknown endpoint" } },
        { status: 404 },
      );
    }

    // Everything else → the React SPA (the assets binding handles SPA fallback).
    return env.ASSETS.fetch(request);
  },

  // Cron feeds (PLAN §3) — only fire when their auto-mode is on.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const cfg = await cryptoConfigRepo(getDb(env.NEON_DATABASE_URL)).getActive();
    if (!cfg) return;
    if (event.cron === GENERATE_CRON && cfg.autoGenerate) {
      ctx.waitUntil(generateTrade(env));
    }
    if (event.cron === TICK_CRON && cfg.autoTick) {
      ctx.waitUntil(epoch(env).tick());
    }
  },
};
