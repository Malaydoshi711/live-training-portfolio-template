// 2D toy datasets in roughly [-1, 1]^2. Class 0 = A, class 1 = B.
import { rngFrom, type Rng } from "./mlp";

export type DatasetName = "spiral" | "moons" | "circles";
export const DATASETS: DatasetName[] = ["spiral", "moons", "circles"];

export type Points = { X: Float64Array; Y: Uint8Array; n: number };

const gauss = (r: Rng) => {
  // Box-Muller
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export function makeDataset(name: DatasetName, n = 200, seed = 711, capacity = 420): Points {
  const r = rngFrom(seed);
  const X = new Float64Array(capacity * 2);
  const Y = new Uint8Array(capacity);
  const half = n >> 1;
  let k = 0;
  const put = (x: number, y: number, c: number) => { X[k * 2] = x; X[k * 2 + 1] = y; Y[k] = c; k++; };

  if (name === "spiral") {
    // two interleaved arms, 1.5 turns each
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < half; i++) {
        const f = i / half;
        const rad = 0.08 + f * 0.84;
        const t = f * 1.5 * 2 * Math.PI + c * Math.PI;
        put(rad * Math.cos(t) + gauss(r) * 0.028, rad * Math.sin(t) + gauss(r) * 0.028, c);
      }
    }
  } else if (name === "moons") {
    for (let i = 0; i < half; i++) {
      const t = (i / (half - 1)) * Math.PI;
      // sklearn's make_moons, centred and scaled into the unit box
      put((Math.cos(t) - 0.5) / 1.6 + gauss(r) * 0.05, (Math.sin(t) - 0.25) / 1.6 + gauss(r) * 0.05, 0);
      put((1 - Math.cos(t) - 0.5) / 1.6 + gauss(r) * 0.05, (0.5 - Math.sin(t) - 0.25) / 1.6 + gauss(r) * 0.05, 1);
    }
  } else {
    for (let i = 0; i < half; i++) {
      const a = r() * Math.PI * 2;
      const inner = Math.sqrt(r()) * 0.34;
      put(inner * Math.cos(a) + gauss(r) * 0.02, inner * Math.sin(a) + gauss(r) * 0.02, 1);
      const b = r() * Math.PI * 2;
      const outer = 0.62 + r() * 0.28;
      put(outer * Math.cos(b) + gauss(r) * 0.02, outer * Math.sin(b) + gauss(r) * 0.02, 0);
    }
  }
  return { X, Y, n: k };
}
