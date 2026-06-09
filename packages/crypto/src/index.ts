// @qstd/crypto — the keystone SchemeRegistry: seal/open/break for every
// confidential scheme and sign/verify for the signature schemes in PLAN §5
// (plaintext, sha256, hmac-sha256, rsa-oaep, ecdh-aes, hybrid-mlkem, ecdsa-p256,
// ml-dsa-65). Crypto correctness is non-negotiable — see CLAUDE.md.

export const PACKAGE_NAME = "@qstd/crypto" as const;

export type {
  EncryptionScheme,
  SignatureScheme,
  BreakMode,
  BreakMethod,
  SchemeInfo,
  SealedMessage,
  KeyMaterial,
  BreakContext,
  BreakResult,
  EncryptionSchemeImpl,
  SignatureSchemeImpl,
  SignatureKeyMaterial,
} from "./types.js";

export {
  ENCRYPTION_REGISTRY,
  ENCRYPTION_SCHEMES,
  SIGNATURE_SCHEMES,
  generateEncryptionKeys,
  seal,
  open,
  breakMessage,
  schemeInfo,
  generateSignatureKeys,
  sign,
  verify,
} from "./registry.js";

export { utf8Encode, utf8Decode, bytesToHex, hexToBytes } from "./bytes.js";
