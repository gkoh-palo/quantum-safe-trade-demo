// ecdh-aes — ephemeral-static (EC)DH → HKDF → AES-256-GCM. Quantum-broken:
// Shor's algorithm solves the discrete-log behind the key agreement.
//
//   genuine mode   → toy ~32-bit finite-field DH; break() recovers the static
//                     secret live via baby-step giant-step, then derives the key.
//   projected mode → real P-256 ECDH (@noble/curves); break() is gated on the
//                     CRQC countdown and then reveals via the server-held key.
//
// The toy path uses a multiplicative-group discrete log rather than a real curve;
// the break *class* (DLP, which Shor solves for both) is faithful, and the size
// shrink is captioned honestly. The PLAN explicitly sanctions a "toy curve" here.
import { p256 } from "@noble/curves/nist.js";
import type { BreakContext, BreakResult, EncryptionSchemeImpl, KeyMaterial } from "../types.js";
import { expectKeys } from "../types.js";
import { aesGcmOpen, aesGcmSeal, deriveAesKey, newNonce, sha256Bytes } from "../aead.js";
import { required, utf8Decode } from "../bytes.js";
import {
  bigintToBytes,
  bsgsDiscreteLog,
  bytesToBigint,
  modpow,
  randomPrime,
  randomScalar,
} from "../toy.js";

const TOY_PRIME_BITS = 32; // BSGS over a ~32-bit group ⇒ ~65k steps, breaks in ms
const DH_SECRET_BYTES = 8; // serialise the toy shared secret consistently for HKDF
const P256_INFO = "qstd/ecdh-aes/p256";
const TOY_INFO = "qstd/ecdh-aes/toy-dlp";

async function genToyDh(): Promise<Extract<KeyMaterial, { scheme: "ecdh-aes"; mode: "genuine" }>> {
  const p = randomPrime(TOY_PRIME_BITS);
  const g = 2n;
  const a = randomScalar(p);
  return { scheme: "ecdh-aes", mode: "genuine", p, g, a, A: modpow(g, a, p) };
}

export const ecdhAesScheme: EncryptionSchemeImpl = {
  info: {
    key: "ecdh-aes",
    label: "ECDH(P-256) + AES-GCM",
    construction: "ECDH(P-256) → HKDF → AES-256-GCM",
    confidential: true,
    quantumSafe: false,
  },
  generateKeys: async (mode) => {
    if (mode === "genuine") return genToyDh();
    const kp = p256.keygen();
    return {
      scheme: "ecdh-aes",
      mode: "projected",
      staticPriv: kp.secretKey,
      staticPub: kp.publicKey,
    };
  },
  seal: async (payload, keys) => {
    const k = expectKeys(keys, "ecdh-aes");
    const nonce = newNonce();
    let aesKey: Uint8Array;
    let encapsulatedKey: Uint8Array;
    if (k.mode === "genuine") {
      const b = randomScalar(k.p);
      encapsulatedKey = bigintToBytes(modpow(k.g, b, k.p), DH_SECRET_BYTES);
      aesKey = deriveAesKey(bigintToBytes(modpow(k.A, b, k.p), DH_SECRET_BYTES), TOY_INFO);
    } else {
      const eph = p256.keygen();
      encapsulatedKey = eph.publicKey;
      aesKey = deriveAesKey(p256.getSharedSecret(eph.secretKey, k.staticPub), P256_INFO);
    }
    return {
      scheme: "ecdh-aes",
      ciphertext: aesGcmSeal(aesKey, nonce, payload),
      nonce,
      encapsulatedKey,
      plaintextSha256: sha256Bytes(payload),
      mac: null,
    };
  },
  open: async (msg, keys) => {
    const k = expectKeys(keys, "ecdh-aes");
    const eph = required(msg.encapsulatedKey, "encapsulatedKey");
    const nonce = required(msg.nonce, "nonce");
    const aesKey =
      k.mode === "genuine"
        ? deriveAesKey(
            bigintToBytes(modpow(bytesToBigint(eph), k.a, k.p), DH_SECRET_BYTES),
            TOY_INFO,
          )
        : deriveAesKey(p256.getSharedSecret(k.staticPriv, eph), P256_INFO);
    return aesGcmOpen(aesKey, nonce, msg.ciphertext);
  },
  break: async (msg, ctx: BreakContext): Promise<BreakResult> => {
    const k = expectKeys(ctx.keys, "ecdh-aes");
    const eph = required(msg.encapsulatedKey, "encapsulatedKey");
    const nonce = required(msg.nonce, "nonce");
    if (k.mode === "genuine") {
      // Recover the static secret from PUBLIC material via discrete log, then
      // reconstruct the shared secret as B^a without ever holding `a`.
      const x = bsgsDiscreteLog(k.g, k.A, k.p, k.p - 1n);
      if (x === null) {
        return {
          recovered: false,
          method: "failed",
          plaintext: null,
          note: "Toy discrete log unexpectedly failed.",
        };
      }
      const shared = modpow(bytesToBigint(eph), x, k.p);
      const aesKey = deriveAesKey(bigintToBytes(shared, DH_SECRET_BYTES), TOY_INFO);
      return {
        recovered: true,
        method: "shor-ecdh",
        plaintext: utf8Decode(aesGcmOpen(aesKey, nonce, msg.ciphertext)),
        note: "Toy discrete log solved live (baby-step giant-step). We shrank the group so it breaks in seconds; Shor's algorithm solves the elliptic-curve discrete log behind real ECDH the same way.",
      };
    }
    if (ctx.crqcProgress < 100) {
      return {
        recovered: false,
        method: "failed",
        plaintext: null,
        note: `Projected break gated: CRQC progress ${ctx.crqcProgress}% < 100%. P-256 is intact until the simulated countdown completes.`,
      };
    }
    const aesKey = deriveAesKey(p256.getSharedSecret(k.staticPriv, eph), P256_INFO);
    return {
      recovered: true,
      method: "shor-ecdh",
      plaintext: utf8Decode(aesGcmOpen(aesKey, nonce, msg.ciphertext)),
      note: "Projected: the P-256 discrete log is infeasible on a laptop. At 100% CRQC progress we reveal the plaintext a future quantum computer would recover via Shor's algorithm.",
    };
  },
};
