// qstd-hacker — Eve, the passive wiretap (harvest now, decrypt later). Consumes the
// harvest-tap queue into the HarvestArchive DO, and runs the break engine on the
// loot when the presenter advances the era.
import type { DurableObjectNamespace, MessageBatch } from "@cloudflare/workers-types";
import {
  cryptoConfigRepo,
  getDb,
  harvestedPacketsRepo,
  runBreakBatch,
  summarizeScorecard,
} from "@qstd/db";
import type { HarvestMessage } from "@qstd/shared";
import { HarvestArchive } from "./harvest-archive.js";

export { HarvestArchive };

interface Env {
  readonly NEON_DATABASE_URL: string;
  readonly HARVEST_ARCHIVE: DurableObjectNamespace<HarvestArchive>;
}

const archiveStub = (env: Env) => env.HARVEST_ARCHIVE.get(env.HARVEST_ARCHIVE.idFromName("global"));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/health") {
      return Response.json({ service: "hacker", status: "ok" });
    }
    if (pathname === "/loot/count") {
      return Response.json({ archived: await archiveStub(env).count() });
    }

    // Eve's "decrypt later" pass: break what the current era allows.
    if (pathname === "/break" && method === "POST") {
      const db = getDb(env.NEON_DATABASE_URL);
      const cfg = await cryptoConfigRepo(db).ensureActive();
      const summary = await runBreakBatch(harvestedPacketsRepo(db), {
        scheme: cfg.scheme,
        mode: cfg.breakMode,
        crqcProgress: cfg.crqcProgress,
        keys: cfg.keyring,
      });
      return Response.json({
        era: cfg.era,
        crqcProgress: cfg.crqcProgress,
        mode: cfg.breakMode,
        ...summary,
      });
    }

    if (pathname === "/scorecard") {
      const db = getDb(env.NEON_DATABASE_URL);
      return Response.json(summarizeScorecard(await harvestedPacketsRepo(db).all()));
    }

    return new Response("Not Found", { status: 404 });
  },

  // harvest-tap consumer: mirror each captured ciphertext into the archive.
  async queue(batch: MessageBatch<HarvestMessage>, env: Env): Promise<void> {
    const stub = archiveStub(env);
    const capturedAt = Date.now();
    for (const message of batch.messages) {
      try {
        await stub.archive(message.body.envelope, capturedAt);
        message.ack();
      } catch (err) {
        console.error("harvest archive failed", err);
        message.retry();
      }
    }
  },
};
