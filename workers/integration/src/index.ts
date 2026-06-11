// qstd-integration — maps & migrates trades both directions. Consumes the
// trade-migration queue: opens each wire message, maps the trade to its counterpart
// system, persists the target trade + mapping, and re-seals it onward (mirroring to
// the harvest tap). The richest interception point — but a passive sniffer only ever
// sees ciphertext, which is why the migrated leg is mirrored, not man-in-the-middled.
import type { MessageBatch } from "@cloudflare/workers-types";
import { getDb, mappingsRepo, migrateFromEnvelope } from "@qstd/db";
import type { QueueProducer } from "@qstd/db";
import type { HarvestMessage, MigrationMessage } from "@qstd/shared";

interface Env {
  readonly NEON_DATABASE_URL: string;
  readonly HARVEST_TAP: QueueProducer<HarvestMessage>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return Response.json({ service: "integration", status: "ok" });
    }
    if (pathname === "/mappings/count") {
      return Response.json({
        migrations: await mappingsRepo(getDb(env.NEON_DATABASE_URL)).count(),
      });
    }
    return new Response("Not Found", { status: 404 });
  },

  // trade-migration consumer: the legitimate Keystone⇄Helix handoff.
  async queue(batch: MessageBatch<MigrationMessage>, env: Env): Promise<void> {
    const db = getDb(env.NEON_DATABASE_URL);
    for (const message of batch.messages) {
      try {
        await migrateFromEnvelope(db, env.HARVEST_TAP, message.body.envelope);
        message.ack();
      } catch (err) {
        console.error("migration failed", err);
        message.retry();
      }
    }
  },
};
