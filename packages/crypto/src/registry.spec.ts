import { describe, it, expect } from "vitest";
import type { BreakMode, EncryptionScheme, SignatureScheme } from "./index.js";
import {
  ENCRYPTION_SCHEMES,
  SIGNATURE_SCHEMES,
  breakMessage,
  generateEncryptionKeys,
  generateSignatureKeys,
  open,
  schemeInfo,
  seal,
  sign,
  utf8Decode,
  utf8Encode,
  verify,
} from "./index.js";

const TRADE = JSON.stringify({
  product: "bond",
  counterparty: "CounterpartyX",
  notional: 50_000_000,
  currency: "USD",
  rate: 4.25,
});
const payload = () => utf8Encode(TRADE);

// Confidential asymmetric schemes have genuine + projected key variants; the
// rest are mode-agnostic.
const MODED: Record<EncryptionScheme, BreakMode[]> = {
  plaintext: ["genuine"],
  sha256: ["genuine"],
  "hmac-sha256": ["genuine"],
  "rsa-oaep": ["genuine", "projected"],
  "ecdh-aes": ["genuine", "projected"],
  "hybrid-mlkem": ["genuine"],
};

describe("round-trip: seal → open recovers the payload for every scheme", () => {
  for (const scheme of ENCRYPTION_SCHEMES) {
    for (const mode of MODED[scheme]) {
      it(`${scheme} (${mode})`, async () => {
        const keys = await generateEncryptionKeys(scheme, mode);
        const msg = await seal(scheme, payload(), keys);
        expect(msg.scheme).toBe(scheme);
        expect(utf8Decode(await open(msg, keys))).toBe(TRADE);
      });
    }
  }
});

describe("wire shape matches the scheme's construction", () => {
  it("confidential schemes carry a nonce; non-confidential send cleartext", async () => {
    const plain = await seal(
      "plaintext",
      payload(),
      await generateEncryptionKeys("plaintext", "genuine"),
    );
    expect(plain.nonce).toBeNull();
    expect(utf8Decode(plain.ciphertext)).toBe(TRADE); // cleartext on the wire

    const rsa = await seal(
      "rsa-oaep",
      payload(),
      await generateEncryptionKeys("rsa-oaep", "genuine"),
    );
    expect(rsa.nonce).not.toBeNull();
    expect(rsa.encapsulatedKey).not.toBeNull();
    expect(utf8Decode(rsa.ciphertext)).not.toBe(TRADE); // genuinely encrypted
  });

  it("hmac-sha256 attaches a MAC and open rejects tampering", async () => {
    const keys = await generateEncryptionKeys("hmac-sha256", "genuine");
    const msg = await seal("hmac-sha256", payload(), keys);
    expect(msg.mac).not.toBeNull();
    const tampered = { ...msg, ciphertext: utf8Encode(TRADE.replace("50000000", "99999999")) };
    await expect(open(tampered, keys)).rejects.toThrow();
  });
});

// The headline gate (CLAUDE.md): classical schemes are recoverable in the
// quantum era; the PQC scheme is NOT — in either break mode.
describe("break engine: classical breaks, PQC holds", () => {
  const QUANTUM_ERA = 100;

  it("non-confidential schemes are trivially readable", async () => {
    for (const scheme of ["plaintext", "sha256", "hmac-sha256"] as const) {
      const keys = await generateEncryptionKeys(scheme, "genuine");
      const msg = await seal(scheme, payload(), keys);
      const result = await breakMessage(msg, { mode: "genuine", crqcProgress: QUANTUM_ERA, keys });
      expect(result.recovered).toBe(true);
      expect(result.method).toBe("plaintext");
      expect(result.plaintext).toBe(TRADE);
    }
  });

  for (const scheme of ["rsa-oaep", "ecdh-aes"] as const) {
    it(`${scheme} (genuine) breaks live and recovers the plaintext`, async () => {
      const keys = await generateEncryptionKeys(scheme, "genuine");
      const msg = await seal(scheme, payload(), keys);
      const result = await breakMessage(msg, { mode: "genuine", crqcProgress: QUANTUM_ERA, keys });
      expect(result.recovered).toBe(true);
      expect(result.method).toBe(scheme === "rsa-oaep" ? "shor-rsa" : "shor-ecdh");
      expect(result.plaintext).toBe(TRADE);
    });

    it(`${scheme} (projected) is gated below 100% then reveals at 100%`, async () => {
      const keys = await generateEncryptionKeys(scheme, "projected");
      const msg = await seal(scheme, payload(), keys);

      const gated = await breakMessage(msg, { mode: "projected", crqcProgress: 60, keys });
      expect(gated.recovered).toBe(false);
      expect(gated.method).toBe("failed");
      expect(gated.plaintext).toBeNull();

      const revealed = await breakMessage(msg, {
        mode: "projected",
        crqcProgress: QUANTUM_ERA,
        keys,
      });
      expect(revealed.recovered).toBe(true);
      expect(revealed.plaintext).toBe(TRADE);
    });
  }

  it("hybrid-mlkem is NEVER recovered — in any mode, even at 100% CRQC", async () => {
    const keys = await generateEncryptionKeys("hybrid-mlkem", "genuine");
    const msg = await seal("hybrid-mlkem", payload(), keys);
    for (const mode of ["genuine", "projected"] as const) {
      const result = await breakMessage(msg, { mode, crqcProgress: QUANTUM_ERA, keys });
      expect(result.recovered).toBe(false);
      expect(result.method).toBe("failed");
      expect(result.plaintext).toBeNull();
    }
    // ...yet the legitimate holder still opens it fine.
    expect(utf8Decode(await open(msg, keys))).toBe(TRADE);
  });

  it("registry metadata marks exactly one confidential scheme quantum-safe", () => {
    const confidential = ENCRYPTION_SCHEMES.filter((s) => schemeInfo(s).confidential);
    const safe = confidential.filter((s) => schemeInfo(s).quantumSafe);
    expect(safe).toEqual(["hybrid-mlkem"]);
  });
});

describe("signatures: sign/verify and rejection", () => {
  for (const scheme of SIGNATURE_SCHEMES as SignatureScheme[]) {
    it(`${scheme} verifies a genuine signature and rejects forgery/tampering`, () => {
      const keys = generateSignatureKeys(scheme);
      const message = payload();
      const signature = sign(scheme, message, keys.secretKey);
      expect(verify(scheme, signature, message, keys.publicKey)).toBe(true);

      // Tampered message must not verify.
      expect(verify(scheme, signature, utf8Encode(TRADE + " "), keys.publicKey)).toBe(false);

      // A different keypair's public key must not verify.
      const other = generateSignatureKeys(scheme);
      expect(verify(scheme, signature, message, other.publicKey)).toBe(false);
    });
  }
});
