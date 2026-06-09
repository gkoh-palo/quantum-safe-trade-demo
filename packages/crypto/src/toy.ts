// BigInt number theory for the *genuine* break mode (PLAN §5).
//
// These are deliberately tiny, textbook implementations of RSA and finite-field
// Diffie-Hellman with key sizes small enough that the break runs live in
// milliseconds (Pollard's rho factoring / baby-step-giant-step discrete log).
// They are NOT secure and must NEVER protect real data — the demo's honesty
// caption ("we shrank the key so it breaks in seconds; a CRQC does this to
// 2048-bit in hours") makes that explicit in the UI.
import { randomBytes } from "@noble/hashes/utils.js";

// --- conversions ---------------------------------------------------------

export function bytesToBigint(b: Uint8Array): bigint {
  let x = 0n;
  for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i] as number);
  return x;
}

export function bigintToBytes(x: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = x;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

const bitLength = (x: bigint): number => x.toString(2).length;

// --- modular arithmetic --------------------------------------------------

export function modpow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

export function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error("toy: no modular inverse");
  return ((oldS % m) + m) % m;
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

const sqrtCeil = (n: bigint): bigint => {
  const r = isqrt(n);
  return r * r === n ? r : r + 1n;
};

// --- primality + random generation --------------------------------------

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

function isProbablePrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n % p === 0n) return n === p;
  }
  // Miller-Rabin; these bases are deterministic well past our toy key sizes.
  let d = n - 1n;
  let s = 0n;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1n;
  }
  witness: for (const a of SMALL_PRIMES) {
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1n; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witness;
    }
    return false;
  }
  return true;
}

function randomBigint(bits: number): bigint {
  const x = bytesToBigint(randomBytes(Math.ceil(bits / 8)));
  return x & ((1n << BigInt(bits)) - 1n);
}

/** A random prime of exactly `bits` bits (top + bottom bits forced set). */
export function randomPrime(bits: number): bigint {
  for (;;) {
    let candidate = randomBigint(bits);
    candidate |= 1n; // odd
    candidate |= 1n << BigInt(bits - 1); // full bit length
    if (isProbablePrime(candidate)) return candidate;
  }
}

/** A uniform-ish scalar in [2, p-2]. */
export function randomScalar(p: bigint): bigint {
  const x = bytesToBigint(randomBytes(Math.ceil(bitLength(p) / 8) + 8));
  return (x % (p - 3n)) + 2n;
}

// --- the breaks ----------------------------------------------------------

/** Pollard's rho: return a non-trivial factor of a composite `n`. */
export function pollardRho(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; ; c++) {
    let x = 2n;
    let y = 2n;
    let d = 1n;
    const f = (v: bigint): bigint => (v * v + c) % n;
    do {
      x = f(x);
      y = f(f(y));
      d = gcd(x > y ? x - y : y - x, n);
    } while (d === 1n);
    if (d !== n) return d;
  }
}

/**
 * Baby-step giant-step: solve g^x ≡ h (mod p) for x in [0, order).
 * Returns x (mod ord(g)), which is sufficient to reconstruct any g^(x·k).
 */
export function bsgsDiscreteLog(g: bigint, h: bigint, p: bigint, order: bigint): bigint | null {
  const m = sqrtCeil(order);
  const table = new Map<string, bigint>();
  let e = 1n;
  for (let j = 0n; j < m; j++) {
    if (!table.has(e.toString())) table.set(e.toString(), j);
    e = (e * g) % p;
  }
  const factor = modpow(modInverse(g, p), m, p); // g^(-m) mod p
  let gamma = h % p;
  for (let i = 0n; i <= m; i++) {
    const j = table.get(gamma.toString());
    if (j !== undefined) return i * m + j;
    gamma = (gamma * factor) % p;
  }
  return null;
}
