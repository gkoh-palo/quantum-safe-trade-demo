// hybrid-mlkem — X25519 + ML-KEM-768, both shared secrets HKDF'd into one
// AES-256-GCM key. This is the post-quantum defence: the break ALWAYS fails, in
// every mode. No known classical or quantum algorithm recovers the ML-KEM secret,
// and we never "reveal" via the held key the way the classical projected paths do —
// because a real CRQC could not either. That asymmetry is the whole pitch.
import { x25519 } from "@noble/curves/ed25519.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import type { EncryptionSchemeImpl } from "../types.js";
import { expectKeys } from "../types.js";
import { aesGcmOpen, aesGcmSeal, deriveAesKey, newNonce, sha256Bytes } from "../aead.js";
import { concatBytes, required } from "../bytes.js";

const X25519_PUB_BYTES = 32;
const INFO = "qstd/hybrid-mlkem/x25519+ml-kem-768";

export const hybridMlkemScheme: EncryptionSchemeImpl = {
  info: {
    key: "hybrid-mlkem",
    label: "Hybrid X25519 + ML-KEM-768",
    construction: "X25519 ⧺ ML-KEM-768 → HKDF → AES-256-GCM",
    confidential: true,
    quantumSafe: true,
  },
  generateKeys: async () => {
    const xk = x25519.keygen();
    const mk = ml_kem768.keygen();
    return {
      scheme: "hybrid-mlkem",
      x25519Priv: xk.secretKey,
      x25519Pub: xk.publicKey,
      mlkemPub: mk.publicKey,
      mlkemSecret: mk.secretKey,
    };
  },
  seal: async (payload, keys) => {
    const k = expectKeys(keys, "hybrid-mlkem");
    const eph = x25519.keygen();
    const xShared = x25519.getSharedSecret(eph.secretKey, k.x25519Pub);
    const kem = ml_kem768.encapsulate(k.mlkemPub);
    const aesKey = deriveAesKey(concatBytes(xShared, kem.sharedSecret), INFO);
    const nonce = newNonce();
    return {
      scheme: "hybrid-mlkem",
      ciphertext: aesGcmSeal(aesKey, nonce, payload),
      nonce,
      encapsulatedKey: concatBytes(eph.publicKey, kem.cipherText),
      plaintextSha256: sha256Bytes(payload),
      mac: null,
    };
  },
  open: async (msg, keys) => {
    const k = expectKeys(keys, "hybrid-mlkem");
    const encap = required(msg.encapsulatedKey, "encapsulatedKey");
    const ephPub = encap.subarray(0, X25519_PUB_BYTES);
    const kemCt = encap.subarray(X25519_PUB_BYTES);
    const xShared = x25519.getSharedSecret(k.x25519Priv, ephPub);
    const kemShared = ml_kem768.decapsulate(kemCt, k.mlkemSecret);
    const aesKey = deriveAesKey(concatBytes(xShared, kemShared), INFO);
    return aesGcmOpen(aesKey, required(msg.nonce, "nonce"), msg.ciphertext);
  },
  break: async () => ({
    recovered: false,
    method: "failed",
    plaintext: null,
    note: "Hybrid X25519 + ML-KEM-768. No known classical or quantum algorithm recovers the ML-KEM secret — the break fails in every mode, even at 100% CRQC progress.",
  }),
};
