// 2D fallback when WebGL is unavailable: the same live training, drawn as a
// heatmap on a canvas in the hero. Everything else on the page is plain HTML.
import { GridEval } from "../ml/grid";
import { run } from "../ml/run";
import { HEX } from "../theme";

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class Flat {
  private ctx: CanvasRenderingContext2D;
  private grid = new GridEval(48, 1.08);
  private img: ImageData;
  private off = document.createElement("canvas");
  private raf = 0;
  private A = hex(HEX.ember);
  private B = hex(HEX.teal);
  private M = hex("#2a241e");

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.off.width = this.off.height = 48;
    this.img = this.off.getContext("2d")!.createImageData(48, 48);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const d = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, r.width * d);
    this.canvas.height = Math.max(1, r.height * d);
  }

  /** Map a client point to model space, or null if outside the plot. */
  pick(cx: number, cy: number): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const s = Math.min(r.width, r.height);
    const x0 = r.left + (r.width - s) / 2, y0 = r.top + (r.height - s) / 2;
    const u = ((cx - x0) / s) * 2.16 - 1.08, v = -(((cy - y0) / s) * 2.16 - 1.08);
    return Math.abs(u) <= 1 && Math.abs(v) <= 1 ? [u, v] : null;
  }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const tr = run.trainer;
    if (run.training) tr.train(4);
    this.grid.update(tr.model, 2, 4);
    const out = this.grid.out, d = this.img.data;
    for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) {
      const p = out[j * 48 + i];
      const c = p < 0.5 ? this.A : this.B;
      const k = Math.pow(Math.abs(p - 0.5) * 2, 0.8) * 0.8;
      const o = ((47 - j) * 48 + i) * 4;
      d[o] = this.M[0] + (c[0] - this.M[0]) * k;
      d[o + 1] = this.M[1] + (c[1] - this.M[1]) * k;
      d[o + 2] = this.M[2] + (c[2] - this.M[2]) * k;
      d[o + 3] = 255;
    }
    this.off.getContext("2d")!.putImageData(this.img, 0, 0);
    const { width: W, height: H } = this.canvas;
    const s = Math.min(W, H), x0 = (W - s) / 2, y0 = (H - s) / 2;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.off, x0, y0, s, s);
    const dpr = W / this.canvas.getBoundingClientRect().width || 1;
    for (let r = 0; r < tr.n; r++) {
      const px = x0 + ((tr.X[r * 2] + 1.08) / 2.16) * s, py = y0 + (1 - (tr.X[r * 2 + 1] + 1.08) / 2.16) * s;
      ctx.beginPath();
      ctx.arc(px, py, 3.2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = tr.Y[r] ? HEX.teal : HEX.ember;
      ctx.fill();
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = "rgba(18,16,13,0.8)";
      ctx.stroke();
    }
  };

  start() { this.frame(); }
  dispose() { cancelAnimationFrame(this.raf); }
}
