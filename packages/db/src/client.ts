// Neon + Drizzle client. Default to the neon-http driver (one round-trip per
// query, no connection management) — the WebSocket Pool is only for multi-statement
// transactions (the M5 mapping insert). /neon-db skill.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof getDb>;

/** Build a Drizzle client over Neon HTTP. Pass `env.NEON_DATABASE_URL` in. */
export function getDb(databaseUrl: string): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(neon(databaseUrl), { schema });
}
