// Admin control plane (PLAN §7/§11). Token-gated for now via x-admin-token /
// env.ADMIN_TOKEN — the break-glass header §11 keeps anyway; Better Auth session
// gating is the M7b follow-up. Routes: set scheme + break mode (rotates the active
// keyring), set CRQC progress, inject a trade (via service binding), raw inspector.
import type { DurableObjectNamespace, Fetcher } from "@cloudflare/workers-types";
import { ENCRYPTION_SCHEMES } from "@qstd/crypto";
import type { BreakMode, EncryptionScheme } from "@qstd/crypto";
import { clearDemoData, cryptoConfigRepo, getDb, inspectRecent } from "@qstd/db";
import type { EpochClock } from "./epoch-clock.js";

export interface AdminEnv {
  readonly NEON_DATABASE_URL: string;
  readonly ADMIN_TOKEN?: string;
  readonly EPOCH: DurableObjectNamespace<EpochClock>;
  readonly SENTRY: Fetcher;
  readonly QUANTUM: Fetcher;
}

const BREAK_MODES: readonly BreakMode[] = ["genuine", "projected"];

export interface SchemeRequest {
  scheme: EncryptionScheme;
  breakMode: BreakMode;
}

/** Validate a set-scheme body. Pure, so it's unit-testable. */
export function parseSchemeBody(body: unknown): SchemeRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { scheme, breakMode } = body as { scheme?: unknown; breakMode?: unknown };
  if (!ENCRYPTION_SCHEMES.includes(scheme as EncryptionScheme)) return null;
  if (!BREAK_MODES.includes(breakMode as BreakMode)) return null;
  return { scheme: scheme as EncryptionScheme, breakMode: breakMode as BreakMode };
}

const json = (data: unknown, status = 200) => Response.json(data as object, { status });
const epoch = (env: AdminEnv) => env.EPOCH.get(env.EPOCH.idFromName("global"));

/** Handle an /api/admin/* request, or return null if the path isn't an admin route. */
export async function handleAdmin(
  request: Request,
  env: AdminEnv,
  pathname: string,
  method: string,
): Promise<Response | null> {
  if (!pathname.startsWith("/api/admin/")) return null;

  // Break-glass token gate.
  if (!env.ADMIN_TOKEN || request.headers.get("x-admin-token") !== env.ADMIN_TOKEN) {
    return json({ error: { code: "UNAUTHENTICATED", message: "admin token required" } }, 401);
  }

  const db = getDb(env.NEON_DATABASE_URL);

  // Rotate the active scheme + break mode (regenerates the keyring).
  if (pathname === "/api/admin/scheme" && method === "POST") {
    const parsed = parseSchemeBody(await request.json().catch(() => null));
    if (!parsed)
      return json(
        { error: { code: "VALIDATION_ERROR", message: "scheme + breakMode required" } },
        400,
      );
    const cfg = await cryptoConfigRepo(db).setActive(parsed);
    return json({
      scheme: cfg.scheme,
      breakMode: cfg.breakMode,
      era: cfg.era,
      crqcProgress: cfg.crqcProgress,
    });
  }

  // Set the CRQC countdown (intermediate values stay classical until 100%).
  if (pathname === "/api/admin/crqc" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { progress?: number };
    if (typeof body.progress !== "number") {
      return json(
        { error: { code: "VALIDATION_ERROR", message: "progress (number) required" } },
        400,
      );
    }
    return json(await epoch(env).setProgress(body.progress));
  }

  // Inject a trade — forwarded to the originating worker via a service binding, so it
  // goes through the real seal + emit path.
  if (pathname === "/api/admin/trade" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { system?: string };
    const target = body.system === "quantum" ? env.QUANTUM : env.SENTRY;
    const res = await target.fetch(
      new Request("https://svc/trades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Raw inspector: recent loot, ciphertext preview + recovered plaintext.
  if (pathname === "/api/admin/inspect" && method === "GET") {
    return json(await inspectRecent(db));
  }

  // Wipe trades + wire + loot for a clean slate (resets the era too).
  if (pathname === "/api/admin/reset-archive" && method === "POST") {
    await clearDemoData(db);
    await epoch(env).reset();
    return json({ ok: true });
  }

  return json({ error: { code: "NOT_FOUND", message: "Unknown admin endpoint" } }, 404);
}
