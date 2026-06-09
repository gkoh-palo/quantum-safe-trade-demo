// plaintext — no protection at all. The baseline shock: the payload is on the
// wire in the clear, so Eve reads it immediately, in any era.
import type { EncryptionSchemeImpl } from "../types.js";
import { sha256Bytes } from "../aead.js";
import { utf8Decode } from "../bytes.js";

export const plaintextScheme: EncryptionSchemeImpl = {
  info: {
    key: "plaintext",
    label: "Plaintext",
    construction: "none",
    confidential: false,
    quantumSafe: false,
  },
  generateKeys: async () => ({ scheme: "plaintext" }),
  seal: async (payload) => ({
    scheme: "plaintext",
    ciphertext: payload,
    nonce: null,
    encapsulatedKey: null,
    plaintextSha256: sha256Bytes(payload),
    mac: null,
  }),
  open: async (msg) => msg.ciphertext,
  break: async (msg) => ({
    recovered: true,
    method: "plaintext",
    plaintext: utf8Decode(msg.ciphertext),
    note: "No encryption — the payload travelled on the wire in the clear.",
  }),
};
