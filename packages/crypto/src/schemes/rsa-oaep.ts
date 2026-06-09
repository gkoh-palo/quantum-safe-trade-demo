// rsa-oaep — RSA-OAEP key-wrap over an AES-256-GCM bulk cipher. Quantum-broken:
// Shor's algorithm factors the modulus.
//
//   genuine mode   → toy ~48-bit modulus; break() factors it live (Pollard's rho).
//   projected mode → real RSA-2048 (WebCrypto); break() is gated on the CRQC
//                     countdown and then reveals via the server-held key, modelling
//                     the future capability without pretending we factored 2048-bit.
import type { webcrypto } from "node:crypto";
import type {
  BreakContext,
  BreakResult,
  EncryptionSchemeImpl,
  KeyMaterial,
  SealedMessage,
} from "../types.js";
import { expectKeys } from "../types.js";
import { aesGcmOpen, aesGcmSeal, newAesKey, newNonce, sha256Bytes } from "../aead.js";
import { required, utf8Decode } from "../bytes.js";
import {
  bigintToBytes,
  bytesToBigint,
  modInverse,
  modpow,
  pollardRho,
  randomPrime,
} from "../toy.js";

// Toy RSA wraps the 32-byte AES key as 16 × 16-bit limbs, each < the toy modulus.
const CHUNK_BYTES = 2; // 16-bit plaintext limb (< ~48-bit modulus)
const LIMB_BYTES = 8; // ciphertext limb serialised as 8 bytes BE (modulus < 2^64)
const TOY_PRIME_BITS = 24; // → ~48-bit modulus, factored by Pollard's rho in ms

function toyRsaWrap(aesKey: Uint8Array, n: bigint, e: bigint): Uint8Array {
  const limbs = aesKey.length / CHUNK_BYTES;
  const out = new Uint8Array(limbs * LIMB_BYTES);
  for (let i = 0; i < limbs; i++) {
    const m = bytesToBigint(aesKey.subarray(i * CHUNK_BYTES, i * CHUNK_BYTES + CHUNK_BYTES));
    out.set(bigintToBytes(modpow(m, e, n), LIMB_BYTES), i * LIMB_BYTES);
  }
  return out;
}

function toyRsaUnwrap(wrapped: Uint8Array, n: bigint, d: bigint): Uint8Array {
  const limbs = wrapped.length / LIMB_BYTES;
  const key = new Uint8Array(limbs * CHUNK_BYTES);
  for (let i = 0; i < limbs; i++) {
    const c = bytesToBigint(wrapped.subarray(i * LIMB_BYTES, i * LIMB_BYTES + LIMB_BYTES));
    key.set(bigintToBytes(modpow(c, d, n), CHUNK_BYTES), i * CHUNK_BYTES);
  }
  return key;
}

async function genToyRsa(): Promise<Extract<KeyMaterial, { scheme: "rsa-oaep"; mode: "genuine" }>> {
  const e = 65537n;
  for (;;) {
    const p = randomPrime(TOY_PRIME_BITS);
    const q = randomPrime(TOY_PRIME_BITS);
    if (p === q) continue;
    const phi = (p - 1n) * (q - 1n);
    if (phi % e === 0n) continue; // need gcd(e, phi) = 1; e is prime so this suffices
    return { scheme: "rsa-oaep", mode: "genuine", n: p * q, e, d: modInverse(e, phi) };
  }
}

async function genRealRsa(): Promise<
  Extract<KeyMaterial, { scheme: "rsa-oaep"; mode: "projected" }>
> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  return {
    scheme: "rsa-oaep",
    mode: "projected",
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
  };
}

async function rsaDecryptToPlaintext(
  privateKey: webcrypto.CryptoKey,
  msg: SealedMessage,
): Promise<string> {
  const aesKey = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      required(msg.encapsulatedKey, "encapsulatedKey"),
    ),
  );
  return utf8Decode(aesGcmOpen(aesKey, required(msg.nonce, "nonce"), msg.ciphertext));
}

export const rsaOaepScheme: EncryptionSchemeImpl = {
  info: {
    key: "rsa-oaep",
    label: "RSA-OAEP + AES-GCM",
    construction: "RSA-OAEP wrap of an AES-256-GCM key",
    confidential: true,
    quantumSafe: false,
  },
  generateKeys: (mode) => (mode === "genuine" ? genToyRsa() : genRealRsa()),
  seal: async (payload, keys) => {
    const k = expectKeys(keys, "rsa-oaep");
    const aesKey = newAesKey();
    const nonce = newNonce();
    const ciphertext = aesGcmSeal(aesKey, nonce, payload);
    const encapsulatedKey =
      k.mode === "genuine"
        ? toyRsaWrap(aesKey, k.n, k.e)
        : new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, k.publicKey, aesKey));
    return {
      scheme: "rsa-oaep",
      ciphertext,
      nonce,
      encapsulatedKey,
      plaintextSha256: sha256Bytes(payload),
      mac: null,
    };
  },
  open: async (msg, keys) => {
    const k = expectKeys(keys, "rsa-oaep");
    const wrapped = required(msg.encapsulatedKey, "encapsulatedKey");
    const nonce = required(msg.nonce, "nonce");
    const aesKey =
      k.mode === "genuine"
        ? toyRsaUnwrap(wrapped, k.n, k.d)
        : new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, k.privateKey, wrapped));
    return aesGcmOpen(aesKey, nonce, msg.ciphertext);
  },
  break: async (msg, ctx: BreakContext): Promise<BreakResult> => {
    const k = expectKeys(ctx.keys, "rsa-oaep");
    if (k.mode === "genuine") {
      // Genuinely recover the private key from PUBLIC material by factoring n.
      const p = pollardRho(k.n);
      const q = k.n / p;
      const d = modInverse(k.e, (p - 1n) * (q - 1n));
      const aesKey = toyRsaUnwrap(required(msg.encapsulatedKey, "encapsulatedKey"), k.n, d);
      const plaintext = utf8Decode(
        aesGcmOpen(aesKey, required(msg.nonce, "nonce"), msg.ciphertext),
      );
      return {
        recovered: true,
        method: "shor-rsa",
        plaintext,
        note: "Toy RSA modulus factored live (Pollard's rho). We shrank the key so it breaks in seconds; a CRQC does this to RSA-2048 via Shor's algorithm.",
      };
    }
    if (ctx.crqcProgress < 100) {
      return {
        recovered: false,
        method: "failed",
        plaintext: null,
        note: `Projected break gated: CRQC progress ${ctx.crqcProgress}% < 100%. RSA-2048 is intact until the simulated countdown completes.`,
      };
    }
    return {
      recovered: true,
      method: "shor-rsa",
      plaintext: await rsaDecryptToPlaintext(k.privateKey, msg),
      note: "Projected: RSA-2048 cannot be factored on a laptop. At 100% CRQC progress we reveal the plaintext a future quantum computer would recover via Shor's algorithm.",
    };
  },
};
