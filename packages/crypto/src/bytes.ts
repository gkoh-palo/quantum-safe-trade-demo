// Small byte/encoding helpers shared across the scheme implementations.
import { concatBytes, randomBytes, bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8Encode = (s: string): Uint8Array => encoder.encode(s);
export const utf8Decode = (b: Uint8Array): string => decoder.decode(b);

/** Constant-time-ish equality for byte arrays (length + XOR accumulate). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** Assert an optional wire field is present (used by open/break). */
export function required<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`crypto: missing required field "${name}"`);
  }
  return value;
}

export { concatBytes, randomBytes, bytesToHex, hexToBytes };
