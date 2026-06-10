// Read-side aggregation for the pitch UI BFF (PLAN §7): counts, the scorecard, and
// recent trades + wire messages, in one round of queries.
import { desc } from "drizzle-orm";
import type { System, Trade } from "@qstd/shared";
import type { Database } from "./client.js";
import type { Scorecard } from "./harvest.js";
import { harvestedPacketsRepo, summarizeScorecard } from "./harvest.js";
import { mappingsRepo } from "./mappings.js";
import { drizzleTradesRepository } from "./repo.js";
import { trades as tradesTable, wireMessages } from "./schema.js";

export interface WireSummary {
  id: string;
  fromService: System;
  toService: System;
  scheme: string;
  eraAtSend: string;
  createdAt: string;
}

export interface DashboardState {
  counts: { trades: number; harvested: number; migrations: number };
  scorecard: Scorecard;
  recentTrades: Trade[];
  recentWire: WireSummary[];
}

export async function getDashboardState(db: Database, limit = 8): Promise<DashboardState> {
  const harvest = harvestedPacketsRepo(db);
  const [tradesCount, harvestedRows, migrations, recentTrades, wireRows] = await Promise.all([
    db.$count(tradesTable),
    harvest.all(),
    mappingsRepo(db).count(),
    drizzleTradesRepository(db).list({ limit }),
    db
      .select({
        id: wireMessages.id,
        fromService: wireMessages.fromService,
        toService: wireMessages.toService,
        scheme: wireMessages.scheme,
        eraAtSend: wireMessages.eraAtSend,
        createdAt: wireMessages.createdAt,
      })
      .from(wireMessages)
      .orderBy(desc(wireMessages.createdAt))
      .limit(limit),
  ]);

  return {
    counts: { trades: tradesCount, harvested: harvestedRows.length, migrations },
    scorecard: summarizeScorecard(harvestedRows),
    recentTrades: recentTrades.data,
    recentWire: wireRows.map((w) => ({
      id: w.id,
      fromService: w.fromService as System,
      toService: w.toService as System,
      scheme: w.scheme,
      eraAtSend: w.eraAtSend,
      createdAt: w.createdAt.toISOString(),
    })),
  };
}
