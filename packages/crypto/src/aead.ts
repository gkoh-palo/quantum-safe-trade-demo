// AES-256-GCM bulk encryption + HKDF key derivation + SHA-256, used by every
// confidential scheme. Thin wrappers over @noble so the scheme modules stay terse.
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { utf8Encode } from "./bytes.js";

export const AES_KEY_BYTES = 32; // AES-256
export const GCM_NONCE_BYTES = 12;

export const newAesKey = (): Uint8Array => randomBytes(AES_KEY_BYTES);
export const newNonce = (): Uint8Array => randomBytes(GCM_NONCE_BYTES);

export const aesGcmSeal = (key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Uint8Array =>
  gcm(key, nonce).encrypt(plaintext);

export const aesGcmOpen = (
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array => gcm(key, nonce).decrypt(ciphertext);

/** HKDF-SHA256 a shared secret into a 32-byte AES key, domain-separated by `info`. */
export const deriveAesKey = (ikm: Uint8Array, info: string): Uint8Array =>
  hkdf(sha256, ikm, undefined, utf8Encode(info), AES_KEY_BYTES);

export const sha256Bytes = (data: Uint8Array): Uint8Array => sha256(data);
