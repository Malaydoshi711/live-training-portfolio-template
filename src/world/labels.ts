import * as THREE from "three";
import { HEX } from "../theme";

export type Line = { text: string; size: number; font?: "sans" | "mono" | "serif"; color?: string; weight?: number; gap?: number };

const FAM = {
  sans: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
  serif: '"Instrument Serif", Georgia, serif',
};

/** Draw lines of text on a canvas and return a texture plus its aspect ratio. */
export function textTexture(lines: Line[], opts: { pad?: number; bg?: string; border?: string; align?: CanvasTextAlign; width?: number } = {}) {
  const pad = opts.pad ?? 18;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const fontOf = (l: Line) => `${l.weight ?? 500} ${l.size}px ${FAM[l.font ?? "sans"]}`;
  let w = opts.width ?? 0;
  if (!w) {
    for (const l of lines) { ctx.font = fontOf(l); w = Math.max(w, ctx.measureText(l.text).width); }
    w = Math.ceil(w + pad * 2);
  }
  const h = Math.ceil(lines.reduce((s, l) => s + l.size * 1.25 + (l.gap ?? 0), 0) + pad * 2);
  c.width = w; c.height = h;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    roundRect(ctx, 1, 1, w - 2, h - 2, 10); ctx.fill();
    if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 2; ctx.stroke(); }
  }
  let y = pad;
  ctx.textBaseline = "top";
  ctx.textAlign = opts.align ?? "left";
  const x = opts.align === "center" ? w / 2 : pad;
  for (const l of lines) {
    y += l.gap ?? 0;
    ctx.font = fontOf(l);
    ctx.fillStyle = l.color ?? HEX.text;
    ctx.fillText(l.text, x, y);
    y += l.size * 1.25;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / h, canvas: c };
}

/** A camera-facing label, `height` world units tall. */
export function label(lines: Line[], height: number, opts?: Parameters<typeof textTexture>[1]) {
  const { tex, aspect } = textTexture(lines, opts);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(height * aspect, height, 1);
  return s;
}

/** A flat (non billboard) text plane. */
export function textPlane(lines: Line[], height: number, opts?: Parameters<typeof textTexture>[1]) {
  const { tex, aspect } = textTexture(lines, opts);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  return m;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrap text into lines that fit maxW at the current ctx font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export const FONTS = FAM;
