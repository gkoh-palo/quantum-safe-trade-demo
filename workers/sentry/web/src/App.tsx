import { useCallback, useEffect, useState } from "react";
import { auth, trades, fmtMoney, type SessionUser, type Trade } from "./api";

// System-specific config — Quantum's booking UI (M12) is this same app with a
// different SYSTEM block (liability products).
const SYSTEM = {
  name: "Sentry",
  tagline: "Asset trade booking",
  products: [
    ["loan", "Loan"],
    ["bond", "Bond"],
  ] as const,
  demoEmail: "demo@sentry.local",
};

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setUser(await auth.session());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  if (loading) return <div className="center muted">Loading…</div>;
  return user ? <Booking user={user} onLogout={refreshUser} /> : <Login onLoggedIn={refreshUser} />;
}

function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState(SYSTEM.demoEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await auth.signIn(email, password);
    setBusy(false);
    if (r.ok) onLoggedIn();
    else setError(r.status === 401 ? "Invalid email or password" : `Sign-in failed (${r.status})`);
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <div className="brand">
          <span className="dot" /> {SYSTEM.name}
        </div>
        <p className="muted">{SYSTEM.tagline} — please sign in.</p>
        <input
          className="field"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <input
          className="field"
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button className="btn primary" type="submit" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <div className="note bad">{error}</div>}
        <p className="muted small">Accounts are admin-seeded (no public sign-up).</p>
      </form>
    </div>
  );
}

function Booking({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [blotter, setBlotter] = useState<Trade[]>([]);
  const refresh = useCallback(async () => setBlotter(await trades.mine()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = async () => {
    await auth.signOut();
    onLogout();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> {SYSTEM.name} · {SYSTEM.tagline}
        </div>
        <div className="who">
          {user.email}
          <button className="btn ghost small" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className="grid">
        <BookForm onBooked={refresh} />
        <Blotter trades={blotter} />
      </section>
    </div>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function BookForm({ onBooked }: { onBooked: () => void }) {
  const empty = {
    product: SYSTEM.products[0][0] as string,
    counterparty: "",
    notional: "",
    currency: "USD",
    rate: "",
    tenor: "5Y",
  };
  const [form, setForm] = useState(empty);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const book = async () => {
    setBusy(true);
    setNote(null);
    const r = await trades.book({
      product: form.product,
      counterparty: form.counterparty,
      notional: Number(form.notional),
      currency: form.currency,
      rate: Number(form.rate),
      tenor: form.tenor,
    });
    setBusy(false);
    if (r.ok && r.body) {
      setNote({ ok: true, text: `Booked ${r.body.product} · ${fmtMoney(r.body.notional)}` });
      setForm(empty);
      onBooked();
    } else {
      setNote({ ok: false, text: `Booking failed (${r.status})` });
    }
  };

  const valid = form.counterparty && Number(form.notional) > 0 && form.rate !== "" && form.tenor;

  return (
    <div className="card">
      <h3>Book a trade</h3>
      <label className="lbl">Product</label>
      <select
        className="field"
        value={form.product}
        onChange={(e) => set("product", e.target.value)}
      >
        {SYSTEM.products.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <label className="lbl">Counterparty</label>
      <input
        className="field"
        placeholder="e.g. Northwind Treasury"
        value={form.counterparty}
        onChange={(e) => set("counterparty", e.target.value)}
      />
      <div className="row">
        <div>
          <label className="lbl">Notional</label>
          <input
            className="field"
            type="number"
            placeholder="50000000"
            value={form.notional}
            onChange={(e) => set("notional", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl">Currency</label>
          <input
            className="field"
            maxLength={3}
            value={form.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </div>
      </div>
      <div className="row">
        <div>
          <label className="lbl">Rate (%)</label>
          <input
            className="field"
            type="number"
            placeholder="4.1"
            value={form.rate}
            onChange={(e) => set("rate", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl">Tenor</label>
          <input
            className="field"
            value={form.tenor}
            onChange={(e) => set("tenor", e.target.value)}
          />
        </div>
      </div>
      <button className="btn primary" onClick={book} disabled={busy || !valid}>
        {busy ? "Booking…" : "Book trade"}
      </button>
      {note && <div className={`note ${note.ok ? "ok" : "bad"}`}>{note.text}</div>}
      <p className="muted small">
        Booked trades flow through the real encryption + wire path — they show up in the HNDL pitch.
      </p>
    </div>
  );
}

function Blotter({ trades }: { trades: Trade[] }) {
  return (
    <div className="card">
      <h3>My blotter ({trades.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Counterparty</th>
            <th className="num">Notional</th>
            <th>Rate</th>
            <th>Tenor</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td className="cap">{t.product}</td>
              <td>{t.counterparty}</td>
              <td className="num">
                {fmtMoney(t.notional)} <span className="muted">{t.currency}</span>
              </td>
              <td>{t.rate}%</td>
              <td>{t.tenor}</td>
              <td className="muted">{t.tradeDate ?? todayISO()}</td>
            </tr>
          ))}
          {trades.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No trades booked yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
