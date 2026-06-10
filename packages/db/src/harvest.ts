// Eve's loot (PLAN §4 harvested_packets) + the break engine + the scorecard.
// The HarvestArchive DO writes a row per captured wire message (incl. the sniffed
// envelope). When the presenter advances the era, runBreakBatch() iterates the
// un-attempted packets, applies each scheme's §5 outcome via @qstd/crypto, and
// records what was recovered. summarizeScorecard() rolls it up by scheme.
import { desc, eq, isNull } from "drizzle-orm";
import type { BreakMode, EncryptionScheme, KeyMaterial } from "@qstd/crypto";
import { breakMessage, schemeInfo } from "@qstd/crypto";
import type { WireEnvelope } from "@qstd/shared";
import type { Database } from "./client.js";
import { harvestedPackets } from "./schema.js";
import { envelopeToSealed } from "./wire.js";

export interface InsertHarvestedPacket {
  wireMessageId: string;
  scheme: string;
  envelope: WireEnvelope;
}

export interface UnattemptedPacket {
  id: string;
  scheme: string | null;
  envelope: WireEnvelope | null;
}

export interface BreakOutcome {
  broken: boolean;
  breakMethod: string;
  recoveredPlaintext: unknown | null;
  exposedNotional: number | null;
  exposedCounterparty: string | null;
}

/** Subset of the repo the break engine needs — lets it be tested without a DB. */
export interface HarvestBreakRepo {
  listUnattempted(limit: number): Promise<UnattemptedPacket[]>;
  markAttempted(id: string, outcome: BreakOutcome): Promise<void>;
}

type Row = typeof harvestedPackets.$inferSelect;

export function harvestedPacketsRepo(db: Database) {
  return {
    async insert(input: InsertHarvestedPacket): Promise<{ id: string }> {
      const inserted = await db
        .insert(harvestedPackets)
        .values({
          wireMessageId: input.wireMessageId,
          scheme: input.scheme,
          envelope: input.envelope,
          broken: false,
        })
        .returning({ id: harvestedPackets.id });
      const row = inserted[0];
      if (!row) throw new Error("harvestedPackets.insert: insert returned no row");
      return { id: row.id };
    },

    async listUnattempted(limit: number): Promise<UnattemptedPacket[]> {
      const rows = await db
        .select({
          id: harvestedPackets.id,
          scheme: harvestedPackets.scheme,
          envelope: harvestedPackets.envelope,
        })
        .from(harvestedPackets)
        .where(isNull(harvestedPackets.brokenAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        scheme: r.scheme,
        envelope: r.envelope as WireEnvelope | null,
      }));
    },

    async markAttempted(id: string, outcome: BreakOutcome): Promise<void> {
      await db
        .update(harvestedPackets)
        .set({
          broken: outcome.broken,
          breakMethod: outcome.breakMethod,
          recoveredPlaintext: outcome.recoveredPlaintext,
          brokenAt: new Date(),
          exposedNotional:
            outcome.exposedNotional === null ? null : String(outcome.exposedNotional),
          exposedCounterparty: outcome.exposedCounterparty,
        })
        .where(eq(harvestedPackets.id, id));
    },

    async listRecent(limit: number): Promise<Row[]> {
      return db
        .select()
        .from(harvestedPackets)
        .orderBy(desc(harvestedPackets.harvestedAt))
        .limit(limit);
    },

    async all(): Promise<Row[]> {
      return db.select().from(harvestedPackets);
    },

    async count(): Promise<number> {
      return db.$count(harvestedPackets);
    },
  };
}

// --- the break engine ------------------------------------------------------

export interface BreakContextInit {
  scheme: EncryptionScheme;
  mode: BreakMode;
  crqcProgress: number;
  keys: KeyMaterial;
}

export interface BreakSummary {
  attempted: number;
  recovered: number;
  protectedCount: number;
  gatedSkipped: number;
  exposedNotional: number;
}

/** Pull notional + counterparty out of a recovered canonical trade payload. */
function extractExposure(plaintext: string | null): {
  payload: unknown | null;
  notional: number | null;
  counterparty: string | null;
} {
  if (!plaintext) return { payload: null, notional: null, counterparty: null };
  try {
    const obj = JSON.parse(plaintext) as Record<string, unknown>;
    const notional = typeof obj.notional === "number" ? obj.notional : null;
    const counterparty = typeof obj.counterparty === "string" ? obj.counterparty : null;
    return { payload: obj, notional, counterparty };
  } catch {
    return { payload: plaintext, notional: null, counterparty: null };
  }
}

/**
 * Run Eve's "decrypt later" pass. For each un-attempted packet sealed under the
 * active scheme, apply the §5 break outcome. Recovered packets are recorded with
 * the exposed economics; PQC packets are marked permanently protected; classical
 * packets still gated by the CRQC countdown are left for a later pass.
 */
export async function runBreakBatch(
  repo: HarvestBreakRepo,
  ctx: BreakContextInit,
  limit = 1000,
): Promise<BreakSummary> {
  const packets = await repo.listUnattempted(limit);
  const summary: BreakSummary = {
    attempted: 0,
    recovered: 0,
    protectedCount: 0,
    gatedSkipped: 0,
    exposedNotional: 0,
  };

  for (const p of packets) {
    // Can only break packets under the active scheme (the keyring matches it).
    if (!p.envelope || !p.scheme || p.scheme !== ctx.scheme) continue;
    summary.attempted += 1;

    const result = await breakMessage(envelopeToSealed(p.envelope), {
      mode: ctx.mode,
      crqcProgress: ctx.crqcProgress,
      keys: ctx.keys,
    });

    if (result.recovered) {
      const { payload, notional, counterparty } = extractExposure(result.plaintext);
      await repo.markAttempted(p.id, {
        broken: true,
        breakMethod: result.method,
        recoveredPlaintext: payload,
        exposedNotional: notional,
        exposedCounterparty: counterparty,
      });
      summary.recovered += 1;
      if (notional) summary.exposedNotional += notional;
    } else if (schemeInfo(p.scheme as EncryptionScheme).quantumSafe) {
      // PQC — never recoverable; record the permanent failure so it isn't retried.
      await repo.markAttempted(p.id, {
        broken: false,
        breakMethod: "failed",
        recoveredPlaintext: null,
        exposedNotional: null,
        exposedCounterparty: null,
      });
      summary.protectedCount += 1;
    } else {
      // Classical but still gated (projected mode, CRQC < 100%): retry next pass.
      summary.gatedSkipped += 1;
    }
  }
  return summary;
}

// --- scorecard -------------------------------------------------------------

export interface SchemeScore {
  scheme: string;
  quantumSafe: boolean;
  harvested: number;
  broken: number;
  protected: number;
  exposedNotional: number;
  leakedCounterparties: number;
}

export interface Scorecard {
  totals: {
    harvested: number;
    broken: number;
    protected: number;
    exposedNotional: number;
    leakedCounterparties: number;
  };
  byScheme: SchemeScore[];
}

/** Roll harvested_packets rows up by scheme. Pure — fed by harvestedPacketsRepo.all(). */
export function summarizeScorecard(
  rows: Pick<Row, "scheme" | "broken" | "exposedNotional" | "exposedCounterparty">[],
): Scorecard {
  const groups = new Map<string, SchemeScore & { _cps: Set<string> }>();
  const allCps = new Set<string>();
  let harvested = 0;
  let broken = 0;
  let protectedTotal = 0;
  let exposedNotional = 0;

  for (const r of rows) {
    const scheme = r.scheme ?? "unknown";
    let g = groups.get(scheme);
    if (!g) {
      const safe =
        scheme === "unknown" ? false : schemeInfo(scheme as EncryptionScheme).quantumSafe;
      g = {
        scheme,
        quantumSafe: safe,
        harvested: 0,
        broken: 0,
        protected: 0,
        exposedNotional: 0,
        leakedCounterparties: 0,
        _cps: new Set<string>(),
      };
      groups.set(scheme, g);
    }
    g.harvested += 1;
    harvested += 1;
    if (r.broken) {
      g.broken += 1;
      broken += 1;
      const n = r.exposedNotional === null ? 0 : Number(r.exposedNotional);
      g.exposedNotional += n;
      exposedNotional += n;
      if (r.exposedCounterparty) {
        g._cps.add(r.exposedCounterparty);
        allCps.add(r.exposedCounterparty);
      }
    } else {
      g.protected += 1;
      protectedTotal += 1;
    }
  }

  const byScheme = [...groups.values()].map(({ _cps, ...s }) => ({
    ...s,
    leakedCounterparties: _cps.size,
  }));

  return {
    totals: {
      harvested,
      broken,
      protected: protectedTotal,
      exposedNotional,
      leakedCounterparties: allCps.size,
    },
    byScheme,
  };
}
