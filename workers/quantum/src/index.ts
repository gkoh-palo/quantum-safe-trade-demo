// qstd-quantum — vendor system for **liability** trades (FX, IRS, CCS). Receives
// migrated trades from the integration layer. Trade CRUD via the Hono app in
// ./app.ts, backed by the Drizzle trades repository over Neon. Wire handling: M3.
import { drizzleTradesRepository, getDb } from "@qstd/db";
import { createApp } from "./app.js";

interface Env {
  readonly NEON_DATABASE_URL: string;
  // Service bindings, queues and vars are added in later milestones.
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const repo = drizzleTradesRepository(getDb(env.NEON_DATABASE_URL));
    return createApp(repo).fetch(request);
  },
};
