// A small multilayer perceptron written from scratch for the live hero.
// 2 inputs -> H tanh -> H tanh -> 1 sigmoid, binary cross-entropy, Adam.
// Everything lives in flat Float64Arrays so the hot loops stay allocation free.

export type Rng = () => number;

/** Mulberry32: tiny seeded PRNG so runs are reproducible. */
export function rngFrom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

export class MLP {
  readonly h: number;
  // parameters
  W1: Float64Array; b1: Float64Array; // h x 2, h
  W2: Float64Array; b2: Float64Array; // h x h, h
  W3: Float64Array; b3: Float64Array; // h, 1
  /** all parameter arrays in a fixed order (shared with grads and Adam moments) */
  readonly params: Float64Array[];
  readonly grads: Float64Array[];
  private m: Float64Array[];
  private v: Float64Array[];
  /** Adam step counter */
  t = 0;
  // scratch buffers
  private a1: Float64Array; private a2: Float64Array;
  private d1: Float64Array; private d2: Float64Array;

  /** extra gain on first-layer weights: inputs live in [-1, 1], so a wider
   *  spread lets tanh units carve the tight curves a spiral needs */
  static inGain = 4;

  constructor(h: number, seed = 711) {
    this.h = h;
    this.W1 = new Float64Array(h * 2); this.b1 = new Float64Array(h);
    this.W2 = new Float64Array(h * h); this.b2 = new Float64Array(h);
    this.W3 = new Float64Array(h); this.b3 = new Float64Array(1);
    this.params = [this.W1, this.b1, this.W2, this.b2, this.W3, this.b3];
    this.grads = this.params.map((p) => new Float64Array(p.length));
    this.m = this.params.map((p) => new Float64Array(p.length));
    this.v = this.params.map((p) => new Float64Array(p.length));
    this.a1 = new Float64Array(h); this.a2 = new Float64Array(h);
    this.d1 = new Float64Array(h); this.d2 = new Float64Array(h);
    this.init(seed);
  }

  /** Glorot-uniform weights, zero biases, fresh optimiser state. */
  init(seed: number) {
    const r = rngFrom(seed);
    const glorot = (w: Float64Array, fanIn: number, fanOut: number) => {
      const lim = Math.sqrt(6 / (fanIn + fanOut));
      for (let i = 0; i < w.length; i++) w[i] = (r() * 2 - 1) * lim;
    };
    glorot(this.W1, 2, this.h);
    for (let i = 0; i < this.W1.length; i++) this.W1[i] *= MLP.inGain;
    for (let i = 0; i < this.b1.length; i++) this.b1[i] = (r() * 2 - 1) * MLP.inGain * 0.5;
    glorot(this.W2, this.h, this.h);
    glorot(this.W3, this.h, 1);
    this.b1.fill(0); this.b2.fill(0); this.b3.fill(0);
    this.m.forEach((a) => a.fill(0));
    this.v.forEach((a) => a.fill(0));
    this.t = 0;
  }

  /** Forward pass for one point; fills the hidden activations. Returns p(class B). */
  forward(x: number, y: number): number {
    const h = this.h, W1 = this.W1, b1 = this.b1, W2 = this.W2, b2 = this.b2, a1 = this.a1, a2 = this.a2;
    for (let k = 0; k < h; k++) a1[k] = Math.tanh(W1[k * 2] * x + W1[k * 2 + 1] * y + b1[k]);
    let z = this.b3[0];
    for (let j = 0; j < h; j++) {
      let s = b2[j];
      const row = j * h;
      for (let k = 0; k < h; k++) s += W2[row + k] * a1[k];
      const a = Math.tanh(s);
      a2[j] = a;
      z += this.W3[j] * a;
    }
    return sigmoid(z);
  }

  /** Hidden activations of the last forward pass (layer 1 or 2). */
  activations(layer: 1 | 2) { return layer === 1 ? this.a1 : this.a2; }

  /**
   * Accumulate gradients of the mean BCE over a mini-batch and take one Adam step.
   * X is interleaved [x0, y0, x1, y1, ...], Y holds 0/1 labels, idx picks the batch rows.
   * Returns the mean batch loss before the update.
   */
  trainStep(X: Float64Array, Y: Uint8Array, idx: ArrayLike<number>, lr: number): number {
    this.grads.forEach((g) => g.fill(0));
    const loss = this.accumulate(X, Y, idx);
    this.adam(lr);
    return loss;
  }

  /** Mean BCE gradient over the rows in idx, written into this.grads. Returns mean loss. */
  accumulate(X: Float64Array, Y: Uint8Array, idx: ArrayLike<number>): number {
    const h = this.h, B = idx.length, inv = 1 / B;
    const [gW1, gb1, gW2, gb2, gW3, gb3] = this.grads;
    const W2 = this.W2, W3 = this.W3, a1 = this.a1, a2 = this.a2, d1 = this.d1, d2 = this.d2;
    let loss = 0;
    for (let n = 0; n < B; n++) {
      const r = idx[n];
      const x = X[r * 2], y = X[r * 2 + 1], t = Y[r];
      const p = this.forward(x, y);
      const pc = Math.min(1 - 1e-7, Math.max(1e-7, p));
      loss -= t ? Math.log(pc) : Math.log(1 - pc);
      const dz = (p - t) * inv; // dL/dz3 for sigmoid + BCE
      gb3[0] += dz;
      for (let j = 0; j < h; j++) {
        gW3[j] += dz * a2[j];
        d2[j] = dz * W3[j] * (1 - a2[j] * a2[j]);
      }
      d1.fill(0);
      for (let j = 0; j < h; j++) {
        const dj = d2[j];
        if (dj === 0) continue;
        gb2[j] += dj;
        const row = j * h;
        for (let k = 0; k < h; k++) {
          gW2[row + k] += dj * a1[k];
          d1[k] += W2[row + k] * dj;
        }
      }
      for (let k = 0; k < h; k++) {
        const dk = d1[k] * (1 - a1[k] * a1[k]);
        gW1[k * 2] += dk * x;
        gW1[k * 2 + 1] += dk * y;
        gb1[k] += dk;
      }
    }
    return loss * inv;
  }

  private adam(lr: number, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
    this.t++;
    const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (let a = 0; a < this.params.length; a++) {
      const p = this.params[a], g = this.grads[a], m = this.m[a], v = this.v[a];
      for (let i = 0; i < p.length; i++) {
        const gi = g[i];
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        p[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps);
      }
    }
  }

  /** Mean loss and accuracy over the first n rows. */
  evaluate(X: Float64Array, Y: Uint8Array, n: number) {
    let loss = 0, correct = 0, tp = 0, tn = 0, fp = 0, fn = 0;
    for (let r = 0; r < n; r++) {
      const p = this.forward(X[r * 2], X[r * 2 + 1]);
      const t = Y[r];
      const pc = Math.min(1 - 1e-7, Math.max(1e-7, p));
      loss -= t ? Math.log(pc) : Math.log(1 - pc);
      const guess = p >= 0.5 ? 1 : 0;
      if (guess === t) correct++;
      if (t && guess) tp++; else if (!t && !guess) tn++; else if (!t && guess) fp++; else fn++;
    }
    return { loss: n ? loss / n : 0, acc: n ? correct / n : 0, tp, tn, fp, fn };
  }

  /** p(class B) on an n x n grid spanning [-ext, ext]^2, row-major (z rows, x columns). */
  predictGrid(out: Float32Array, n: number, ext: number) {
    const step = (2 * ext) / (n - 1);
    for (let j = 0; j < n; j++) {
      const y = -ext + j * step;
      for (let i = 0; i < n; i++) out[j * n + i] = this.forward(-ext + i * step, y);
    }
  }

  get paramCount() { return this.params.reduce((s, p) => s + p.length, 0); }
}
