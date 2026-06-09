// @qstd/shared — cross-cutting types, trade schemas (zod), and HTTP conventions
// shared across the workers and the UI. Sentry⇄Quantum mapping rules land in M5.

export const PACKAGE_NAME = "@qstd/shared" as const;

export * from "./trades.js";
export * from "./http.js";
