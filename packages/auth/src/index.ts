// @qstd/auth — per-system Better Auth (PLAN §11a). Keystone and Helix each create
// their own instance against the shared Neon DB, mapped onto that system's
// namespaced tables (keystone_* / helix_*). Email+password, self sign-up disabled
// (accounts are admin-seeded). Kept in its own package so `better-auth` only lands
// in the keystone/helix bundles.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authSchema } from "@qstd/db";
import type { Database } from "@qstd/db";

export interface SeedUserInput {
  name: string;
  email: string;
  password: string;
}

export type AuthSystem = "keystone" | "helix";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthOptions {
  db: Database;
  system: AuthSystem;
  secret: string;
  /** This worker's public origin, e.g. https://qstd-keystone.gkoh.workers.dev */
  baseURL: string;
  /**
   * Allow email/password sign-up. Default false (public registration is disabled —
   * accounts are admin-seeded). The seed script sets this true on its own instance to
   * create users; the runtime workers leave it false. Login is never gated by this.
   */
  allowSignUp?: boolean;
}

/** The slice of Better Auth the workers use — injectable, so handlers are testable. */
export interface AuthProvider {
  /** Mount at /api/auth/* — Better Auth's fetch handler. */
  handler(request: Request): Promise<Response>;
  /** Resolve the logged-in user from the request cookies, or null. */
  requireUser(request: Request): Promise<SessionUser | null>;
  /** Server-side user creation (seeding) — bypasses the disabled public sign-up. */
  signUp(user: SeedUserInput): Promise<void>;
}

export function createAuth(opts: AuthOptions): AuthProvider {
  const auth = betterAuth({
    database: drizzleAdapter(opts.db, { provider: "pg", schema: authSchema[opts.system] }),
    emailAndPassword: { enabled: true, disableSignUp: !opts.allowSignUp },
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: "/api/auth",
  });

  return {
    handler: (request) => auth.handler(request),
    requireUser: async (request) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) return null;
      const { id, email, name } = session.user;
      return { id, email, name };
    },
    signUp: async (user) => {
      await auth.api.signUpEmail({ body: user });
    },
  };
}

/**
 * Idempotently seed a user. The `auth` must be created with `allowSignUp: true`
 * (sign-up is off on the runtime instances). A genuine duplicate is treated as
 * "exists"; any other failure is re-thrown so seeding can't fail silently.
 */
export async function seedUser(
  auth: AuthProvider,
  user: SeedUserInput,
): Promise<"created" | "exists"> {
  try {
    await auth.signUp(user);
    return "created";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists|USER_ALREADY_EXISTS|duplicate/i.test(msg)) return "exists";
    throw err;
  }
}
