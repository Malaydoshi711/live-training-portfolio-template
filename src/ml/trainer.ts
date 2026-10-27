// Owns the live run: dataset, model, optimiser settings, history and the
// per-frame work budget. Rendering code only reads from it.
import { MLP, rngFrom } from "./mlp";
import { makeDataset, type DatasetName } from "./datasets";

export const HIDDEN_OPTIONS = [4, 8, 16, 32] as const;
export const LR_OPTIONS = [0.003, 0.01, 0.03, 0.1] as const;
export const CAPACITY = 420;
const BASE_N = 200;

export type Stats = {
  step: number; epoch: number; loss: number; acc: number;
  tp: number; tn: number; fp: number; fn: number; n: number; userPoints: number;
};

export class Trainer {
  dataset: DatasetName = "spiral";
  hidden = 16;
  lr = 0.03;
  batch = 32;
  model: MLP;
  X = new Float64Array(CAPACITY * 2);
  Y = new Uint8Array(CAPACITY);
  n = 0;
  /** index where visitor-added points start */
  userStart = 0;
  samplesSeen = 0;
  /** smoothed full-dataset loss, sampled for the curve */
  history: number[] = [];
  stats: Stats = { step: 0, epoch: 0, loss: 0.69, acc: 0.5, tp: 0, tn: 0, fp: 0, fn: 0, n: 0, userPoints: 0 };
  /** bumps whenever the model parameters change, so views know to refresh */
  version = 0;
  /** bumps when the data or architecture changes */
  dataVersion = 0;
  private rng = rngFrom(17);
  private idx = new Int32Array(64);
  private seed = 711;
  private sinceEval = 0;

  constructor() {
    this.model = new MLP(this.hidden, this.seed);
    this.loadDataset("spiral");
  }

  loadDataset(name: DatasetName) {
    this.dataset = name;
    const d = makeDataset(name, BASE_N, 711 + name.length, CAPACITY);
    this.X.set(d.X); this.Y.set(d.Y); this.n = d.n; this.userStart = d.n;
    this.reset();
  }

  setHidden(h: number) {
    this.hidden = h;
    this.model = new MLP(h, this.seed);
    this.reset(false);
  }

  setLr(lr: number) { this.lr = lr; }

  /** Fresh random weights (new seed each time so resets look different). */
  reset(newSeed = true) {
    if (newSeed) this.seed = (this.seed * 48271) % 2147483647;
    this.model.init(this.seed);
    this.samplesSeen = 0;
    this.history = [];
    this.dataVersion++;
    this.version++;
    this.evaluate();
    this.history.push(this.stats.loss);
  }

  /** Drop a point of class c at (x, y) in model space. Oldest visitor points recycle. */
  addPoint(x: number, y: number, c: 0 | 1) {
    if (this.n >= CAPACITY) {
      // shift the visitor block left by one, dropping its oldest point
      this.X.copyWithin(this.userStart * 2, (this.userStart + 1) * 2, this.n * 2);
      this.Y.copyWithin(this.userStart, this.userStart + 1, this.n);
      this.n--;
    }
    this.X[this.n * 2] = Math.max(-1, Math.min(1, x));
    this.X[this.n * 2 + 1] = Math.max(-1, Math.min(1, y));
    this.Y[this.n] = c;
    this.n++;
    this.dataVersion++;
    this.evaluate();
  }

  /** Run `steps` Adam mini-batch steps. */
  train(steps: number) {
    const B = Math.min(this.batch, this.n);
    if (B === 0) return;
    const idx = B === this.idx.length ? this.idx : this.idx.subarray(0, B);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < B; i++) idx[i] = Math.floor(this.rng() * this.n);
      this.model.trainStep(this.X, this.Y, idx, this.lr);
      this.samplesSeen += B;
    }
    this.version++;
    this.sinceEval += steps;
    if (this.sinceEval >= 12) {
      this.sinceEval = 0;
      this.evaluate();
      this.history.push(this.stats.loss);
      if (this.history.length > 360) {
        // keep the whole run visible by halving the resolution
        this.history = this.history.filter((_, i) => i % 2 === 0);
      }
    }
  }

  evaluate() {
    const e = this.model.evaluate(this.X, this.Y, this.n);
    this.stats = {
      ...e, n: this.n, step: this.model.t,
      epoch: this.n ? this.samplesSeen / this.n : 0,
      userPoints: this.n - this.userStart,
    };
  }
}
