// Typed client for the ui BFF (/api/*). Types are local copies of the BFF shapes so
// the SPA bundle doesn't pull in the workspace packages (zod / noble / drizzle).

export interface EraState {
  era: "classical" | "quantum";
  crqcProgress: number;
  breakMode: "genuine" | "projected";
  scheme: string;
}

export interface SchemeScore {
  scheme: string;
  quantumSafe: boolean;
  harvested: number;
  broken: number;
  protected: number;
  exposedNotional: number;
  leakedCounterparties: number;
}

export interface Scorecard {
  totals: {
    harvested: number;
    broken: number;
    protected: number;
    exposedNotional: number;
    leakedCounterparties: number;
  };
  byScheme: SchemeScore[];
}

export interface Trade {
  id: string;
  system: "sentry" | "quantum";
  assetClass: "asset" | "liability";
  product: string;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
  tradeDate: string;
  status: string;
  createdAt: string;
}

export interface WireSummary {
  id: string;
  fromService: "sentry" | "quantum";
  toService: "sentry" | "quantum";
  scheme: string;
  eraAtSend: string;
  createdAt: string;
}

export interface PitchState {
  era: EraState;
  counts: { trades: number; harvested: number; migrations: number };
  scorecard: Scorecard;
  recentTrades: Trade[];
  recentWire: WireSummary[];
}

const post = (path: string) => fetch(path, { method: "POST" });

export const api = {
  getState: async (): Promise<PitchState> => {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error(`GET /api/state ${res.status}`);
    return res.json();
  },
  advanceEra: () => post("/api/era/advance"),
  resetEra: () => post("/api/era/reset"),
  runBreak: () => post("/api/break"),
};

export const PRODUCT_LABELS: Record<string, string> = {
  loan: "Loan",
  bond: "Bond",
  fx: "FX",
  irs: "IRS",
  ccs: "CCS",
  "money-market": "Money Market",
  security: "Security",
  "currency-forward": "Currency Forward",
  "interest-rate-swap": "Interest Rate Swaps",
  "cross-currency-swap": "Cross Currency Swaps",
};

export const SCHEME_LABELS: Record<string, string> = {
  plaintext: "Plaintext",
  sha256: "SHA-256 (hash only)",
  "hmac-sha256": "HMAC-SHA256",
  "rsa-oaep": "RSA-OAEP + AES-GCM",
  "ecdh-aes": "ECDH(P-256) + AES-GCM",
  "hybrid-mlkem": "Hybrid X25519 + ML-KEM-768",
};

export const fmtMoney = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n}`;
};
