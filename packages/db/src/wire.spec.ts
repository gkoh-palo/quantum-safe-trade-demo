import { describe, it, expect } from "vitest";
import { generateEncryptionKeys, open, seal, utf8Decode, utf8Encode } from "@qstd/crypto";
import { envelopeToSealed, sealedToEnvelope } from "./wire.js";

// The envelope is what crosses the queues / lands in jsonb. It must losslessly
// represent a SealedMessage so the legitimate holder can still open it.
describe("wire envelope <-> sealed message round-trip", () => {
  it("preserves a confidential sealed message (rsa-oaep) through the hex envelope", async () => {
    const payload = JSON.stringify({ product: "bond", notional: 50_000_000 });
    const keys = await generateEncryptionKeys("rsa-oaep", "projected");
    const sealed = await seal("rsa-oaep", utf8Encode(payload), keys);

    const env = sealedToEnvelope("wm-1", "keystone", "helix", "classical", sealed);
    expect(env.scheme).toBe("rsa-oaep");
    expect(env.nonceHex).not.toBeNull();
    expect(env.encapsulatedKeyHex).not.toBeNull();

    expect(utf8Decode(await open(envelopeToSealed(env), keys))).toBe(payload);
  });

  it("handles non-confidential schemes with null nonce / encapsulatedKey", async () => {
    const payload = "raw trade body";
    const keys = await generateEncryptionKeys("plaintext", "genuine");
    const sealed = await seal("plaintext", utf8Encode(payload), keys);

    const env = sealedToEnvelope("wm-2", "helix", "keystone", "classical", sealed);
    expect(env.nonceHex).toBeNull();
    expect(env.encapsulatedKeyHex).toBeNull();
    expect(utf8Decode(await open(envelopeToSealed(env), keys))).toBe(payload);
  });
});
