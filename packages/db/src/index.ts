// @qstd/db — Drizzle schema (PLAN §4), the Neon client, and the trades repository.
// Migrations are generated SQL under ./migrations; seed lives in ./src/seed.ts.
// Better Auth tables (user/session/account/verification) land in M7.

export const PACKAGE_NAME = "@qstd/db" as const;

export { getDb } from "./client.js";
export type { Database } from "./client.js";

export * as schema from "./schema.js";

export { drizzleTradesRepository, InMemoryTradesRepository } from "./repo.js";
export type { TradesRepository, ListOptions, ListResult, CreateResult } from "./repo.js";

export { cryptoConfigRepo, DEFAULT_CRYPTO_CONFIG } from "./crypto-config.js";
export type { ActiveCryptoConfig, CryptoConfigInit } from "./crypto-config.js";

export { wireMessagesRepo, sealAndPersist, sealedToEnvelope, envelopeToSealed } from "./wire.js";
export type { InsertWireMessage } from "./wire.js";

export { harvestedPacketsRepo, runBreakBatch, summarizeScorecard } from "./harvest.js";
export type {
  InsertHarvestedPacket,
  HarvestBreakRepo,
  UnattemptedPacket,
  BreakOutcome,
  BreakContextInit,
  BreakSummary,
  Scorecard,
  SchemeScore,
} from "./harvest.js";

export { createWireEmitter } from "./wire-emitter.js";
export type { WireEmitter, QueueProducer } from "./wire-emitter.js";

export { mappingsRepo } from "./mappings.js";
export type { InsertMapping } from "./mappings.js";

export { migrateFromEnvelope } from "./migration.js";
export type { MigrationOutcome } from "./migration.js";

export { getDashboardState, inspectRecent } from "./dashboard.js";
export type { DashboardState, WireSummary, InspectedPacket } from "./dashboard.js";
