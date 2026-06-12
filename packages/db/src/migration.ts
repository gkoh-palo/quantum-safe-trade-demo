// The integration migration step (PLAN §8 step 4). For each trade-migration
// message: open the wire payload (the integration legitimately holds the keys),
// map it to the counterpart system, persist the target trade + the mapping link,
// then re-seal it onto the wire to the target and mirror that to the harvest tap
// (so Eve sniffs the migrated leg too).
import { open } from "@qstd/crypto";
import { canonicalTradePayload, mapTrade, parseCanonicalTrade } from "@qstd/shared";
import type { HarvestMessage, WireEnvelope } from "@qstd/shared";
import type { Database } from "./client.js";
import { cryptoConfigRepo } from "./crypto-config.js";
import { mappingsRepo } from "./mappings.js";
import { drizzleTradesRepository } from "./repo.js";
import type { QueueProducer } from "./wire-emitter.js";
import { envelopeToSealed, sealAndPersist } from "./wire.js";

export interface MigrationOutcome {
  status: "migrated" | "replayed" | "skipped";
  reason?: string;
  direction?: string;
  sourceTradeId?: string;
  targetTradeId?: string;
}

export async function migrateFromEnvelope(
  db: Database,
  harvest: QueueProducer<HarvestMessage>,
  envelope: WireEnvelope,
): Promise<MigrationOutcome> {
  const cfg = await cryptoConfigRepo(db).ensureActive();
  if (envelope.scheme !== cfg.scheme) {
    // Sealed under a since-rotated scheme; the active keyring can't open it.
    return { status: "skipped", reason: `scheme ${envelope.scheme} != active ${cfg.scheme}` };
  }

  // 1. Open the wire message and recover the source trade.
  const source = parseCanonicalTrade(await open(envelopeToSealed(envelope), cfg.keyring));

  // 2. Map it to the counterpart system.
  const { target, direction } = mapTrade(source);

  // 3. Persist the target trade (idempotent on the source id) + the mapping link.
  const { trade: targetTrade, created } = await drizzleTradesRepository(db).create(
    target,
    `migrate-${source.id}`,
  );
  if (!created) {
    return {
      status: "replayed",
      direction,
      sourceTradeId: source.id,
      targetTradeId: targetTrade.id,
    };
  }

  await mappingsRepo(db).insert({
    sourceTradeId: source.id,
    targetTradeId: targetTrade.id,
    direction,
  });

  // 4. Re-seal the migrated trade onto the wire to the target + mirror to the tap.
  //    This is the integration layer forwarding the migrated leg, so the hop is
  //    integration → target (distinct from the system's original keystone → integration
  //    hop — they are two different sniffs, not one duplicated message).
  const { envelope: reSealed } = await sealAndPersist(db, {
    fromService: "integration",
    toService: target.system,
    payload: canonicalTradePayload(targetTrade),
  });
  await harvest.send({ envelope: reSealed });

  return { status: "migrated", direction, sourceTradeId: source.id, targetTradeId: targetTrade.id };
}
