// Checks the from-scratch MLP: exact gradients, convergence on every dataset and
// init, decision boundaries that fit the data, adaptation to dropped points.
// Run with: npm run test:ml
import { MLP } from "../src/ml/mlp";
import { makeDataset } from "../src/ml/datasets";
import { Trainer } from "../src/ml/trainer";

let fail = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fail++; };

// 1. gradient check vs finite differences
{
  const m = new MLP(5, 3);
  const d = makeDataset("moons", 20, 1, 20);
  const idx = Array.from({ length: d.n }, (_, i) => i);
  m.grads.forEach((g) => g.fill(0));
  m.accumulate(d.X, d.Y, idx);
  const loss = () => { const g = m.grads.map((x) => x.slice()); m.grads.forEach((x) => x.fill(0)); const l = m.accumulate(d.X, d.Y, idx); m.grads.forEach((x, i) => x.set(g[i])); return l; };
  let maxRel = 0;
  m.params.forEach((p, a) => {
    for (let i = 0; i < p.length; i++) {
      const g = m.grads[a][i];
      const o = p[i]; const e = 1e-5;
      p[i] = o + e; const lp = loss(); p[i] = o - e; const lm = loss(); p[i] = o;
      const num = (lp - lm) / (2 * e);
      const rel = Math.abs(num - g) / Math.max(1e-6, Math.abs(num) + Math.abs(g));
      maxRel = Math.max(maxRel, rel);
    }
  });
  ok(maxRel < 1e-4, `gradient check max relative error ${maxRel.toExponential(2)}`);
}

// 2. training converges on each dataset with defaults (16 units, lr 0.03, batch 32)
for (const name of ["spiral", "moons", "circles"] as const) {
  const t = new Trainer();
  t.loadDataset(name);
  const l0 = t.stats.loss;
  let stepsTo95 = -1;
  for (let s = 0; s < 6000; s += 4) { t.train(4); if (stepsTo95 < 0 && t.stats.acc >= 0.95) stepsTo95 = s; }
  t.evaluate();
  ok(t.stats.loss < l0 * 0.25 && t.stats.acc >= 0.97, `${name}: loss ${l0.toFixed(3)} -> ${t.stats.loss.toFixed(4)}, acc ${(t.stats.acc * 100).toFixed(1)}%, 95% acc after ~${stepsTo95} steps (≈${(stepsTo95 / 4 / 60).toFixed(1)}s at 4 steps/frame, 60fps)`);
  // boundary fits: grid predictions agree with the nearest data point label most of the time
  const n = 40, grid = new Float32Array(n * n); t.model.predictGrid(grid, n, 1);
  let agree = 0, tot = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -1 + (2 * i) / (n - 1), y = -1 + (2 * j) / (n - 1);
    let best = 1e9, lab = 0;
    for (let r = 0; r < t.n; r++) { const d = (t.X[r*2]-x)**2 + (t.X[r*2+1]-y)**2; if (d < best) { best = d; lab = t.Y[r]; } }
    if (best < 0.005) { tot++; if ((grid[j*n+i] >= 0.5 ? 1 : 0) === lab) agree++; }
  }
  ok(agree / tot > 0.93, `${name}: boundary agrees with nearest-neighbour labels near the data on ${(100*agree/tot).toFixed(1)}% of ${tot} grid cells`);
}

// 3. other settings still learn
for (const [h, lr] of [[8, 0.03], [32, 0.01], [4, 0.1]] as const) {
  const t = new Trainer(); t.setHidden(h); t.setLr(lr); t.loadDataset("moons");
  for (let s = 0; s < 3000; s++) t.train(1);
  t.evaluate();
  ok(t.stats.acc >= 0.95, `moons h=${h} lr=${lr}: acc ${(t.stats.acc*100).toFixed(1)}%`);
}

// 4. user points: adding a cluster of class 1 inside class-0 territory gets learned
{
  const t = new Trainer(); t.loadDataset("circles");
  for (let s = 0; s < 1500; s++) t.train(4);
  const before = t.model.forward(0.8, 0.0);
  for (let i = 0; i < 10; i++) t.addPoint(0.8 + (i % 3) * 0.02, (i / 10) * 0.06, 1);
  for (let s = 0; s < 400; s++) t.train(4);
  const after = t.model.forward(0.81, 0.03);
  ok(before < 0.2 && after > 0.5, `adapts to dropped points: p(B) at (0.8,0) ${before.toFixed(3)} -> ${after.toFixed(3)}`);
  // capacity recycling
  for (let i = 0; i < 400; i++) t.addPoint(Math.random()*2-1, Math.random()*2-1, (i%2) as 0|1);
  ok(t.n === 420 && t.userStart === 200, `capacity capped at ${t.n}, base points kept`);
}

// 4b. robustness: every one of 10 random initialisations learns each dataset
for (const name of ["spiral", "moons", "circles"] as const) {
  const t = new Trainer(); t.loadDataset(name); let okc = 0;
  for (let r = 0; r < 10; r++) { if (r) t.reset(); for (let s = 0; s < 3000; s += 2) { t.train(2); if (t.stats.acc >= 0.97) break; } if (t.stats.acc >= 0.97) okc++; }
  ok(okc === 10, `${name}: ${okc}/10 random inits reach 97% within 3000 steps`);
}
// 5. timing
{
  const m = new MLP(16, 1); const g = new Float32Array(56*56);
  let t0 = performance.now(); for (let i = 0; i < 200; i++) m.predictGrid(g, 56, 1.05); const grid = (performance.now() - t0) / 200;
  const t = new Trainer(); t0 = performance.now(); for (let i = 0; i < 200; i++) t.train(4); const tr = (performance.now() - t0) / 200;
  console.log(`timing: 56x56 grid forward ${grid.toFixed(3)} ms, 4 train steps ${tr.toFixed(3)} ms (h=16)`);
  const m2 = new MLP(32, 1); t0 = performance.now(); for (let i = 0; i < 100; i++) m2.predictGrid(g, 56, 1.05);
  console.log(`timing: 56x56 grid forward h=32 ${((performance.now()-t0)/100).toFixed(3)} ms`);
}
setTimeout(()=>{console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);},0);
import { GridEval } from "../src/ml/grid";
{
  for (const h of [16, 32]) {
    const m = new MLP(h, 1); const ge = new GridEval(56, 1.05);
    let t0 = performance.now(); for (let i = 0; i < 100; i++) ge.update(m, 1e9); const dt = (performance.now() - t0) / 100;
    const exact = new Float32Array(56*56); m.predictGrid(exact, 56, 1.05);
    let maxErr = 0; for (let i = 0; i < exact.length; i++) maxErr = Math.max(maxErr, Math.abs(exact[i] - ge.out[i]));
    console.log(`GridEval h=${h}: full 56x56 pass ${dt.toFixed(3)} ms, max |p - exact| ${maxErr.toFixed(4)}`);
  }
}
