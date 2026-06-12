// Typed client for the ui BFF (/api/*). Types are local copies of the BFF shapes so
// the SPA bundle doesn't pull in the workspace packages (zod / noble / drizzle).

export interface EraState {
  era: "classical" | "quantum";
  crqcProgress: number;
  breakMode: "genuine" | "projected";
  scheme: string;
  autoGenerate: boolean;
  autoTick: boolean;
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
  system: "keystone" | "helix";
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
  fromService: "keystone" | "helix" | "integration";
  toService: "keystone" | "helix" | "integration";
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

// --- admin (token-gated) ---------------------------------------------------

const TOKEN_KEY = "qstd-admin-token";
export const adminToken = {
  get: (): string => localStorage.getItem(TOKEN_KEY) ?? "",
  set: (t: string): void => localStorage.setItem(TOKEN_KEY, t),
};

const adminHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  "x-admin-token": adminToken.get(),
});

export interface InspectedPacket {
  wireMessageId: string;
  fromService: string;
  toService: string;
  scheme: string;
  eraAtSend: string;
  ciphertextPreview: string;
  broken: boolean;
  breakMethod: string | null;
  recoveredPlaintext: unknown;
}

export interface InjectTrade {
  system: "keystone" | "helix";
  product: string;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
}

const asResult = async (
  res: Response,
): Promise<{ ok: boolean; status: number; body: unknown }> => ({
  ok: res.ok,
  status: res.status,
  body: await res.json().catch(() => null),
});

export const admin = {
  setScheme: (scheme: string, breakMode: string) =>
    fetch("/api/admin/scheme", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ scheme, breakMode }),
    }).then(asResult),
  setCrqc: (progress: number) =>
    fetch("/api/admin/crqc", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ progress }),
    }).then(asResult),
  injectTrade: (trade: InjectTrade) =>
    fetch("/api/admin/trade", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(trade),
    }).then(asResult),
  inspect: async (): Promise<InspectedPacket[]> => {
    const res = await fetch("/api/admin/inspect", {
      headers: { "x-admin-token": adminToken.get() },
    });
    if (!res.ok) throw new Error(`inspect ${res.status}`);
    return res.json();
  },
  resetArchive: () =>
    fetch("/api/admin/reset-archive", { method: "POST", headers: adminHeaders() }).then(asResult),
  setAuto: (state: { autoGenerate?: boolean; autoTick?: boolean }) =>
    fetch("/api/admin/auto", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(state),
    }).then(asResult),
};

export const ENCRYPTION_SCHEME_KEYS = [
  "plaintext",
  "sha256",
  "hmac-sha256",
  "rsa-oaep",
  "ecdh-aes",
  "hybrid-mlkem",
] as const;

export const SYSTEM_PRODUCTS: Record<"keystone" | "helix", string[]> = {
  keystone: ["loan", "bond"],
  helix: ["fx", "irs", "ccs"],
};
