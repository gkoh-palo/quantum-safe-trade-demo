// sha256 — attaches a SHA-256 digest for integrity but does NOT encrypt. The
// payload still rides the wire in clear. Teaches: hashing ≠ encryption.
import type { EncryptionSchemeImpl } from "../types.js";
import { sha256Bytes } from "../aead.js";
import { bytesEqual, utf8Decode } from "../bytes.js";

export const sha256Scheme: EncryptionSchemeImpl = {
  info: {
    key: "sha256",
    label: "SHA-256 (hash only)",
    construction: "SHA-256 digest of payload, payload sent in clear",
    confidential: false,
    quantumSafe: false,
  },
  generateKeys: async () => ({ scheme: "sha256" }),
  seal: async (payload) => ({
    scheme: "sha256",
    ciphertext: payload,
    nonce: null,
    encapsulatedKey: null,
    plaintextSha256: sha256Bytes(payload),
    mac: null,
  }),
  open: async (msg) => {
    if (!bytesEqual(sha256Bytes(msg.ciphertext), msg.plaintextSha256)) {
      throw new Error("sha256: integrity check failed");
    }
    return msg.ciphertext;
  },
  break: async (msg) => ({
    recovered: true,
    method: "plaintext",
    plaintext: utf8Decode(msg.ciphertext),
    note: "Only a SHA-256 digest was attached for integrity; the payload itself was sent in clear. Hashing ≠ encryption.",
  }),
};
