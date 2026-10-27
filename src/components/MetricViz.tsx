import type { Project, Viz } from "../data/content";

/** The "Out" visual beside a project card, chosen by `project.viz`
 *  (see the Viz type in content.ts for the options and the default rule). */
export function resolveViz(p: Project): Viz {
  if (p.viz) return p.viz;
  if (p.metric && /%\s*$/.test(p.metric.value) && !Number.isNaN(parseFloat(p.metric.value))) return { type: "gauge" };
  if (p.metric) return { type: "number" };
  return { type: "none" };
}

export default function MetricViz({ p }: { p: Project }) {
  const v = resolveViz(p);
  const m = p.metric;
  switch (v.type) {
    case "gauge": {
      const n = m ? parseFloat(m.value) : NaN;
      if (!m || Number.isNaN(n)) return m ? <Big value={m.value} label={m.label} /> : null;
      return <Gauge value={Math.max(0, Math.min(100, n))} text={m.value} label={m.label} bar={v.bar} />;
    }
    case "number": return m ? <Big value={m.value} label={m.label} /> : null;
    case "bars": return <Bars items={v.items} cap={v.caption} />;
    case "compare": return <Compare v={v} />;
    case "count": return <Count n={v.n} label={v.label ?? m?.label ?? ""} />;
    case "steps": return <Steps steps={v.steps} cap={v.caption} />;
    case "hub": return <Hub center={v.center} nodes={v.nodes} cap={v.caption} />;
    case "code": return <Code code={v.code} cap={v.caption} note={m ? `${m.value} ${m.label}` : undefined} />;
    default: return null;
  }
}

function Out({ children, cap }: { children: React.ReactNode; cap: string }) {
  return (
    <figure className="viz">
      <figcaption className="viz__cap">Out <span>{cap}</span></figcaption>
      {children}
    </figure>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <Out cap="result">
      <p className="viz__big viz__big--xl">{value}</p>
      <p className="viz__lab">{label}</p>
    </Out>
  );
}

function Gauge({ value, text, label, bar }: { value: number; text: string; label: string; bar?: { label: string; value: number } }) {
  const r = 46, c = Math.PI * r;
  return (
    <Out cap="metric">
      <svg className="gauge" viewBox="0 0 120 74" role="img" aria-label={`${text} ${label}`}>
        <path d="M14 64a46 46 0 0 1 92 0" className="gauge__track" />
        <path d="M14 64a46 46 0 0 1 92 0" className="gauge__val" style={{ strokeDasharray: `${(c * value) / 100} ${c}` }} />
        {[0, 25, 50, 75, 100].map((t) => {
          const a = Math.PI * (1 - t / 100);
          return <line key={t} x1={60 + Math.cos(a) * 52} y1={64 - Math.sin(a) * 52} x2={60 + Math.cos(a) * 56} y2={64 - Math.sin(a) * 56} className="gauge__tick" />;
        })}
      </svg>
      <p className="viz__big">{text}</p>
      <p className="viz__lab">{label}</p>
      {bar && <Bar label={bar.label} frac={bar.value} text={bar.value.toFixed(2)} />}
    </Out>
  );
}

function Bar({ label, frac, text, dim, cls }: { label: string; frac: number; text: string; dim?: boolean; cls?: string }) {
  return (
    <p className={`vbar${dim ? " vbar--dim" : ""}${cls ? ` ${cls}` : ""}`}><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} /></i><span>{text}</span></p>
  );
}

function Bars({ items, cap }: { items: { label: string; value: number; max?: number; text?: string }[]; cap?: string }) {
  return (
    <Out cap={cap ?? "values"}>
      <div className="vbars">
        {items.slice(0, 6).map((it) => <Bar key={it.label} label={it.label} frac={it.value / (it.max ?? 1)} text={it.text ?? String(it.value)} />)}
      </div>
    </Out>
  );
}

function Compare({ v }: { v: Extract<Viz, { type: "compare" }> }) {
  const max = Math.max(v.before.value, v.after.value) || 1;
  const better = v.lowerIsBetter ? v.after.value < v.before.value : v.after.value > v.before.value;
  const after = better ? "vbar--good" : "";
  return (
    <Out cap={v.caption ?? "before and after"}>
      <p className="viz__big">{v.after.text}</p>
      <p className="viz__lab">{v.after.value === v.before.value ? `same as ${v.before.label}` : `${v.after.value > v.before.value ? "up" : "down"} from ${v.before.text}`}</p>
      <div className="vbars">
        <Bar label={v.before.label} frac={v.before.value / max} text={v.before.text} dim />
        <Bar label={v.after.label} frac={v.after.value / max} text={v.after.text} cls={after} />
      </div>
    </Out>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  const k = Math.max(1, Math.min(40, Math.round(n)));
  return (
    <Out cap="count">
      <div className="checks" aria-hidden="true">
        {Array.from({ length: k }, (_, i) => <i key={i} />)}
      </div>
      <p className="viz__big">{n}</p>
      <p className="viz__lab">{label}</p>
    </Out>
  );
}

function Steps({ steps, cap }: { steps: string[]; cap?: string }) {
  return (
    <Out cap={cap ?? "pipeline"}>
      <ol className="flow">{steps.slice(0, 5).map((s) => <li key={s}>{s}</li>)}</ol>
    </Out>
  );
}

function Hub({ center, nodes, cap }: { center: string; nodes: string[]; cap?: string }) {
  const list = nodes.slice(0, 5).map((t) => (t.length > 11 ? `${t.slice(0, 10)}.` : t));
  const short = center.length > 12 ? `${center.slice(0, 11)}.` : center;
  const gap = list.length > 1 ? 60 / (list.length - 1) : 0;
  return (
    <Out cap={cap ?? "graph"}>
      <svg className="chain" viewBox="0 0 120 92" role="img" aria-label={`${center} connected to ${list.join(", ")}`}>
        <rect x="4" y="4" width="112" height="84" rx="6" className="chain__box" />
        <circle cx="26" cy="46" r="15" className="chain__agent" />
        <text x="26" y="48.5" className="chain__a" style={{ fontSize: `${Math.min(8, 26 / (0.58 * Math.max(1, short.length)))}px` }}>{short}</text>
        {list.map((t, i) => {
          const y = list.length > 1 ? 16 + i * gap : 46;
          return (
            <g key={t}>
              <path d={`M41 46C54 46 54 ${y} 64 ${y}`} className="chain__wire" />
              <rect x="64" y={y - 7} width="48" height="14" rx="3" className="chain__tool" />
              <text x="88" y={y + 3} className="chain__t">{t}</text>
            </g>
          );
        })}
      </svg>
    </Out>
  );
}

function Code({ code, cap, note }: { code: string; cap?: string; note?: string }) {
  return (
    <Out cap={cap ?? "code"}>
      <pre className="md">{code}</pre>
      {note && <p className="viz__lab">{note}</p>}
    </Out>
  );
}
