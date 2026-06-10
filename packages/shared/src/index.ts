// @qstd/shared — cross-cutting types, trade schemas (zod), HTTP conventions, the
// wire-message contract, and the Sentry⇄Quantum mapping rules.

export const PACKAGE_NAME = "@qstd/shared" as const;

export * from "./trades.js";
export * from "./http.js";
export * from "./wire.js";
export * from "./mapping.js";
