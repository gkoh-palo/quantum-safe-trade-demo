// Serialize KeyMaterial to a JSON-safe form so the active keyring can live in the
// crypto_config row (PLAN §4) and be read back by every worker. Bytes → hex,
// bigints → hex, and the projected RSA CryptoKeys → exported SPKI/PKCS8 hex.
// This is server-side material only — Eve taps the wire, never the keyring.
import type { KeyMaterial } from "./types.js";
import { bytesToHex, hexToBytes } from "./bytes.js";

export type SerializedKeyMaterial =
  | { scheme: "plaintext" }
  | { scheme: "sha256" }
  | { scheme: "hmac-sha256"; macKey: string }
  | { scheme: "rsa-oaep"; mode: "genuine"; n: string; e: string; d: string }
  | { scheme: "rsa-oaep"; mode: "projected"; publicKey: string; privateKey: string }
  | { scheme: "ecdh-aes"; mode: "genuine"; p: string; g: string; a: string; A: string }
  | { scheme: "ecdh-aes"; mode: "projected"; staticPriv: string; staticPub: string }
  | {
      scheme: "hybrid-mlkem";
      x25519Priv: string;
      x25519Pub: string;
      mlkemPub: string;
      mlkemSecret: string;
    };

const big2hex = (x: bigint): string => x.toString(16);
const hex2big = (h: string): bigint => BigInt(`0x${h}`);

const RSA_PARAMS = { name: "RSA-OAEP", hash: "SHA-256" } as const;

export async function serializeKeyMaterial(km: KeyMaterial): Promise<SerializedKeyMaterial> {
  switch (km.scheme) {
    case "plaintext":
      return { scheme: "plaintext" };
    case "sha256":
      return { scheme: "sha256" };
    case "hmac-sha256":
      return { scheme: "hmac-sha256", macKey: bytesToHex(km.macKey) };
    case "rsa-oaep":
      if (km.mode === "genuine") {
        return {
          scheme: "rsa-oaep",
          mode: "genuine",
          n: big2hex(km.n),
          e: big2hex(km.e),
          d: big2hex(km.d),
        };
      }
      return {
        scheme: "rsa-oaep",
        mode: "projected",
        publicKey: bytesToHex(
          new Uint8Array((await crypto.subtle.exportKey("spki", km.publicKey)) as ArrayBuffer),
        ),
        privateKey: bytesToHex(
          new Uint8Array((await crypto.subtle.exportKey("pkcs8", km.privateKey)) as ArrayBuffer),
        ),
      };
    case "ecdh-aes":
      if (km.mode === "genuine") {
        return {
          scheme: "ecdh-aes",
          mode: "genuine",
          p: big2hex(km.p),
          g: big2hex(km.g),
          a: big2hex(km.a),
          A: big2hex(km.A),
        };
      }
      return {
        scheme: "ecdh-aes",
        mode: "projected",
        staticPriv: bytesToHex(km.staticPriv),
        staticPub: bytesToHex(km.staticPub),
      };
    case "hybrid-mlkem":
      return {
        scheme: "hybrid-mlkem",
        x25519Priv: bytesToHex(km.x25519Priv),
        x25519Pub: bytesToHex(km.x25519Pub),
        mlkemPub: bytesToHex(km.mlkemPub),
        mlkemSecret: bytesToHex(km.mlkemSecret),
      };
  }
}

export async function deserializeKeyMaterial(s: SerializedKeyMaterial): Promise<KeyMaterial> {
  switch (s.scheme) {
    case "plaintext":
      return { scheme: "plaintext" };
    case "sha256":
      return { scheme: "sha256" };
    case "hmac-sha256":
      return { scheme: "hmac-sha256", macKey: hexToBytes(s.macKey) };
    case "rsa-oaep":
      if (s.mode === "genuine") {
        return {
          scheme: "rsa-oaep",
          mode: "genuine",
          n: hex2big(s.n),
          e: hex2big(s.e),
          d: hex2big(s.d),
        };
      }
      return {
        scheme: "rsa-oaep",
        mode: "projected",
        publicKey: await crypto.subtle.importKey(
          "spki",
          hexToBytes(s.publicKey),
          RSA_PARAMS,
          true,
          ["encrypt"],
        ),
        privateKey: await crypto.subtle.importKey(
          "pkcs8",
          hexToBytes(s.privateKey),
          RSA_PARAMS,
          true,
          ["decrypt"],
        ),
      };
    case "ecdh-aes":
      if (s.mode === "genuine") {
        return {
          scheme: "ecdh-aes",
          mode: "genuine",
          p: hex2big(s.p),
          g: hex2big(s.g),
          a: hex2big(s.a),
          A: hex2big(s.A),
        };
      }
      return {
        scheme: "ecdh-aes",
        mode: "projected",
        staticPriv: hexToBytes(s.staticPriv),
        staticPub: hexToBytes(s.staticPub),
      };
    case "hybrid-mlkem":
      return {
        scheme: "hybrid-mlkem",
        x25519Priv: hexToBytes(s.x25519Priv),
        x25519Pub: hexToBytes(s.x25519Pub),
        mlkemPub: hexToBytes(s.mlkemPub),
        mlkemSecret: hexToBytes(s.mlkemSecret),
      };
  }
}
