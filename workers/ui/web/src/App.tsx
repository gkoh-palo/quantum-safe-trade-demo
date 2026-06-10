import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney, SCHEME_LABELS, type PitchState, type SchemeScore } from "./api";

export function App() {
  const [state, setState] = useState<PitchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.getState());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load state");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const advance = async () => {
    setBusy(true);
    await api.advanceEra();
    await api.runBreak();
    await refresh();
    setBusy(false);
  };
  const reset = async () => {
    setBusy(true);
    await api.resetEra();
    await refresh();
    setBusy(false);
  };

  if (!state) {
    return (
      <div className="app loading">
        <div className="spinner" />
        <p>{error ?? "Connecting to the wire…"}</p>
      </div>
    );
  }

  const { era, counts, scorecard, recentWire } = state;
  const quantum = era.era === "quantum";
  const t = scorecard.totals;

  return (
    <div className={`app ${quantum ? "era-quantum" : "era-classical"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> Quantum-Safe Trade Demo
        </div>
        <div className="posture">
          <span className="scheme">{SCHEME_LABELS[era.scheme] ?? era.scheme}</span>
          <span className="mode">{era.breakMode} mode</span>
          <span className={`era-badge ${quantum ? "q" : "c"}`}>
            {quantum ? "⚛ QUANTUM ERA" : "🕒 TODAY (classical)"}
          </span>
          <a className="navlink" href="/admin">
            Admin →
          </a>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Trades booked" value={counts.trades} />
        <Metric label="Harvested by Eve" value={counts.harvested} accent="warn" />
        <Metric label="Migrations" value={counts.migrations} />
        <Metric
          label="Notional exposed"
          value={fmtMoney(t.exposedNotional)}
          accent={t.broken ? "bad" : "ok"}
        />
      </section>

      <section className="switch-panel">
        <div className="switch-copy">
          <h2>{quantum ? "The quantum era has arrived" : "Harvest now, decrypt later"}</h2>
          <p>
            {quantum
              ? "Eve ran her break engine over everything she had stockpiled. Classical traffic is now readable; post-quantum traffic is not."
              : "Every message is encrypted on the wire — but Eve is copying the ciphertext into her archive. Today she can't read it. Pull the lever to fast-forward to when she can."}
          </p>
        </div>
        {quantum ? (
          <button className="lever reset" onClick={reset} disabled={busy}>
            ⟲ Reset to Today
          </button>
        ) : (
          <button className="lever advance" onClick={advance} disabled={busy}>
            {busy ? "Breaking…" : "⚛ Advance to the Quantum Era"}
          </button>
        )}
      </section>

      <Timeline
        quantum={quantum}
        exposed={fmtMoney(t.exposedNotional)}
        leaked={t.leakedCounterparties}
      />

      <section className="grid">
        <div className="card">
          <h3>Scorecard — by scheme</h3>
          <table className="scorecard">
            <thead>
              <tr>
                <th>Scheme</th>
                <th>Harvested</th>
                <th>Broken</th>
                <th>Protected</th>
                <th>Exposed</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.byScheme.map((s) => (
                <ScoreRow key={s.scheme} s={s} />
              ))}
              {scorecard.byScheme.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No traffic harvested yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Live wire — sniffed by Eve</h3>
          <ul className="wire">
            {recentWire.map((w) => (
              <li key={w.id}>
                <span className="hop">
                  {w.fromService} → {w.toService}
                </span>
                <span className="wscheme">{SCHEME_LABELS[w.scheme] ?? w.scheme}</span>
                <span
                  className={`lock ${w.scheme === "hybrid-mlkem" ? "safe" : quantum ? "open" : "shut"}`}
                >
                  {w.scheme === "hybrid-mlkem" ? "🔒" : quantum ? "🔓" : "🔒"}
                </span>
              </li>
            ))}
            {recentWire.length === 0 && <li className="muted">No wire traffic yet.</li>}
          </ul>
        </div>
      </section>

      <footer className="honesty">
        <strong>Honest by design.</strong> In <code>projected</code> mode the classical break is a
        simulated reveal at 100% CRQC progress (real RSA-2048 isn't factored on a laptop); in{" "}
        <code>genuine</code> mode it breaks live with deliberately shrunken keys. The hybrid X25519
        + ML-KEM-768 path is <em>never</em> broken, in any mode.
      </footer>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className={`metric ${accent ?? ""}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function ScoreRow({ s }: { s: SchemeScore }) {
  return (
    <tr>
      <td>
        {SCHEME_LABELS[s.scheme] ?? s.scheme}
        {s.quantumSafe && <span className="pq-badge">PQ-safe</span>}
      </td>
      <td>{s.harvested}</td>
      <td className={s.broken ? "bad" : ""}>{s.broken}</td>
      <td className={s.protected ? "ok" : ""}>{s.protected}</td>
      <td>{fmtMoney(s.exposedNotional)}</td>
    </tr>
  );
}

function Timeline({
  quantum,
  exposed,
  leaked,
}: {
  quantum: boolean;
  exposed: string;
  leaked: number;
}) {
  return (
    <section className="timeline">
      <div className="tl-point capture">
        <div className="tl-marker" />
        <div className="tl-label">
          <strong>Today</strong>
          <span>ciphertext captured</span>
        </div>
      </div>
      <div className={`tl-line ${quantum ? "active" : ""}`}>
        <span className="tl-gap">years of confidentiality that were never actually there</span>
      </div>
      <div className={`tl-point break ${quantum ? "fired" : ""}`}>
        <div className="tl-marker" />
        <div className="tl-label">
          <strong>Quantum era</strong>
          <span>
            {quantum ? `${exposed} exposed · ${leaked} counterparties leaked` : "decrypt later"}
          </span>
        </div>
      </div>
    </section>
  );
}
