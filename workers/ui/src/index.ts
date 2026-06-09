// qstd-ui — the BFF + admin control plane. Serves the React pitch/admin app and owns
// /api/* (control + read) plus the EpochClock Durable Object and Better Auth (/api/auth/*).
// BFF endpoints, auth and asset serving arrive in M6/M7; this placeholder gives the worker
// a deployable shape with a health probe.

interface Env {
  // ASSETS binding, EpochClock DO, service bindings and auth secrets are added in later milestones.
  readonly ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health" || pathname === "/api/health") {
      return new Response(JSON.stringify({ service: "ui", status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
};
