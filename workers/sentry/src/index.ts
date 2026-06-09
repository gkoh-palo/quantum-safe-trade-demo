// qstd-sentry — vendor system for **asset** trades (loans, bonds). Source/target of the
// Sentry⇄Quantum migration. Trade CRUD + wire-message emission arrive in M1/M3; this
// placeholder gives the worker a deployable shape with a health probe.

interface Env {
  // Service bindings, queues and vars are added in later milestones.
  readonly ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return new Response(JSON.stringify({ service: "sentry", status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
};
