// Public type surface for the @qstd/crypto SchemeRegistry (PLAN §5).
//
// Two families:
//   - Encryption schemes  → seal / open / break
//   - Signature schemes   → sign / verify  (forge() lands in M4 with the era logic)
//
// `break()` models Eve in the quantum era. It never holds keys at capture time;
// the server-held KeyMaterial is passed in only so that:
//   - in `genuine` mode the engine can recover the private key live from PUBLIC
//     material (toy-size factoring / discrete-log), proving a real break, and
//   - in `projected` mode, once the simulated CRQC countdown reaches 100%, the
//     engine can reveal the plaintext a real CRQC *would* recover.
// The PQC path is never recoverable in either mode — that asymmetry is the pitch.

// WebCrypto's CryptoKey isn't a global under `types: ["node"]` (no DOM lib). Pull
// the type from Node's webcrypto namespace; this is type-only and erased at build,
// so it adds no runtime dependency to the Worker bundle (which uses global crypto).
import type { webcrypto } from "node:crypto";

/** Confidentiality schemes — govern how a wire message is sealed. */
export type EncryptionScheme =
  | "plaintext"
  | "sha256"
  | "hmac-sha256"
  | "rsa-oaep"
  | "ecdh-aes"
  | "hybrid-mlkem";

/** Signature schemes — govern integrity/authenticity of a wire message. */
export type SignatureScheme = "ecdsa-p256" | "ml-dsa-65";

/** Presenter-selectable break behaviour for the classical schemes (PLAN §5). */
export type BreakMode = "genuine" | "projected";

/** DB-aligned break-method tag (PLAN §4 `harvested_packets.break_method`). */
export type BreakMethod = "plaintext" | "shor-rsa" | "shor-ecdh" | "failed";

/** Static metadata describing a scheme for the UI and scorecard. */
export interface SchemeInfo {
  readonly key: EncryptionScheme;
  readonly label: string;
  readonly construction: string;
  /** Does it actually hide the payload? (plaintext/sha256/hmac do not.) */
  readonly confidential: boolean;
  /** Does it survive a CRQC? Only hybrid-mlkem does. */
  readonly quantumSafe: boolean;
}

/**
 * One sealed wire message. Mirrors the `wire_messages` columns (PLAN §4) so the
 * db layer can persist it directly. Non-confidential schemes carry the payload
 * in `ciphertext` as cleartext (that is the teaching point).
 */
export interface SealedMessage {
  readonly scheme: EncryptionScheme;
  /** AEAD ciphertext, or cleartext bytes for non-confidential schemes. */
  readonly ciphertext: Uint8Array;
  /** AES-GCM nonce (12 bytes) when an AEAD was used, else null. */
  readonly nonce: Uint8Array | null;
  /** KEM ciphertext / wrapped key / ephemeral public key, else null. */
  readonly encapsulatedKey: Uint8Array | null;
  /** SHA-256 of the plaintext — integrity/demo only, always present. */
  readonly plaintextSha256: Uint8Array;
  /** Keyed MAC for the hmac-sha256 scheme, else null. */
  readonly mac: Uint8Array | null;
}

/**
 * Server-held key material per scheme. A discriminated union: `scheme` selects
 * the family and, for the breakable asymmetric schemes, `mode` selects the
 * genuine (toy-size, recoverable live) vs projected (real-size, simulated) keys.
 */
export type KeyMaterial =
  | { readonly scheme: "plaintext" }
  | { readonly scheme: "sha256" }
  | { readonly scheme: "hmac-sha256"; readonly macKey: Uint8Array }
  // RSA-OAEP wrap + AES-GCM
  | {
      readonly scheme: "rsa-oaep";
      readonly mode: "genuine";
      readonly n: bigint;
      readonly e: bigint;
      readonly d: bigint;
    }
  | {
      readonly scheme: "rsa-oaep";
      readonly mode: "projected";
      readonly publicKey: webcrypto.CryptoKey;
      readonly privateKey: webcrypto.CryptoKey;
    }
  // ECDH → HKDF → AES-GCM
  | {
      readonly scheme: "ecdh-aes";
      readonly mode: "genuine";
      readonly p: bigint;
      readonly g: bigint;
      readonly a: bigint;
      readonly A: bigint;
    }
  | {
      readonly scheme: "ecdh-aes";
      readonly mode: "projected";
      readonly staticPriv: Uint8Array;
      readonly staticPub: Uint8Array;
    }
  // X25519 + ML-KEM-768 → HKDF → AES-GCM (always unbroken)
  | {
      readonly scheme: "hybrid-mlkem";
      readonly x25519Priv: Uint8Array;
      readonly x25519Pub: Uint8Array;
      readonly mlkemPub: Uint8Array;
      readonly mlkemSecret: Uint8Array;
    };

/** Narrow `KeyMaterial` to a specific scheme, throwing on mismatch. */
export function expectKeys<T extends KeyMaterial["scheme"]>(
  keys: KeyMaterial,
  scheme: T,
): Extract<KeyMaterial, { scheme: T }> {
  if (keys.scheme !== scheme) {
    throw new Error(`crypto: expected key material for "${scheme}", got "${keys.scheme}"`);
  }
  return keys as Extract<KeyMaterial, { scheme: T }>;
}

/** Context handed to `break()` — the era state plus the server-held key material. */
export interface BreakContext {
  readonly mode: BreakMode;
  /** 0..100 — the simulated CRQC countdown (only gates `projected` mode). */
  readonly crqcProgress: number;
  readonly keys: KeyMaterial;
}

/** Outcome of an attempted break, honest about how (or whether) it recovered. */
export interface BreakResult {
  readonly recovered: boolean;
  readonly method: BreakMethod;
  readonly plaintext: string | null;
  /** Human-facing caption — the demo's honesty lives here. */
  readonly note: string;
}

/** A single encryption scheme's implementation. */
export interface EncryptionSchemeImpl {
  readonly info: SchemeInfo;
  generateKeys(mode: BreakMode): Promise<KeyMaterial>;
  seal(payload: Uint8Array, keys: KeyMaterial): Promise<SealedMessage>;
  open(msg: SealedMessage, keys: KeyMaterial): Promise<Uint8Array>;
  break(msg: SealedMessage, ctx: BreakContext): Promise<BreakResult>;
}

/** Server-held key material for a signature scheme. */
export interface SignatureKeyMaterial {
  readonly scheme: SignatureScheme;
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

/** A single signature scheme's implementation. */
export interface SignatureSchemeImpl {
  readonly scheme: SignatureScheme;
  readonly quantumSafe: boolean;
  generateKeys(): SignatureKeyMaterial;
  sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
}
