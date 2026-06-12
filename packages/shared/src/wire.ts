// The wire-message contract (/api-design skill) + the queue message shapes. This
// is the security-relevant object that crosses services — both the legitimate
// consumer (integration) and the wiretap (hacker) read it, so it must stay stable.
// Byte fields are hex so the envelope is plain JSON (safe over Queues and in jsonb).
import type { EncryptionScheme } from "@qstd/crypto";
import type { System, Trade, TradeInput } from "./trades.js";

export type Era = "classical" | "quantum";

/**
 * A wire endpoint: a trading system or the integration layer. Trades hop
 * keystone/helix → integration → the counterpart system, so the wire records the
 * integration layer as a distinct sender (not just the two systems).
 */
export type WireService = System | "integration";

/** A sealed inter-service message, ready for transport. Mirrors `wire_messages`. */
export interface WireEnvelope {
  wireMessageId: string;
  fromService: WireService;
  toService: WireService;
  scheme: EncryptionScheme;
  eraAtSend: Era;
  ciphertextHex: string;
  nonceHex: string | null;
  encapsulatedKeyHex: string | null;
  macHex: string | null;
  plaintextSha256Hex: string;
}

/** `trade-migration` queue: the legitimate Keystone⇄Helix handoff (consumed by integration). */
export interface MigrationMessage {
  envelope: WireEnvelope;
}

/** `harvest-tap` queue: the ciphertext mirror Eve sniffs off the wire (consumed by hacker). */
export interface HarvestMessage {
  envelope: WireEnvelope;
}

const encoder = new TextEncoder();

/** Canonical bytes that get sealed for a trade — a stable JSON field order. */
export function canonicalTradePayload(trade: Trade | TradeInput): Uint8Array {
  const t = trade as Trade;
  return encoder.encode(
    JSON.stringify({
      id: "id" in trade ? t.id : undefined,
      system: trade.system,
      assetClass: trade.assetClass,
      product: trade.product,
      counterparty: trade.counterparty,
      notional: trade.notional,
      currency: trade.currency,
      rate: trade.rate,
      tenor: trade.tenor,
      tradeDate: trade.tradeDate,
      status: trade.status,
    }),
  );
}
