// Evaluates the model over the surface grid in row chunks under a time budget,
// so a big network never blows the frame. Visual-only, so it uses a fast tanh.
import type { MLP } from "./mlp";

/** Rational tanh approximation (max error ~0.02, exact sign and saturation). */
const ftanh = (x: number) => (x < -3 ? -1 : x > 3 ? 1 : (x * (27 + x * x)) / (27 + 9 * x * x));

export class GridEval {
  readonly out: Float32Array;
  private row = 0;
  private a1: Float64Array;
  private pass = 0;
  /** completed full passes */
  get passes() { return this.pass; }
  get atStart() { return this.row === 0; }

  constructor(readonly n: number, readonly ext: number, maxH = 32) {
    this.out = new Float32Array(n * n).fill(0.5);
    this.a1 = new Float64Array(maxH);
  }

  /** Evaluate rows until `budgetMs` is spent or the whole grid is done once. Returns rows done. */
  update(m: MLP, budgetMs: number, minRows = 2) {
    const n = this.n, h = m.h, ext = this.ext, step = (2 * ext) / (n - 1);
    const W1 = m.W1, b1 = m.b1, W2 = m.W2, b2 = m.b2, W3 = m.W3, b3 = m.b3[0];
    const a1 = this.a1, out = this.out;
    const t0 = performance.now();
    let done = 0;
    while (done < n) {
      const j = this.row;
      const y = -ext + j * step;
      for (let i = 0; i < n; i++) {
        const x = -ext + i * step;
        for (let k = 0; k < h; k++) a1[k] = ftanh(W1[k * 2] * x + W1[k * 2 + 1] * y + b1[k]);
        let z = b3;
        for (let q = 0; q < h; q++) {
          let s = b2[q];
          const r = q * h;
          for (let k = 0; k < h; k++) s += W2[r + k] * a1[k];
          z += W3[q] * ftanh(s);
        }
        out[j * n + i] = 1 / (1 + Math.exp(-z));
      }
      done++;
      this.row = (this.row + 1) % n;
      if (this.row === 0) { this.pass++; break; }
      if (done >= minRows && performance.now() - t0 > budgetMs) break;
    }
    return done;
  }
}
