// Typed client for this worker's own API: Better Auth (/api/auth/*) + trade booking
// (/trades). All same-origin, so the session cookie rides along automatically.

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Trade {
  id: string;
  product: string;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
  tradeDate: string;
  status: string;
  bookedBy: string | null;
  createdAt: string;
}

export interface BookInput {
  product: string;
  counterparty: string;
  notional: number;
  currency: string;
  rate: number;
  tenor: string;
}

export interface Result<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

const opts: RequestInit = { credentials: "include" };

async function asResult<T>(res: Response): Promise<Result<T>> {
  const body = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, body };
}

export const auth = {
  async session(): Promise<SessionUser | null> {
    const res = await fetch("/api/auth/get-session", opts);
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { user?: SessionUser } | null;
    return data?.user ?? null;
  },
  signIn: (email: string, password: string) =>
    fetch("/api/auth/sign-in/email", {
      ...opts,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(asResult<{ user: SessionUser }>),
  signOut: () => fetch("/api/auth/sign-out", { ...opts, method: "POST" }),
};

export const trades = {
  book: (input: BookInput) =>
    fetch("/trades", {
      ...opts,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then(asResult<Trade>),
  mine: async (): Promise<Trade[]> => {
    const res = await fetch("/trades?mine=1", opts);
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as { data?: Trade[] } | null;
    return data?.data ?? [];
  },
};

export const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
