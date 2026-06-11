// qstd-sentry — vendor system for **asset** trades (loans, bonds). Trade CRUD via
// the Hono app in ./app.ts, backed by the Drizzle trades repository over Neon. On
// create, trades are sealed and fanned out to the trade-migration + harvest-tap
// queues via the WireEmitter (PLAN §8). Queue bindings are typed structurally
// (QueueProducer) so this worker needn't pull in @cloudflare/workers-types.
import { createAuth } from "@qstd/auth";
import { createWireEmitter, drizzleTradesRepository, getDb } from "@qstd/db";
import type { QueueProducer } from "@qstd/db";
import type { HarvestMessage, MigrationMessage } from "@qstd/shared";
import { createApp } from "./app.js";

interface Env {
  readonly NEON_DATABASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly INTERNAL_TOKEN?: string;
  readonly MIGRATION: QueueProducer<MigrationMessage>;
  readonly HARVEST_TAP: QueueProducer<HarvestMessage>;
  readonly ASSETS: { fetch(request: Request): Response | Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const db = getDb(env.NEON_DATABASE_URL);
    const wire = createWireEmitter({
      db,
      fromService: "sentry",
      toService: "quantum",
      migration: env.MIGRATION,
      harvest: env.HARVEST_TAP,
    });
    const auth = createAuth({
      db,
      system: "sentry",
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
    });
    return createApp({
      trades: drizzleTradesRepository(db),
      wire,
      auth,
      assets: env.ASSETS,
      internalToken: env.INTERNAL_TOKEN,
    }).fetch(request);
  },
};
