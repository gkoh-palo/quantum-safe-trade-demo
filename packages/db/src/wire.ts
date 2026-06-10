// Wire messages (PLAN §4/§8): the canonical sealed payloads a sender writes, plus
// the envelope converters and the capture service that seals under the active
// scheme + persists the row. The envelope (hex byte fields) is what rides the queues.
import { desc } from "drizzle-orm";
import type { SealedMessage } from "@qstd/crypto";
import { bytesToHex, hexToBytes, seal } from "@qstd/crypto";
import type { Era, System, WireEnvelope } from "@qstd/shared";
import type { Database } from "./client.js";
import { cryptoConfigRepo } from "./crypto-config.js";
import { wireMessages } from "./schema.js";

const hexOrNull = (b: Uint8Array | null): string | null => (b ? bytesToHex(b) : null);
const bytesOrNull = (h: string | null): Uint8Array | null => (h ? hexToBytes(h) : null);

export function sealedToEnvelope(
  wireMessageId: string,
  fromService: System,
  toService: System,
  eraAtSend: Era,
  sealed: SealedMessage,
): WireEnvelope {
  return {
    wireMessageId,
    fromService,
    toService,
    scheme: sealed.scheme,
    eraAtSend,
    ciphertextHex: bytesToHex(sealed.ciphertext),
    nonceHex: hexOrNull(sealed.nonce),
    encapsulatedKeyHex: hexOrNull(sealed.encapsulatedKey),
    macHex: hexOrNull(sealed.mac),
    plaintextSha256Hex: bytesToHex(sealed.plaintextSha256),
  };
}

export function envelopeToSealed(env: WireEnvelope): SealedMessage {
  return {
    scheme: env.scheme,
    ciphertext: hexToBytes(env.ciphertextHex),
    nonce: bytesOrNull(env.nonceHex),
    encapsulatedKey: bytesOrNull(env.encapsulatedKeyHex),
    mac: bytesOrNull(env.macHex),
    plaintextSha256: hexToBytes(env.plaintextSha256Hex),
  };
}

export interface InsertWireMessage {
  fromService: System;
  toService: System;
  eraAtSend: Era;
  sealed: SealedMessage;
}

export function wireMessagesRepo(db: Database) {
  return {
    async insert(input: InsertWireMessage): Promise<{ id: string }> {
      const s = input.sealed;
      const inserted = await db
        .insert(wireMessages)
        .values({
          fromService: input.fromService,
          toService: input.toService,
          scheme: s.scheme,
          eraAtSend: input.eraAtSend,
          ciphertext: s.ciphertext,
          nonce: s.nonce,
          encapsulatedKey: s.encapsulatedKey,
          mac: s.mac,
          plaintextSha256: s.plaintextSha256,
        })
        .returning({ id: wireMessages.id });
      const row = inserted[0];
      if (!row) throw new Error("wireMessages.insert: insert returned no row");
      return { id: row.id };
    },

    async listRecent(limit: number): Promise<(typeof wireMessages.$inferSelect)[]> {
      return db.select().from(wireMessages).orderBy(desc(wireMessages.createdAt)).limit(limit);
    },

    async count(): Promise<number> {
      return db.$count(wireMessages);
    },
  };
}

/**
 * Seal `payload` under the active scheme, persist a wire_messages row, and return
 * the envelope for the `trade-migration` + `harvest-tap` queues. The capture half
 * of PLAN §8 steps 1–2.
 */
export async function sealAndPersist(
  db: Database,
  args: { fromService: System; toService: System; payload: Uint8Array },
): Promise<{ wireMessageId: string; envelope: WireEnvelope }> {
  const cfg = await cryptoConfigRepo(db).ensureActive();
  const sealed = await seal(cfg.scheme, args.payload, cfg.keyring);
  const { id } = await wireMessagesRepo(db).insert({
    fromService: args.fromService,
    toService: args.toService,
    eraAtSend: cfg.era,
    sealed,
  });
  return {
    wireMessageId: id,
    envelope: sealedToEnvelope(id, args.fromService, args.toService, cfg.era, sealed),
  };
}
