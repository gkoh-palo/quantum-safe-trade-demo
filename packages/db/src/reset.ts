// Full demo reset (PLAN §7 "replay / reset the archive", §9 M9). Wipes the trade +
// wire + loot tables for a clean slate — e.g. after reconfiguring the active scheme,
// so stale packets sealed under an old keyring don't linger. Keeps crypto_config.
import type { Database } from "./client.js";
import { harvestedPackets, mappings, trades, wireMessages } from "./schema.js";

export async function clearDemoData(db: Database): Promise<void> {
  await db.delete(harvestedPackets);
  await db.delete(mappings);
  await db.delete(wireMessages);
  await db.delete(trades);
}
