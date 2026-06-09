// Active crypto posture (PLAN §4/§5): the single active row holds the scheme, era,
// CRQC progress, break mode, and the serialized keyring. Workers read it to seal;
// M4 reads it to break; M7 admin rotates it.
import { desc, eq } from "drizzle-orm";
import type { BreakMode, EncryptionScheme, KeyMaterial, SerializedKeyMaterial } from "@qstd/crypto";
import { deserializeKeyMaterial, generateEncryptionKeys, serializeKeyMaterial } from "@qstd/crypto";
import type { Era } from "@qstd/shared";
import type { Database } from "./client.js";
import { cryptoConfig } from "./schema.js";

export interface ActiveCryptoConfig {
  id: string;
  scheme: EncryptionScheme;
  era: Era;
  crqcProgress: number;
  breakMode: BreakMode;
  keyring: KeyMaterial;
}

export interface CryptoConfigInit {
  scheme: EncryptionScheme;
  breakMode: BreakMode;
  era?: Era;
  crqcProgress?: number;
}

/** The out-of-the-box posture: a real classical scheme, projected break mode. */
export const DEFAULT_CRYPTO_CONFIG: CryptoConfigInit = {
  scheme: "rsa-oaep",
  breakMode: "projected",
  era: "classical",
  crqcProgress: 0,
};

type Row = typeof cryptoConfig.$inferSelect;

async function rowToActive(row: Row): Promise<ActiveCryptoConfig> {
  return {
    id: row.id,
    scheme: row.scheme as EncryptionScheme,
    era: row.era as Era,
    crqcProgress: row.crqcProgress,
    breakMode: row.breakMode as BreakMode,
    keyring: await deserializeKeyMaterial(row.keyring as SerializedKeyMaterial),
  };
}

export function cryptoConfigRepo(db: Database) {
  const repo = {
    async getActive(): Promise<ActiveCryptoConfig | null> {
      const rows = await db
        .select()
        .from(cryptoConfig)
        .where(eq(cryptoConfig.active, true))
        .orderBy(desc(cryptoConfig.createdAt))
        .limit(1);
      const row = rows[0];
      return row && row.keyring ? rowToActive(row) : null;
    },

    /** Generate a fresh keyring for `init`, deactivate any current row, insert + activate. */
    async setActive(init: CryptoConfigInit): Promise<ActiveCryptoConfig> {
      const keyring = await serializeKeyMaterial(
        await generateEncryptionKeys(init.scheme, init.breakMode),
      );
      await db.update(cryptoConfig).set({ active: false }).where(eq(cryptoConfig.active, true));
      const inserted = await db
        .insert(cryptoConfig)
        .values({
          active: true,
          scheme: init.scheme,
          era: init.era ?? "classical",
          crqcProgress: init.crqcProgress ?? 0,
          breakMode: init.breakMode,
          keyring,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("cryptoConfig.setActive: insert returned no row");
      return rowToActive(row);
    },

    /** Active config, bootstrapping the default posture on first use. */
    async ensureActive(
      init: CryptoConfigInit = DEFAULT_CRYPTO_CONFIG,
    ): Promise<ActiveCryptoConfig> {
      return (await repo.getActive()) ?? (await repo.setActive(init));
    },
  };
  return repo;
}
