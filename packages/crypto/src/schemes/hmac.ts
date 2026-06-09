// hmac-sha256 — a keyed MAC authenticates the payload but does NOT encrypt it.
// The payload still rides the wire in clear. Teaches: authentication ≠ confidentiality.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { EncryptionSchemeImpl } from "../types.js";
import { expectKeys } from "../types.js";
import { sha256Bytes } from "../aead.js";
import { bytesEqual, randomBytes, required, utf8Decode } from "../bytes.js";

const mac = (key: Uint8Array, payload: Uint8Array): Uint8Array => hmac(sha256, key, payload);

export const hmacScheme: EncryptionSchemeImpl = {
  info: {
    key: "hmac-sha256",
    label: "HMAC-SHA256 (auth only)",
    construction: "keyed MAC over payload, payload sent in clear",
    confidential: false,
    quantumSafe: false,
  },
  generateKeys: async () => ({ scheme: "hmac-sha256", macKey: randomBytes(32) }),
  seal: async (payload, keys) => {
    const k = expectKeys(keys, "hmac-sha256");
    return {
      scheme: "hmac-sha256",
      ciphertext: payload,
      nonce: null,
      encapsulatedKey: null,
      plaintextSha256: sha256Bytes(payload),
      mac: mac(k.macKey, payload),
    };
  },
  open: async (msg, keys) => {
    const k = expectKeys(keys, "hmac-sha256");
    if (!bytesEqual(mac(k.macKey, msg.ciphertext), required(msg.mac, "mac"))) {
      throw new Error("hmac-sha256: MAC verification failed");
    }
    return msg.ciphertext;
  },
  break: async (msg) => ({
    recovered: true,
    method: "plaintext",
    plaintext: utf8Decode(msg.ciphertext),
    note: "A keyed MAC authenticates the payload but does not encrypt it; it was sent in clear. Authentication ≠ confidentiality.",
  }),
};
