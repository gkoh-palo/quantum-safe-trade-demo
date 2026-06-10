// qstd-hacker — Eve, the passive wiretap (harvest now, decrypt later). Consumes the
// harvest-tap queue and appends each sniffed ciphertext to the HarvestArchive DO.
// The break engine (decrypt-later, M4) hangs off the same DO.
import type { DurableObjectNamespace, MessageBatch } from "@cloudflare/workers-types";
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
    if (pathname === "/health") {
      return Response.json({ service: "hacker", status: "ok" });
    }
    if (pathname === "/loot/count") {
      return Response.json({ archived: await archiveStub(env).count() });
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
