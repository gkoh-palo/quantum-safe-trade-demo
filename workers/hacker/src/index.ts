// qstd-hacker — Eve, the passive wiretap (harvest now, decrypt later). Mirrors ciphertext
// into the HarvestArchive Durable Object and runs the break engine when the quantum era
// arrives. HarvestArchive DO + break engine arrive in M3/M4; this placeholder gives the
// worker a deployable shape with a health probe.

interface Env {
  // HarvestArchive DO binding, the `harvest-tap` queue and vars are added in later milestones.
  readonly ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return new Response(JSON.stringify({ service: "hacker", status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
};
