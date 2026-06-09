// HarvestArchive — Eve's loot store (PLAN §2/§3). A single global Durable Object:
// the append-only log of every ciphertext sniffed off the wire, held "forever" in
// DO SQLite. It also writes a harvested_packets summary row to Neon for the
// scorecard. The break orchestration (M4) hangs off this same DO.
import { DurableObject } from "cloudflare:workers";
import { getDb, harvestedPacketsRepo } from "@qstd/db";
import type { WireEnvelope } from "@qstd/shared";

export interface HarvestArchiveEnv {
  readonly NEON_DATABASE_URL: string;
}

export class HarvestArchive extends DurableObject<HarvestArchiveEnv> {
  constructor(ctx: DurableObjectState, env: HarvestArchiveEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS loot (
           wire_message_id TEXT PRIMARY KEY,
           from_service    TEXT NOT NULL,
           to_service      TEXT NOT NULL,
           scheme          TEXT NOT NULL,
           era_at_send     TEXT NOT NULL,
           ciphertext_hex  TEXT NOT NULL,
           captured_at     INTEGER NOT NULL
         )`,
      );
    });
  }

  /** Sniff one wire message into the archive. Idempotent on wireMessageId. */
  async archive(
    envelope: WireEnvelope,
    capturedAt: number,
  ): Promise<{ archived: number; isNew: boolean }> {
    const cursor = this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO loot
         (wire_message_id, from_service, to_service, scheme, era_at_send, ciphertext_hex, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      envelope.wireMessageId,
      envelope.fromService,
      envelope.toService,
      envelope.scheme,
      envelope.eraAtSend,
      envelope.ciphertextHex,
      capturedAt,
    );
    const isNew = cursor.rowsWritten > 0;
    // Only summarise genuinely new loot in Neon, so retries don't double-count.
    if (isNew) {
      await harvestedPacketsRepo(getDb(this.env.NEON_DATABASE_URL)).insert({
        wireMessageId: envelope.wireMessageId,
      });
    }
    return { archived: this.count(), isNew };
  }

  /** How many distinct packets Eve is holding. */
  count(): number {
    const row = this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM loot`).one();
    return Number(row.n);
  }
}
