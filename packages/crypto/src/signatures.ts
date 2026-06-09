// Signature schemes (PLAN §5): classical ECDSA-P256 vs post-quantum ML-DSA-65.
// sign/verify are real for both. Quantum-era forgery (a CRQC can forge ECDSA but
// not ML-DSA) is the signature analogue of break() and lands in M4 with the era
// logic — see forge() TODO in the registry.
import { p256 } from "@noble/curves/nist.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import type { SignatureScheme, SignatureSchemeImpl } from "./types.js";

const ecdsaP256: SignatureSchemeImpl = {
  scheme: "ecdsa-p256",
  quantumSafe: false,
  generateKeys: () => {
    const kp = p256.keygen();
    return { scheme: "ecdsa-p256", publicKey: kp.publicKey, secretKey: kp.secretKey };
  },
  sign: (message, secretKey) => p256.sign(message, secretKey),
  verify: (signature, message, publicKey) => p256.verify(signature, message, publicKey),
};

const mlDsa65: SignatureSchemeImpl = {
  scheme: "ml-dsa-65",
  quantumSafe: true,
  generateKeys: () => {
    const kp = ml_dsa65.keygen();
    return { scheme: "ml-dsa-65", publicKey: kp.publicKey, secretKey: kp.secretKey };
  },
  sign: (message, secretKey) => ml_dsa65.sign(message, secretKey),
  verify: (signature, message, publicKey) => ml_dsa65.verify(signature, message, publicKey),
};

export const SIGNATURE_REGISTRY: Record<SignatureScheme, SignatureSchemeImpl> = {
  "ecdsa-p256": ecdsaP256,
  "ml-dsa-65": mlDsa65,
};
