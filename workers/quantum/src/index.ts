// qstd-quantum — vendor system for **liability** trades (FX, IRS, CCS). Trade CRUD
// via the Hono app in ./app.ts over Neon. On create, trades are sealed and fanned
// out to the trade-migration + harvest-tap queues via the WireEmitter (PLAN §8).
import { createWireEmitter, drizzleTradesRepository, getDb } from "@qstd/db";
import type { QueueProducer } from "@qstd/db";
import type { HarvestMessage, MigrationMessage } from "@qstd/shared";
import { createApp } from "./app.js";

interface Env {
  readonly NEON_DATABASE_URL: string;
  readonly MIGRATION: QueueProducer<MigrationMessage>;
  readonly HARVEST_TAP: QueueProducer<HarvestMessage>;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const db = getDb(env.NEON_DATABASE_URL);
    const wire = createWireEmitter({
      db,
      fromService: "quantum",
      toService: "sentry",
      migration: env.MIGRATION,
      harvest: env.HARVEST_TAP,
    });
    return createApp({ trades: drizzleTradesRepository(db), wire }).fetch(request);
  },
};
