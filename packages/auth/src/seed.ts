// Seed the per-system demo users (PLAN §11a — admin-seeded, no public sign-up).
// Idempotent. Run with: pnpm --filter @qstd/auth seed
// Needs NEON_DATABASE_URL + BETTER_AUTH_SECRET (e.g. in packages/auth/.env).
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

import { getDb } from "@qstd/db";
import { createAuth, seedUser } from "./index.js";
import type { AuthSystem } from "./index.js";

const SEED: Record<AuthSystem, { name: string; email: string; password: string }[]> = {
  sentry: [{ name: "Sentry Demo", email: "demo@sentry.local", password: "password1234" }],
  quantum: [{ name: "Quantum Demo", email: "demo@quantum.local", password: "password1234" }],
};

async function main(): Promise<void> {
  const url = process.env.NEON_DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!url) throw new Error("NEON_DATABASE_URL is required to seed users");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to seed users");

  const db = getDb(url);
  for (const system of ["sentry", "quantum"] as const) {
    const auth = createAuth({ db, system, secret, baseURL: "http://localhost" });
    for (const user of SEED[system]) {
      const result = await seedUser(auth, user);
      console.warn(`seed: ${system} ${user.email} → ${result}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
