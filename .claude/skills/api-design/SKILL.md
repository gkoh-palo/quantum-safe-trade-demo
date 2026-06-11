---
name: api-design
description: REST/API conventions for the keystone, helix, integration and ui (BFF) workers — resource naming, status codes, Zod validation, error envelope, pagination, idempotency, and the wire-message contract. Use when adding or changing any HTTP endpoint, RPC method, or request/response shape.
---

# API design — repo conventions

Endpoints are small and consistent across the three business Workers and the BFF. Use
[Hono](https://hono.dev) as the router on each Worker (lightweight, Workers-native).

## Resource shape

| Worker        | Base       | Resources                                                |
| ------------- | ---------- | -------------------------------------------------------- |
| `keystone`    | `/trades`  | asset trades (loan, bond)                                |
| `helix`       | `/trades`  | liability trades (fx, irs, ccs)                          |
| `integration` | `/migrate` | queue-driven; minimal HTTP (health + manual replay)      |
| `ui` (BFF)    | `/api/*`   | aggregation, admin controls, `/api/auth/*` (Better Auth) |

- Plural nouns, no verbs in paths (`POST /trades`, not `/createTrade`).
- Versioning only if needed: `/v1` prefix; default unversioned for the demo.
- Mutating control actions on the BFF read clearly: `POST /api/admin/era/advance`,
  `POST /api/admin/scheme`, `POST /api/admin/trades`, `POST /api/admin/reset`.

## Validation — Zod at the edge

Every request body/query is parsed with a Zod schema from `packages/shared`. Reject invalid
input with `400` before any work. Share the same schemas client-side for type safety.

```ts
const CreateTrade = z.object({
  product: z.enum(["loan", "bond", "fx", "irs", "ccs"]),
  counterparty: z.string().min(1),
  notional: z.number().positive(),
  currency: z.string().length(3),
  rate: z.number(),
  tenor: z.string(),
});
```

## Status codes

`200` read · `201` created (return the resource + `Location`) · `202` accepted (queued
migration) · `400` validation · `401` unauthenticated (admin) · `404` · `409` conflict
(idempotency/dup) · `500` unexpected. Don't invent others.

## Error envelope (consistent everywhere)

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "human readable",
    "details": [
      /* zod issues */
    ],
  },
}
```

Success returns the bare resource or `{ "data": ..., "page": ... }` for collections. Never
leak stack traces or secrets in `message`.

## Pagination & filtering

Cursor or limit/offset: `GET /trades?limit=50&cursor=<id>&system=keystone`. Always cap `limit`
(default 50, max 200). Return `nextCursor` when more exist.

## Idempotency

Trade creation and migration accept an `Idempotency-Key` header; dedupe on it so the
trade-generator cron and manual injects never double-insert. Return `409` or the existing
resource on replay.

## The wire-message contract (cross-service)

The migration payload is the security-relevant object. Keep it stable — both the legit
consumer and the hacker read it.

```ts
interface WireMessage {
  id: string;
  fromService: "keystone" | "helix";
  toService: "keystone" | "helix";
  scheme: SchemeKey; // see /crypto registry
  eraAtSend: "classical" | "quantum";
  ciphertext: Uint8Array;
  nonce?: Uint8Array;
  encapsulatedKey?: Uint8Array; // KEM ct (ecdh/hybrid)
  signature?: Uint8Array;
  sigScheme?: "ecdsa-p256" | "ml-dsa-65";
}
```

Encrypt/sign via the `/crypto` registry (`seal`/`sign`); never hand-roll crypto in a route.

## Auth boundary

Public: Pitch reads (`GET /api/state`, `GET /api/wire`). Protected: everything under
`/api/admin/*` — checked by Better Auth session (or `ADMIN_TOKEN` break-glass for cron).
Business Workers trust only Service-Binding calls from the BFF/integration, not the public
internet.
