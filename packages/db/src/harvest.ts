// Eve's loot table (PLAN §4 harvested_packets). The hacker's HarvestArchive DO
// writes a row per captured wire message (broken=false); M4 fills in the break
// result. The scorecard reads from here.
import { desc } from "drizzle-orm";
import type { Database } from "./client.js";
import { harvestedPackets } from "./schema.js";

export interface InsertHarvestedPacket {
  wireMessageId: string;
}

export function harvestedPacketsRepo(db: Database) {
  return {
    async insert(input: InsertHarvestedPacket): Promise<{ id: string }> {
      const inserted = await db
        .insert(harvestedPackets)
        .values({ wireMessageId: input.wireMessageId, broken: false })
        .returning({ id: harvestedPackets.id });
      const row = inserted[0];
      if (!row) throw new Error("harvestedPackets.insert: insert returned no row");
      return { id: row.id };
    },

    async listRecent(limit: number): Promise<(typeof harvestedPackets.$inferSelect)[]> {
      return db
        .select()
        .from(harvestedPackets)
        .orderBy(desc(harvestedPackets.harvestedAt))
        .limit(limit);
    },

    async count(): Promise<number> {
      return db.$count(harvestedPackets);
    },
  };
}
