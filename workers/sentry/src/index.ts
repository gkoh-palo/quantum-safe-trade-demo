// qstd-sentry — vendor system for **asset** trades (loans, bonds). Source/target of
// the Sentry⇄Quantum migration. Trade CRUD via the Hono app in ./app.ts, backed by
// the Drizzle trades repository over Neon. Wire-message emission arrives in M3.
import { drizzleTradesRepository, getDb } from "@qstd/db";
import { createApp } from "./app.js";

interface Env {
  readonly NEON_DATABASE_URL: string;
  // Service bindings, queues and the harvest tap are added in later milestones.
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const repo = drizzleTradesRepository(getDb(env.NEON_DATABASE_URL));
    return createApp(repo).fetch(request);
  },
};
