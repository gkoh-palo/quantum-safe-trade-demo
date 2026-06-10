import { useCallback, useEffect, useState } from "react";
import {
  admin,
  adminToken,
  api,
  ENCRYPTION_SCHEME_KEYS,
  fmtMoney,
  SCHEME_LABELS,
  SYSTEM_PRODUCTS,
  type InspectedPacket,
} from "./api";

interface InjectedNote {
  ok: boolean;
  text: string;
}

export function Admin() {
  const [token, setToken] = useState(adminToken.get());
  const [note, setNote] = useState<InjectedNote | null>(null);
  const [inspect, setInspect] = useState<InspectedPacket[]>([]);

  const saveToken = (t: string) => {
    setToken(t);
    adminToken.set(t);
  };
  const flash = (ok: boolean, text: string) => setNote({ ok, text });

  const refreshInspect = useCallback(async () => {
    try {
      setInspect(await admin.inspect());
    } catch {
      /* unauthorised until a valid token is set */
    }
  }, []);

  useEffect(() => {
    void refreshInspect();
    const t = setInterval(() => void refreshInspect(), 3000);
    return () => clearInterval(t);
  }, [refreshInspect]);

  return (
    <div className="app admin">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> Admin · Control Plane
        </div>
        <a className="navlink" href="/">
          ← Pitch view
        </a>
      </header>

      <section className="card">
        <h3>Admin token</h3>
        <p className="muted">
          Break-glass token (the <code>ADMIN_TOKEN</code> secret). Stored locally; sent as
          <code>x-admin-token</code>.
        </p>
        <input
          className="field"
          type="password"
          placeholder="admin token"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
        />
        <button
          className="lever reset small"
          onClick={async () => {
            if (!confirm("Wipe all trades, wire messages and harvested loot?")) return;
            const r = await admin.resetArchive();
            flash(r.ok, r.ok ? "Archive cleared — clean slate." : `Failed (${r.status})`);
            void refreshInspect();
          }}
        >
          Clear archive (wipe trades + loot)
        </button>
      </section>

      {note && <div className={`note ${note.ok ? "ok" : "bad"}`}>{note.text}</div>}

      <section className="grid admin-grid">
        <SchemePanel flash={flash} />
        <CrqcPanel flash={flash} />
        <InjectPanel flash={flash} onInjected={refreshInspect} />
        <AutoPanel flash={flash} />
      </section>

      <section className="card">
        <h3>Raw inspector — Eve's archive</h3>
        <table className="scorecard">
          <thead>
            <tr>
              <th>Hop</th>
              <th>Scheme</th>
              <th>Ciphertext</th>
              <th>Recovered</th>
            </tr>
          </thead>
          <tbody>
            {inspect.map((p) => (
              <tr key={p.wireMessageId}>
                <td>
                  {p.fromService} → {p.toService}
                </td>
                <td>{SCHEME_LABELS[p.scheme] ?? p.scheme}</td>
                <td className="mono">{p.ciphertextPreview ? `${p.ciphertextPreview}…` : "—"}</td>
                <td className={p.broken ? "bad" : "ok"}>{renderRecovered(p)}</td>
              </tr>
            ))}
            {inspect.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No loot (or token not set).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function renderRecovered(p: InspectedPacket): string {
  if (!p.broken) return "🔒 opaque";
  const r = p.recoveredPlaintext as { counterparty?: string; notional?: number } | null;
  if (r && typeof r === "object" && r.counterparty) {
    return `🔓 ${r.counterparty} ${r.notional ? fmtMoney(r.notional) : ""}`.trim();
  }
  return "🔓 recovered";
}

function SchemePanel({ flash }: { flash: (ok: boolean, text: string) => void }) {
  const [scheme, setScheme] = useState("rsa-oaep");
  const [breakMode, setBreakMode] = useState("projected");
  const apply = async () => {
    const r = await admin.setScheme(scheme, breakMode);
    flash(
      r.ok,
      r.ok ? `Active scheme → ${scheme} (${breakMode}). Keyring rotated.` : `Failed (${r.status})`,
    );
  };
  return (
    <div className="card">
      <h3>Active scheme</h3>
      <p className="muted">
        Switch to hybrid-mlkem to show the post-quantum traffic survive the break.
      </p>
      <select className="field" value={scheme} onChange={(e) => setScheme(e.target.value)}>
        {ENCRYPTION_SCHEME_KEYS.map((s) => (
          <option key={s} value={s}>
            {SCHEME_LABELS[s] ?? s}
          </option>
        ))}
      </select>
      <select className="field" value={breakMode} onChange={(e) => setBreakMode(e.target.value)}>
        <option value="projected">projected (real keys, simulated countdown)</option>
        <option value="genuine">genuine (shrunken keys, live break)</option>
      </select>
      <button className="lever advance small" onClick={apply}>
        Apply scheme
      </button>
    </div>
  );
}

function AutoPanel({ flash }: { flash: (ok: boolean, text: string) => void }) {
  const [gen, setGen] = useState(false);
  const [tick, setTick] = useState(false);

  useEffect(() => {
    void api.getState().then((s) => {
      setGen(s.era.autoGenerate);
      setTick(s.era.autoTick);
    });
  }, []);

  const toggle = async (key: "autoGenerate" | "autoTick", value: boolean) => {
    if (key === "autoGenerate") setGen(value);
    else setTick(value);
    const r = await admin.setAuto({ [key]: value });
    flash(r.ok, r.ok ? `${key} = ${value}` : `Failed (${r.status})`);
  };

  return (
    <div className="card">
      <h3>Auto-mode (cron)</h3>
      <p className="muted">Hands-off demo: generate trades every minute, advance CRQC every two.</p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={gen}
          onChange={(e) => void toggle("autoGenerate", e.target.checked)}
        />
        Trade generator (keep the wire live)
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={tick}
          onChange={(e) => void toggle("autoTick", e.target.checked)}
        />
        CRQC auto-tick (countdown to quantum era)
      </label>
    </div>
  );
}

function CrqcPanel({ flash }: { flash: (ok: boolean, text: string) => void }) {
  const [progress, setProgress] = useState(0);
  const set = async () => {
    const r = await admin.setCrqc(progress);
    flash(r.ok, r.ok ? `CRQC progress → ${progress}%` : `Failed (${r.status})`);
  };
  return (
    <div className="card">
      <h3>CRQC countdown</h3>
      <p className="muted">
        Below 100% projected-mode classical traffic stays unbroken; 100% completes the countdown.
      </p>
      <input
        className="field"
        type="range"
        min={0}
        max={100}
        value={progress}
        onChange={(e) => setProgress(Number(e.target.value))}
      />
      <div className="crqc-val">{progress}%</div>
      <button className="lever advance small" onClick={set}>
        Set progress
      </button>
    </div>
  );
}

function InjectPanel({
  flash,
  onInjected,
}: {
  flash: (ok: boolean, text: string) => void;
  onInjected: () => void;
}) {
  const [system, setSystem] = useState<"sentry" | "quantum">("sentry");
  const [product, setProduct] = useState("bond");
  const [counterparty, setCounterparty] = useState("Acme Corp");
  const [notional, setNotional] = useState(25_000_000);

  const inject = async () => {
    const r = await admin.injectTrade({
      system,
      product,
      counterparty,
      notional,
      currency: "USD",
      rate: 4.2,
      tenor: "5Y",
    });
    flash(r.ok, r.ok ? `Injected ${product} for ${counterparty}` : `Failed (${r.status})`);
    if (r.ok) onInjected();
  };

  return (
    <div className="card">
      <h3>Inject a trade</h3>
      <select
        className="field"
        value={system}
        onChange={(e) => {
          const s = e.target.value as "sentry" | "quantum";
          setSystem(s);
          setProduct(SYSTEM_PRODUCTS[s][0]!);
        }}
      >
        <option value="sentry">Sentry (assets)</option>
        <option value="quantum">Quantum (liabilities)</option>
      </select>
      <select className="field" value={product} onChange={(e) => setProduct(e.target.value)}>
        {SYSTEM_PRODUCTS[system].map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        className="field"
        value={counterparty}
        onChange={(e) => setCounterparty(e.target.value)}
      />
      <input
        className="field"
        type="number"
        value={notional}
        onChange={(e) => setNotional(Number(e.target.value))}
      />
      <button className="lever advance small" onClick={inject}>
        Inject trade
      </button>
    </div>
  );
}
