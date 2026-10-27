import { useEffect, useRef, useState } from "react";
import { run } from "../ml/run";
import { HEX } from "../theme";
import { HIDDEN_OPTIONS, LR_OPTIONS } from "../ml/trainer";
import { DATASETS, type DatasetName } from "../ml/datasets";

const fmtLoss = (l: number) => (l < 0.001 ? l.toExponential(1) : l.toFixed(4));

/** Re-render on run changes and on a slow tick (stats change every frame). */
export function useRunTick(ms = 160) {
  const [, setN] = useState(0);
  useEffect(() => {
    const off = run.on(() => setN((n) => n + 1));
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => { off(); clearInterval(id); };
  }, [ms]);
  return run;
}

function status() {
  if (!run.live) return "warming up";
  if (!run.playing) return "paused";
  if (!run.inView) return "paused while you read";
  const s = run.trainer.stats;
  return s.acc === 1 && s.loss < 0.01 ? "converged, still training" : "training";
}

/** Draw the loss history on a small canvas (log scale). */
function LossCurve() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let id = 0, last = -1, lastLen = -1;
    const draw = () => {
      id = window.setTimeout(draw, 200);
      const c = ref.current;
      if (!c) return;
      const h = run.trainer.history;
      if (h.length === lastLen && run.trainer.dataVersion === last) return;
      lastLen = h.length; last = run.trainer.dataVersion;
      const r = c.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(r.width * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
      const ctx = c.getContext("2d")!;
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(239,232,219,0.09)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) { const y = Math.round((k / 4) * H) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      if (h.length < 2) return;
      const lo = -4, hi = 0.1;
      const yOf = (l: number) => H - 3 * d - ((Math.log10(Math.max(1e-4, l)) - lo) / (hi - lo)) * (H - 6 * d);
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, HEX.ember); grad.addColorStop(1, HEX.cream);
      ctx.beginPath();
      h.forEach((l, i) => { const x = (i / (h.length - 1)) * (W - 4 * d) + 2 * d; const y = yOf(l); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = grad; ctx.lineWidth = 1.6 * d; ctx.lineJoin = "round"; ctx.stroke();
      ctx.lineTo(W - 2 * d, H); ctx.lineTo(2 * d, H); ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, H);
      fill.addColorStop(0, "rgba(255,107,61,0.22)"); fill.addColorStop(1, "rgba(255,107,61,0)");
      ctx.fillStyle = fill; ctx.fill();
    };
    draw();
    return () => clearTimeout(id);
  }, []);
  return <canvas className="console__curve" ref={ref} aria-hidden="true" />;
}

export default function Console({ touch }: { touch: boolean }) {
  useRunTick();
  const tr = run.trainer;
  const s = tr.stats;
  const [more, setMore] = useState(false);
  const pick = (d: DatasetName) => { tr.loadDataset(d); run.emit(); };

  return (
    <aside className="console" aria-label="Live training controls">
      <header className="console__head">
        <p className="console__title"><span className={`dot${run.training ? " dot--on" : ""}`} aria-hidden="true" />Live training run</p>
        <p className="console__status">{status()}</p>
      </header>
      <dl className="console__stats">
        <div><dt>epoch</dt><dd>{s.epoch.toFixed(1)}</dd></div>
        <div><dt>loss</dt><dd>{fmtLoss(s.loss)}</dd></div>
        <div><dt>accuracy</dt><dd>{(s.acc * 100).toFixed(1)}%</dd></div>
        <div className="console__params"><dt>weights</dt><dd>{tr.model.paramCount}</dd></div>
      </dl>
      <LossCurve />

      <div className="console__row" role="group" aria-label="Dataset">
        <span className="console__lab">data</span>
        <div className="seg">
          {DATASETS.map((d) => (
            <button key={d} className={tr.dataset === d ? "is-on" : ""} aria-pressed={tr.dataset === d} onClick={() => pick(d)}>{d}</button>
          ))}
        </div>
      </div>

      <div className={`console__more${more ? " is-open" : ""}`} id="console-more">
        <div className="console__row" role="group" aria-label="Hidden units per layer">
          <span className="console__lab">units</span>
          <div className="seg">
            {HIDDEN_OPTIONS.map((h) => (
              <button key={h} className={tr.hidden === h ? "is-on" : ""} aria-pressed={tr.hidden === h} onClick={() => { tr.setHidden(h); run.emit(); }}>{h}</button>
            ))}
          </div>
        </div>
        <div className="console__row" role="group" aria-label="Learning rate">
          <span className="console__lab">lr</span>
          <div className="seg">
            {LR_OPTIONS.map((lr) => (
              <button key={lr} className={tr.lr === lr ? "is-on" : ""} aria-pressed={tr.lr === lr} onClick={() => { tr.setLr(lr); run.emit(); }}>{String(lr).replace(/^0/, "")}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="console__row" role="group" aria-label="Class to drop">
        <span className="console__lab">{touch ? "tap adds" : "click adds"}</span>
        <div className="seg seg--brush">
          <button className={run.brush === 0 ? "is-on" : ""} aria-pressed={run.brush === 0} onClick={() => run.set({ brush: 0 })}><i className="sw sw--a" />class A</button>
          <button className={run.brush === 1 ? "is-on" : ""} aria-pressed={run.brush === 1} onClick={() => run.set({ brush: 1 })}><i className="sw sw--b" />class B</button>
        </div>
      </div>

      <div className="console__actions">
        <button className="cbtn" onClick={() => run.set({ playing: !run.playing })} aria-pressed={!run.playing}>{run.playing ? "Pause" : "Train"}</button>
        <button className="cbtn" onClick={() => { tr.reset(); run.emit(); }}>Reset weights</button>
        {s.userPoints > 0 && <button className="cbtn" onClick={() => { tr.loadDataset(tr.dataset); run.emit(); }}>Clear my {s.userPoints} point{s.userPoints > 1 ? "s" : ""}</button>}
        <button className="cbtn cbtn--ghost console__toggle" aria-expanded={more} aria-controls="console-more" onClick={() => setMore((m) => !m)}>{more ? "Fewer" : "Tune"}</button>
      </div>
      <p className="console__hint">
        {touch ? "Tap the surface to drop a point and watch the boundary bend." : <>Click the surface to drop a point, <kbd>Shift</kbd> for the other class.</>}
      </p>
    </aside>
  );
}

/** Compact status for the fixed top bar. */
export function RunPill({ onClick }: { onClick: () => void }) {
  useRunTick(250);
  const s = run.trainer.stats;
  return (
    <button className="pill" onClick={onClick} aria-label="Live training run, back to the controls">
      <span className={`dot${run.training ? " dot--on" : ""}`} aria-hidden="true" />
      <span className="pill__k">{run.trainer.dataset}</span>
      <span className="pill__v"><span className="pill__k">ep</span> {s.epoch.toFixed(0)}</span>
      <span className="pill__v"><span className="pill__k">loss</span> {fmtLoss(s.loss)}</span>
      <span className="pill__v pill__acc"><span className="pill__k">acc</span> {(s.acc * 100).toFixed(0)}%</span>
    </button>
  );
}
