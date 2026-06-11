// Keystone⇄Helix migration links (PLAN §4 mappings). One row per migrated trade,
// connecting the source trade to its counterpart on the other system.
import { desc } from "drizzle-orm";
import { MAPPING_RULES_VERSION } from "@qstd/shared";
import type { MigrationDirection } from "@qstd/shared";
import type { Database } from "./client.js";
import { mappings } from "./schema.js";

export interface InsertMapping {
  sourceTradeId: string;
  targetTradeId: string;
  direction: MigrationDirection;
  status?: string;
  rulesVersion?: string;
}

export function mappingsRepo(db: Database) {
  return {
    async insert(m: InsertMapping): Promise<{ id: string }> {
      const inserted = await db
        .insert(mappings)
        .values({
          sourceTradeId: m.sourceTradeId,
          targetTradeId: m.targetTradeId,
          direction: m.direction,
          rulesVersion: m.rulesVersion ?? MAPPING_RULES_VERSION,
          status: m.status ?? "migrated",
        })
        .returning({ id: mappings.id });
      const row = inserted[0];
      if (!row) throw new Error("mappings.insert: insert returned no row");
      return { id: row.id };
    },

    async listRecent(limit: number): Promise<(typeof mappings.$inferSelect)[]> {
      return db.select().from(mappings).orderBy(desc(mappings.createdAt)).limit(limit);
    },

    async count(): Promise<number> {
      return db.$count(mappings);
    },
  };
}
