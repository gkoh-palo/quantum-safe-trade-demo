import { describe, it, expect } from "vitest";
import type { BreakMode, EncryptionScheme } from "./index.js";
import {
  breakMessage,
  deserializeKeyMaterial,
  generateEncryptionKeys,
  open,
  seal,
  serializeKeyMaterial,
  utf8Decode,
  utf8Encode,
} from "./index.js";

const PAYLOAD = JSON.stringify({ product: "bond", notional: 50_000_000 });

const CASES: Array<[EncryptionScheme, BreakMode]> = [
  ["plaintext", "genuine"],
  ["sha256", "genuine"],
  ["hmac-sha256", "genuine"],
  ["rsa-oaep", "genuine"],
  ["rsa-oaep", "projected"],
  ["ecdh-aes", "genuine"],
  ["ecdh-aes", "projected"],
  ["hybrid-mlkem", "genuine"],
];

describe("KeyMaterial serialization survives a JSON round-trip", () => {
  for (const [scheme, mode] of CASES) {
    it(`${scheme} (${mode}): seal with original keys, open with deserialized keys`, async () => {
      const keys = await generateEncryptionKeys(scheme, mode);
      const serialized = await serializeKeyMaterial(keys);

      // Prove it is genuinely JSON-safe (would throw on bigint / Uint8Array / CryptoKey).
      const revived = await deserializeKeyMaterial(JSON.parse(JSON.stringify(serialized)));

      const msg = await seal(scheme, utf8Encode(PAYLOAD), keys);
      expect(utf8Decode(await open(msg, revived))).toBe(PAYLOAD);
    });
  }

  it("deserialized projected keys still drive the gated break at 100% CRQC", async () => {
    const keys = await generateEncryptionKeys("rsa-oaep", "projected");
    const revived = await deserializeKeyMaterial(
      JSON.parse(JSON.stringify(await serializeKeyMaterial(keys))),
    );
    const msg = await seal("rsa-oaep", utf8Encode(PAYLOAD), keys);
    const result = await breakMessage(msg, { mode: "projected", crqcProgress: 100, keys: revived });
    expect(result.recovered).toBe(true);
    expect(result.plaintext).toBe(PAYLOAD);
  });
});
