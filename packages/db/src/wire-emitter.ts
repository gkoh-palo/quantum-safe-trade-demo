// WireEmitter — the producer side of PLAN §8 steps 1–2. A worker calls emit(trade)
// after persisting it: seal under the active scheme, write the wire_messages row,
// then fan the envelope out to the trade-migration queue (legit handoff) and the
// harvest-tap queue (Eve's ciphertext mirror). Queue bindings are passed in as a
// minimal structural type so @qstd/db needn't depend on @cloudflare/workers-types.
import type { HarvestMessage, MigrationMessage, System, Trade } from "@qstd/shared";
import { canonicalTradePayload } from "@qstd/shared";
import type { Database } from "./client.js";
import { sealAndPersist } from "./wire.js";

export interface QueueProducer<T> {
  send(message: T): Promise<void>;
}

export interface WireEmitter {
  emit(trade: Trade): Promise<{ wireMessageId: string }>;
}

export function createWireEmitter(args: {
  db: Database;
  fromService: System;
  toService: System;
  migration: QueueProducer<MigrationMessage>;
  harvest: QueueProducer<HarvestMessage>;
}): WireEmitter {
  return {
    async emit(trade) {
      const { wireMessageId, envelope } = await sealAndPersist(args.db, {
        fromService: args.fromService,
        toService: args.toService,
        payload: canonicalTradePayload(trade),
      });
      await args.migration.send({ envelope });
      await args.harvest.send({ envelope }); // mirror the ciphertext to the wiretap
      return { wireMessageId };
    },
  };
}
