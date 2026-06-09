// qstd-integration — maps & migrates trades both directions, re-shaping and re-encrypting
// payloads. Consumes the `trade-migration` queue and mirrors ciphertext to `harvest-tap`.
// Mapper + queue consumer arrive in M3/M5; this placeholder gives the worker a deployable
// shape with a health probe.

interface Env {
  // Service bindings (SENTRY, QUANTUM), queues and vars are added in later milestones.
  readonly ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return new Response(JSON.stringify({ service: "integration", status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
};
