// Drizzle schema for the PLAN §4 data model. All tables are defined here so a
// single migration provisions everything; M1 only exercises `trades`, the rest
// (crypto_config, mappings, wire_messages, harvested_packets, audit_log) are wired
// by M3/M4. Better Auth tables (user/session/account/verification) land in M7.
import {
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Postgres bytea ↔ Uint8Array. The neon-http driver returns bytea as a hex string
// ("\\x..."); the read path is refined in M3 when ciphertext is actually fetched.
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Current security posture — a single active row, versioned for audit (PLAN §5). */
export const cryptoConfig = pgTable("crypto_config", {
  id: id(),
  active: boolean("active").notNull().default(true),
  scheme: text("scheme").notNull(),
  era: text("era").notNull().default("classical"), // 'classical' | 'quantum'
  crqcProgress: integer("crqc_progress").notNull().default(0), // 0..100
  breakMode: text("break_mode").notNull().default("projected"), // 'genuine' | 'projected'
  kemPublicKey: bytea("kem_public_key"),
  kemSecretRef: text("kem_secret_ref"),
  classicalPub: bytea("classical_pub"),
  classicalPrivSize: integer("classical_priv_size"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Trades on either system (PLAN §4). */
export const trades = pgTable("trades", {
  id: id(),
  system: text("system").notNull(), // 'sentry' | 'quantum'
  assetClass: text("asset_class").notNull(), // 'asset' | 'liability'
  product: text("product").notNull(), // loan|bond|fx|irs|ccs
  counterparty: text("counterparty").notNull(),
  notional: numeric("notional", { precision: 20, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  rate: numeric("rate", { precision: 12, scale: 6 }).notNull(),
  tenor: text("tenor").notNull(),
  tradeDate: text("trade_date").notNull(), // ISO YYYY-MM-DD
  status: text("status").notNull().default("active"),
  payloadJson: jsonb("payload_json").notNull(), // canonical trade body
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: createdAt(),
});

/** Sentry⇄Quantum migration links (PLAN §4; populated in M5). */
export const mappings = pgTable("mappings", {
  id: id(),
  sourceTradeId: uuid("source_trade_id").notNull(),
  targetTradeId: uuid("target_trade_id"),
  direction: text("direction").notNull(), // 'sentry->quantum' | 'quantum->sentry'
  rulesVersion: text("rules_version").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: createdAt(),
});

/** Every inter-service payload — the security-relevant object (PLAN §4/§8). */
export const wireMessages = pgTable("wire_messages", {
  id: id(),
  fromService: text("from_service").notNull(),
  toService: text("to_service").notNull(),
  scheme: text("scheme").notNull(),
  eraAtSend: text("era_at_send").notNull(),
  ciphertext: bytea("ciphertext").notNull(),
  nonce: bytea("nonce"),
  encapsulatedKey: bytea("encapsulated_key"),
  signature: bytea("signature"),
  sigScheme: text("sig_scheme"),
  plaintextSha256: bytea("plaintext_sha256").notNull(),
  createdAt: createdAt(),
});

/** Eve's loot — captured packets and (post-break) what was recovered (PLAN §4). */
export const harvestedPackets = pgTable("harvested_packets", {
  id: id(),
  wireMessageId: uuid("wire_message_id").notNull(),
  harvestedAt: timestamp("harvested_at", { withTimezone: true }).notNull().defaultNow(),
  broken: boolean("broken").notNull().default(false),
  breakMethod: text("break_method"), // 'shor-rsa'|'shor-ecdh'|'plaintext'|'failed'
  recoveredPlaintext: jsonb("recovered_plaintext"),
  brokenAt: timestamp("broken_at", { withTimezone: true }),
  exposedNotional: numeric("exposed_notional", { precision: 20, scale: 2 }),
  exposedCounterparty: text("exposed_counterparty"),
});

/** Append-only event log that powers the timeline UI (PLAN §4). */
export const auditLog = pgTable("audit_log", {
  id: id(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  event: text("event").notNull(),
  detail: jsonb("detail"),
});
