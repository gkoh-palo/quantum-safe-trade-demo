import { describe, it, expect } from "vitest";
import {
  bigintToBytes,
  bsgsDiscreteLog,
  bytesToBigint,
  modInverse,
  modpow,
  pollardRho,
  randomPrime,
  randomScalar,
} from "./toy.js";

describe("toy number theory (genuine-mode break primitives)", () => {
  it("bytes ↔ bigint round-trips with fixed width", () => {
    const x = 0x0123456789abcdefn;
    expect(bytesToBigint(bigintToBytes(x, 8))).toBe(x);
  });

  it("modpow and modInverse are consistent", () => {
    const m = 1_000_000_007n;
    expect(modpow(2n, 10n, m)).toBe(1024n);
    const inv = modInverse(17n, m);
    expect((17n * inv) % m).toBe(1n);
  });

  it("randomPrime returns primes of the requested size", () => {
    const p = randomPrime(24);
    expect(p.toString(2).length).toBe(24);
    // trial-divide by a few small primes
    for (const d of [2n, 3n, 5n, 7n, 11n, 13n]) expect(p % d).not.toBe(0n);
  });

  it("pollardRho factors a toy semiprime", () => {
    const p = randomPrime(24);
    const q = randomPrime(24);
    const n = p * q;
    const f = pollardRho(n);
    expect(n % f).toBe(0n);
    expect(f).not.toBe(1n);
    expect(f).not.toBe(n);
  });

  it("bsgsDiscreteLog recovers an exponent reproducing the shared secret", () => {
    const p = randomPrime(28);
    const g = 2n;
    const a = randomScalar(p);
    const A = modpow(g, a, p);
    const x = bsgsDiscreteLog(g, A, p, p - 1n);
    expect(x).not.toBeNull();
    // x ≡ a (mod ord(g)) ⇒ g^x == A and any B^x == B^a
    expect(modpow(g, x as bigint, p)).toBe(A);
    const b = randomScalar(p);
    const B = modpow(g, b, p);
    expect(modpow(B, x as bigint, p)).toBe(modpow(A, b, p));
  });
});
