// qstd-ui — the BFF + admin control plane. Hosts the EpochClock Durable Object and
// (for now) the era-control endpoints. Static React assets, the rest of the BFF,
// and Better Auth gating of these admin routes arrive in M6/M7 — they are open here.
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { EpochClock } from "./epoch-clock.js";

export { EpochClock };

interface Env {
  readonly NEON_DATABASE_URL: string;
  readonly EPOCH: DurableObjectNamespace<EpochClock>;
}

const epoch = (env: Env) => env.EPOCH.get(env.EPOCH.idFromName("global"));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/health" || pathname === "/api/health") {
      return Response.json({ service: "ui", status: "ok" });
    }

    // Era control (TODO M7: gate the mutating routes behind Better Auth).
    if (pathname === "/api/era" && method === "GET") {
      return Response.json(await epoch(env).getState());
    }
    if (pathname === "/api/era/advance" && method === "POST") {
      return Response.json(await epoch(env).advanceEra());
    }
    if (pathname === "/api/era/reset" && method === "POST") {
      return Response.json(await epoch(env).reset());
    }
    if (pathname === "/api/era/progress" && method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { progress?: number };
      if (typeof body.progress !== "number") {
        return Response.json(
          { error: { code: "VALIDATION_ERROR", message: "progress (number) required" } },
          { status: 400 },
        );
      }
      return Response.json(await epoch(env).setProgress(body.progress));
    }

    return new Response("Not Found", { status: 404 });
  },
};
