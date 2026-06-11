// Drizzle schema for the PLAN §4 data model + the Phase 2 Better Auth tables.
// crypto_config / trades / mappings / wire_messages / harvested_packets / audit_log
// (M1–M5), plus per-system Better Auth tables (keystone_* / helix_*, M10/§11a).
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
  // Serialized KeyMaterial for the active scheme (PLAN §4 stores public + a secret
  // ref; for this single-env demo we keep the whole keyring here — Eve taps the
  // wire, never the DB). See @qstd/crypto SerializedKeyMaterial.
  keyring: jsonb("keyring"),
  // Cron auto-mode (PLAN §3): trade-generator keeps the wire live; epoch-tick advances CRQC.
  autoGenerate: boolean("auto_generate").notNull().default(false),
  autoTick: boolean("auto_tick").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Trades on either system (PLAN §4). */
export const trades = pgTable("trades", {
  id: id(),
  system: text("system").notNull(), // 'keystone' | 'helix'
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
  bookedBy: text("booked_by"), // Phase 2: the system user who booked it (per-user blotter)
  createdAt: createdAt(),
});

/** Keystone⇄Helix migration links (PLAN §4; populated in M5). */
export const mappings = pgTable("mappings", {
  id: id(),
  sourceTradeId: uuid("source_trade_id").notNull(),
  targetTradeId: uuid("target_trade_id"),
  direction: text("direction").notNull(), // 'keystone->helix' | 'helix->keystone'
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
  mac: bytea("mac"), // hmac-sha256 scheme only
  signature: bytea("signature"),
  sigScheme: text("sig_scheme"),
  plaintextSha256: bytea("plaintext_sha256").notNull(),
  createdAt: createdAt(),
});

/** Eve's loot — captured packets and (post-break) what was recovered (PLAN §4). */
export const harvestedPackets = pgTable("harvested_packets", {
  id: id(),
  wireMessageId: uuid("wire_message_id").notNull(),
  scheme: text("scheme"), // denormalised for scorecard grouping
  envelope: jsonb("envelope"), // the sniffed WireEnvelope — what Eve breaks against
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

// --- Better Auth tables, namespaced per system (Phase 2 / PLAN §11a) ---------
// Keystone and Helix each run their own Better Auth instance against this one DB,
// so each system's user/session/account/verification tables are prefixed. Columns
// match Better Auth's core schema (property names are the Better Auth field names;
// DB column names are snake_case). @qstd/auth maps these into each auth instance.
const ts = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const tsUpd = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

function authTableSet(prefix: string) {
  const user = pgTable(`${prefix}_user`, {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: ts(),
    updatedAt: tsUpd(),
  });
  const session = pgTable(`${prefix}_session`, {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: ts(),
    updatedAt: tsUpd(),
  });
  const account = pgTable(`${prefix}_account`, {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: ts(),
    updatedAt: tsUpd(),
  });
  const verification = pgTable(`${prefix}_verification`, {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: ts(),
    updatedAt: tsUpd(),
  });
  return { user, session, account, verification };
}

const keystoneAuthTables = authTableSet("keystone");
const helixAuthTables = authTableSet("helix");

// Exported individually so drizzle-kit picks them up.
export const keystoneUser = keystoneAuthTables.user;
export const keystoneSession = keystoneAuthTables.session;
export const keystoneAccount = keystoneAuthTables.account;
export const keystoneVerification = keystoneAuthTables.verification;
export const helixUser = helixAuthTables.user;
export const helixSession = helixAuthTables.session;
export const helixAccount = helixAuthTables.account;
export const helixVerification = helixAuthTables.verification;

/** The four-table Better Auth schema for a system, keyed by Better Auth model name. */
export const authSchema = {
  keystone: {
    user: keystoneUser,
    session: keystoneSession,
    account: keystoneAccount,
    verification: keystoneVerification,
  },
  helix: {
    user: helixUser,
    session: helixSession,
    account: helixAccount,
    verification: helixVerification,
  },
} as const;
