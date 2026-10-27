import { forwardRef } from "react";

export const BOOT_STEPS = [
  "Starting kernel",
  "Sampling 200 points from a two-arm spiral",
  "Initialising weights (Glorot uniform)",
  "Compiling shaders for the decision surface",
  "Ready. Training starts on your device",
];

/** Boot screen: a notebook kernel coming up. Lines and counter are driven from App. */
const Loader = forwardRef<HTMLDivElement>(function Loader(_, ref) {
  return (
    <div className="loader" ref={ref} role="status" aria-live="polite">
      <div className="loader__inner">
        <p className="loader__file"><span>run_live.ipynb</span><span className="loader__kernel">kernel <i /> busy</span></p>
        <div className="loader__cell">
          <span className="loader__prompt">In [<b className="loader__n">*</b>]:</span>
          <code>model.fit(spiral, epochs=∞, device=<em>"your browser"</em>)</code>
        </div>
        <ol className="loader__log">
          {BOOT_STEPS.map((s) => <li key={s}><span className="loader__tick" aria-hidden="true" />{s}</li>)}
        </ol>
        <div className="loader__meter">
          <svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
            <path className="loader__curve" pathLength={1} d={curve()} />
          </svg>
          <p className="loader__count"><span className="loader__num">000</span><span>%</span></p>
        </div>
      </div>
    </div>
  );
});

// a decaying, slightly noisy loss curve
function curve() {
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * 300;
    const y = 6 + 58 * Math.exp(-i / 11) + Math.sin(i * 1.7) * 2.2 * Math.exp(-i / 30);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}

export default Loader;
