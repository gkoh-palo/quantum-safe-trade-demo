// The SchemeRegistry — the keystone every Worker and the hacker agree on for
// seal/open/break (encryption) and sign/verify (signatures). PLAN §6.
import type {
  BreakContext,
  BreakResult,
  BreakMode,
  EncryptionScheme,
  EncryptionSchemeImpl,
  KeyMaterial,
  SealedMessage,
  SignatureKeyMaterial,
  SignatureScheme,
} from "./types.js";
import { plaintextScheme } from "./schemes/plaintext.js";
import { sha256Scheme } from "./schemes/sha256.js";
import { hmacScheme } from "./schemes/hmac.js";
import { rsaOaepScheme } from "./schemes/rsa-oaep.js";
import { ecdhAesScheme } from "./schemes/ecdh-aes.js";
import { hybridMlkemScheme } from "./schemes/hybrid-mlkem.js";
import { SIGNATURE_REGISTRY } from "./signatures.js";

export const ENCRYPTION_REGISTRY: Record<EncryptionScheme, EncryptionSchemeImpl> = {
  plaintext: plaintextScheme,
  sha256: sha256Scheme,
  "hmac-sha256": hmacScheme,
  "rsa-oaep": rsaOaepScheme,
  "ecdh-aes": ecdhAesScheme,
  "hybrid-mlkem": hybridMlkemScheme,
};

export const ENCRYPTION_SCHEMES = Object.keys(ENCRYPTION_REGISTRY) as EncryptionScheme[];
export const SIGNATURE_SCHEMES = Object.keys(SIGNATURE_REGISTRY) as SignatureScheme[];

const encImpl = (scheme: EncryptionScheme): EncryptionSchemeImpl => ENCRYPTION_REGISTRY[scheme];

// --- encryption dispatch -------------------------------------------------

export const generateEncryptionKeys = (
  scheme: EncryptionScheme,
  mode: BreakMode,
): Promise<KeyMaterial> => encImpl(scheme).generateKeys(mode);

export const seal = (
  scheme: EncryptionScheme,
  payload: Uint8Array,
  keys: KeyMaterial,
): Promise<SealedMessage> => encImpl(scheme).seal(payload, keys);

/** Open a sealed message — `msg.scheme` selects the implementation. */
export const open = (msg: SealedMessage, keys: KeyMaterial): Promise<Uint8Array> =>
  encImpl(msg.scheme).open(msg, keys);

/** Attempt Eve's break against a captured message under the given era/context. */
export const breakMessage = (msg: SealedMessage, ctx: BreakContext): Promise<BreakResult> =>
  encImpl(msg.scheme).break(msg, ctx);

export const schemeInfo = (scheme: EncryptionScheme) => encImpl(scheme).info;

// --- signature dispatch --------------------------------------------------

const sigImpl = (scheme: SignatureScheme) => SIGNATURE_REGISTRY[scheme];

export const generateSignatureKeys = (scheme: SignatureScheme): SignatureKeyMaterial =>
  sigImpl(scheme).generateKeys();

export const sign = (
  scheme: SignatureScheme,
  message: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array => sigImpl(scheme).sign(message, secretKey);

export const verify = (
  scheme: SignatureScheme,
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean => sigImpl(scheme).verify(signature, message, publicKey);

// TODO(M4): forge() — quantum-era signature forgery (ECDSA forgeable, ML-DSA not),
// the signature analogue of break(), wired with the EpochClock era state.
