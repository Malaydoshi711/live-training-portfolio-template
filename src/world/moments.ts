// Section "moments": 3D objects that appear around the decision surface while
// their notebook cell is on screen. Every one of them reads the live model.
import * as THREE from "three";
import type { World } from "./World";
import { S } from "./World";
import { HEX, col } from "./palette";
import { label, roundRect, textTexture, wrap, FONTS } from "./labels";
import { experience, featured, publications } from "../data/content";

export interface Moment {
  section: number;
  group: THREE.Group;
  update(t: number, vis: number, dt: number): void;
  dispose?(): void;
}

const ease = (v: number) => 1 - Math.pow(1 - v, 3);

/** Track a material's base opacity so a moment can fade as one unit. */
class Fader {
  private mats: { m: THREE.Material & { opacity: number }; base: number; u?: { value: number } }[] = [];
  add<T extends THREE.Material>(m: T, base = 1): T {
    const mm = m as unknown as THREE.Material & { opacity: number; uniforms?: Record<string, { value: number }> };
    mm.transparent = true;
    this.mats.push({ m: mm, base, u: mm.uniforms?.uVis });
    return m;
  }
  set(v: number) {
    for (const x of this.mats) {
      if (x.u) x.u.value = x.base * v;
      else x.m.opacity = x.base * v;
    }
  }
}

function baseMoment(section: number, g: THREE.Group, f: Fader, vis: number, lift = 0.6) {
  g.visible = vis > 0.004;
  const e = ease(vis);
  f.set(e);
  g.position.y = g.userData.y0 - (1 - e) * lift;
  void section;
  return e;
}

/* -------------------------------------------------------------- */
/* 1. About: the live network, weights as glowing edges            */
/* -------------------------------------------------------------- */
const edgeVert = /* glsl */ `
  attribute vec3 aCol;
  varying vec3 vCol;
  varying float vX;
  void main() { vCol = aCol; vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const edgeFrag = /* glsl */ `
  uniform float uTime, uVis;
  varying vec3 vCol;
  varying float vX;
  void main() {
    // forward-pass pulses travelling left to right
    float ph = fract((vX * 0.32) - uTime * 0.42);
    float pulse = smoothstep(0.86, 1.0, ph) * 1.4;
    vec3 c = vCol * (0.55 + pulse);
    gl_FragColor = vec4(c * uVis, 1.0);
    #include <colorspace_fragment>
  }
`;

function networkMoment(w: World): Moment {
  const g = new THREE.Group();
  g.userData.y0 = 0;
  const f = new Fader();
  let builtH = -1;
  let nodes: THREE.InstancedMesh | null = null;
  let edges: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  let edgeMat: THREE.ShaderMaterial | null = null;
  const statics: THREE.Object3D[] = [];
  let lastV = -1;
  const X = [-3.4, -1.15, 1.15, 3.4];
  const Z = -2.3, YC = 2.45;
  const layerY = (count: number, i: number) => {
    const span = Math.min(3.3, (count - 1) * 0.26);
    return count === 1 ? YC : YC + span / 2 - (i / (count - 1)) * span;
  };

  const build = (h: number) => {
    if (nodes) { g.remove(nodes); nodes.geometry.dispose(); }
    if (edges) { g.remove(edges); edges.geometry.dispose(); }
    statics.forEach((s) => g.remove(s));
    statics.length = 0;
    const sizes = [2, h, h, 1];
    const total = sizes.reduce((a, b) => a + b, 0);
    const nodeMat = f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream).multiplyScalar(0.8) }));
    nodes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), nodeMat, total);
    const m = new THREE.Matrix4();
    let k = 0;
    sizes.forEach((c, l) => {
      for (let i = 0; i < c; i++) {
        const r = l === 0 || l === 3 ? 0.13 : Math.min(0.085, 0.75 / c + 0.03);
        m.makeScale(r, r, r).setPosition(X[l], layerY(c, i), Z);
        nodes!.setMatrixAt(k++, m);
      }
    });
    g.add(nodes);

    const nE = 2 * h + h * h + h;
    const pos = new Float32Array(nE * 6);
    let e = 0;
    const seg = (l: number, a: number, ca: number, b: number, cb: number) => {
      pos.set([X[l], layerY(ca, a), Z, X[l + 1], layerY(cb, b), Z], e * 6); e++;
    };
    for (let k2 = 0; k2 < h; k2++) for (let i = 0; i < 2; i++) seg(0, i, 2, k2, h);
    for (let j = 0; j < h; j++) for (let k2 = 0; k2 < h; k2++) seg(1, k2, h, j, h);
    for (let j = 0; j < h; j++) seg(2, j, h, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(nE * 6), 3).setUsage(THREE.DynamicDrawUsage));
    if (!edgeMat) {
      edgeMat = new THREE.ShaderMaterial({
        vertexShader: edgeVert, fragmentShader: edgeFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uVis: { value: 0 } },
      });
      f.add(edgeMat);
    }
    edges = new THREE.LineSegments(geo, edgeMat);
    g.add(edges);

    const lab = (lines: string[], x: number, y: number, size = 0.26) => {
      const s = label(lines.map((t, i) => ({ text: t, size: i ? 22 : 26, font: "mono" as const, color: i ? HEX.muted : HEX.text })), size * lines.length);
      s.position.set(x, y, Z);
      f.add(s.material);
      g.add(s); statics.push(s);
    };
    lab(["x₁", ], X[0] - 0.42, layerY(2, 0));
    lab(["x₂"], X[0] - 0.42, layerY(2, 1));
    lab(["p(B)"], X[3] + 0.55, YC);
    const head = label([
      { text: `THE NETWORK YOU JUST TRAINED`, size: 22, font: "mono", color: HEX.cream, weight: 600 },
      { text: `2 → ${h} → ${h} → 1  ·  tanh  ·  Adam  ·  ${w.trainer.model.paramCount} weights`, size: 22, font: "mono", color: HEX.muted, gap: 4 },
    ], 0.62);
    head.position.set(0, YC + Math.min(3.3, (h - 1) * 0.26) / 2 + 0.75, Z);
    f.add(head.material);
    g.add(head); statics.push(head);
    builtH = h;
    lastV = -1;
  };

  const tint = (wv: number, max: number, out: Float32Array, o: number, A: THREE.Color, B: THREE.Color) => {
    const a = Math.min(1, Math.abs(wv) / (max || 1));
    const k = Math.pow(a, 0.9) * 0.95 + 0.03;
    const c = wv >= 0 ? B : A;
    out[o] = c.r * k; out[o + 1] = c.g * k; out[o + 2] = c.b * k;
    out[o + 3] = c.r * k; out[o + 4] = c.g * k; out[o + 5] = c.b * k;
  };

  return {
    section: 1, group: g,
    update(t, vis) {
      const e = baseMoment(1, g, f, vis);
      if (!g.visible) return;
      const model = w.trainer.model;
      if (model.h !== builtH) build(model.h);
      edgeMat!.uniforms.uTime.value = t;
      g.scale.setScalar(0.94 + 0.06 * e);
      if (w.trainer.version === lastV || (lastV !== -1 && w.frameCount % 8)) return;
      lastV = w.trainer.version;
      const h = model.h;
      const ac = edges!.geometry.attributes.aCol as THREE.BufferAttribute;
      const out = ac.array as Float32Array;
      const maxOf = (a: Float64Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      const m1 = maxOf(model.W1), m2 = maxOf(model.W2), m3 = maxOf(model.W3);
      let k = 0;
      for (let q = 0; q < h; q++) for (let i = 0; i < 2; i++) tint(model.W1[q * 2 + i], m1, out, (k++) * 6, w.colA, w.colB);
      for (let j = 0; j < h; j++) for (let q = 0; q < h; q++) tint(model.W2[j * h + q], m2, out, (k++) * 6, w.colA, w.colB);
      for (let j = 0; j < h; j++) tint(model.W3[j], m3, out, (k++) * 6, w.colA, w.colB);
      ac.needsUpdate = true;
    },
  };
}

/* -------------------------------------------------------------- */
/* 2. Experience: the real loss curve, with career checkpoints     */
/* -------------------------------------------------------------- */
function lossMoment(w: World): Moment {
  const g = new THREE.Group();
  g.userData.y0 = 0;
  const f = new Fader();
  const Z = -3.0, X0 = -3.5, X1 = 3.5, Y0 = 0.35, Y1 = 3.7;
  const MAXP = 400;
  // axes and decade gridlines
  const axes: number[] = [X0, Y0, Z, X1, Y0, Z, X0, Y0, Z, X0, Y1, Z];
  for (let d = 0; d < 4; d++) { const y = Y0 + ((d + 0.5) / 4.2) * (Y1 - Y0); axes.push(X0, y, Z, X1, y, Z); }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute("position", new THREE.Float32BufferAttribute(axes, 3));
  const axisMat = f.add(new THREE.LineBasicMaterial({ color: col(HEX.paper) }), 0.22);
  g.add(new THREE.LineSegments(ag, axisMat));

  // ribbon + area fill
  const rib = new THREE.BufferGeometry();
  rib.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAXP * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const ridx: number[] = [];
  for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; ridx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  rib.setIndex(ridx);
  const ribMat = f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream), side: THREE.DoubleSide, depthWrite: false }), 1);
  const ribbon = new THREE.Mesh(rib, ribMat);
  ribbon.frustumCulled = false;
  g.add(ribbon);
  const area = new THREE.BufferGeometry();
  area.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAXP * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const aa = new Float32Array(MAXP * 2);
  for (let i = 0; i < MAXP; i++) { aa[i * 2] = 1; aa[i * 2 + 1] = 0; }
  area.setAttribute("aA", new THREE.BufferAttribute(aa, 1));
  area.setIndex(ridx);
  const areaMat = f.add(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uVis: { value: 0 }, uC: { value: w.colB } },
    vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uVis; uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC * vA * 0.14 * uVis, 1.0); }`,
  }));
  const areaMesh = new THREE.Mesh(area, areaMat);
  areaMesh.frustumCulled = false;
  g.add(areaMesh);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 2), f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream) })));
  g.add(head);

  const title = label([
    { text: "TRAINING LOG", size: 22, font: "mono", color: HEX.cream, weight: 600 },
    { text: "full-dataset loss, log scale, this session", size: 21, font: "mono", color: HEX.muted, gap: 4 },
  ], 0.6);
  title.position.set(X0 + 1.55, Y1 + 1.15, Z);
  f.add(title.material); g.add(title);

  // career checkpoints, oldest first, spaced along the run (any count; the most recent five)
  const ck = experience.slice(0, 5).reverse();
  const xs = ck.map((_, i) => X0 + (ck.length === 1 ? 0.5 : 0.12 + (i / (ck.length - 1)) * 0.76) * (X1 - X0));
  const short = (t: string) => (t.length > 26 ? `${t.slice(0, 25)}…` : t);
  const pins: number[] = [];
  ck.forEach((e, i) => {
    pins.push(xs[i], Y0, Z + 0.01, xs[i], Y1 - 0.05 + (i % 2) * 0.62, Z + 0.01);
    const s = label([
      { text: `ckpt ${i + 1}  ·  ${e.start}`, size: 22, font: "mono", color: HEX.cream, weight: 600 },
      { text: short(e.org), size: 22, font: "sans", color: HEX.soft, gap: 2 },
    ], 0.5, { bg: "rgba(18,16,13,0.86)", border: "rgba(239,232,219,0.18)", pad: 14 });
    s.position.set(xs[i], Y1 + 0.2 + (i % 2) * 0.62, Z + 0.05);
    f.add(s.material); g.add(s);
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute(pins, 3));
  g.add(new THREE.LineSegments(pg, f.add(new THREE.LineBasicMaterial({ color: col(HEX.ember) }), 0.45)));

  let lastLen = -1;
  let lastVer = -1;
  const lmin = Math.log10(1e-4), lmax = Math.log10(1.0);
  const yOf = (l: number) => Y0 + Math.min(1, Math.max(0, (Math.log10(Math.max(1e-4, l)) - lmin) / (lmax - lmin))) * (Y1 - Y0 - 0.2);

  return {
    section: 2, group: g,
    update(t, vis) {
      baseMoment(2, g, f, vis);
      if (!g.visible) return;
      (ribMat as THREE.MeshBasicMaterial).color.copy(w.colA).lerp(col(HEX.cream), 0.35);
      const hist = w.trainer.history;
      if (hist.length === lastLen && w.trainer.dataVersion === lastVer) { head.scale.setScalar(1 + Math.sin(t * 4) * 0.25); return; }
      lastLen = hist.length; lastVer = w.trainer.dataVersion;
      const n = Math.min(MAXP, hist.length);
      const stride = hist.length / Math.max(1, n);
      const rp = rib.attributes.position.array as Float32Array;
      const ap = area.attributes.position.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const l = hist[Math.min(hist.length - 1, Math.floor(i * stride))];
        const x = X0 + (n > 1 ? i / (n - 1) : 0) * (X1 - X0);
        const y = yOf(l);
        rp.set([x, y + 0.028, Z + 0.02, x, y - 0.028, Z + 0.02], i * 6);
        ap.set([x, y, Z, x, Y0, Z], i * 6);
      }
      rib.setDrawRange(0, Math.max(0, (n - 1) * 6));
      area.setDrawRange(0, Math.max(0, (n - 1) * 6));
      rib.attributes.position.needsUpdate = true;
      area.attributes.position.needsUpdate = true;
      if (n) head.position.set(X1, yOf(hist[hist.length - 1]), Z + 0.03);
    },
  };
}

/* -------------------------------------------------------------- */
/* 3. Flagship: featured.parts as a computation graph              */
/* -------------------------------------------------------------- */
function agentsMoment(w: World): Moment {
  const g = new THREE.Group();
  g.userData.y0 = 2.7;
  const f = new Fader();
  const names = featured.parts.slice(0, 6).map((p) => (p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name));
  const R = 2.7;
  const pts = names.map((_, i) => {
    const a = names.length === 1 ? 0 : -Math.PI * 0.78 + (i / (names.length - 1)) * Math.PI * 1.56;
    return new THREE.Vector3(Math.sin(a) * R, Math.cos(i * 1.7) * 0.35, -Math.cos(a) * R * 0.75 - 0.4);
  });
  const core = new THREE.Vector3(0, -0.2, -0.2);
  const nodeMats: THREE.MeshBasicMaterial[] = [];
  const nodes = pts.map((p, i) => {
    const n = new THREE.Group();
    n.position.copy(p);
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream), wireframe: true }), 0.55));
    const m = f.add(new THREE.MeshBasicMaterial({ color: i % 2 ? w.colB.clone() : w.colA.clone() }));
    nodeMats.push(m);
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), m);
    n.add(shell, inner);
    const s = label([
      { text: String(i + 1).padStart(2, "0"), size: 22, font: "mono", color: HEX.muted },
      { text: names[i], size: 30, font: "sans", color: HEX.text, weight: 600 },
    ], 0.6, { align: "center" });
    s.position.set(0, 0.85, 0);
    f.add(s.material);
    n.add(s);
    g.add(n);
    return { n, shell, inner };
  });
  const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream) }), 0.9));
  coreMesh.position.copy(core);
  g.add(coreMesh);
  const coreLab = label([{ text: featured.hub, size: 26, font: "mono", color: HEX.cream }], 0.3, { align: "center" });
  coreLab.position.copy(core).add(new THREE.Vector3(0, -0.55, 0));
  f.add(coreLab.material); g.add(coreLab);

  const curves: THREE.QuadraticBezierCurve3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const mid = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
    mid.y += 0.9;
    curves.push(new THREE.QuadraticBezierCurve3(pts[i], mid, pts[i + 1]));
  }
  const tubeMat = f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream) }), 0.5);
  curves.forEach((c) => g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.018, 6), tubeMat)));
  // dashed spokes from every agent into the RAG layer
  const spoke: number[] = [];
  pts.forEach((p) => {
    for (let s = 0; s < 10; s += 2) {
      const a = p.clone().lerp(core, s / 10), b = p.clone().lerp(core, (s + 1) / 10);
      spoke.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(spoke, 3));
  g.add(new THREE.LineSegments(sg, f.add(new THREE.LineBasicMaterial({ color: col(HEX.paper) }), 0.25)));

  const packetMat = f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream) }));
  const packet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 2), packetMat);
  g.add(packet);
  const title = label([
    { text: `${featured.title.toUpperCase()} · ${featured.graphLabel.toUpperCase()}`, size: 22, font: "mono", color: HEX.cream, weight: 600 },
  ], 0.3, { align: "center" });
  title.position.set(0, 2.25, -1.4);
  f.add(title.material); g.add(title);

  return {
    section: 3, group: g,
    update(t, vis) {
      const e = baseMoment(3, g, f, vis, 1.2);
      if (!g.visible) return;
      g.scale.setScalar(0.9 + 0.1 * e);
      // one packet walks the pipeline, part to part
      if (!curves.length) return;
      const cyc = (t * 0.32) % 1;
      const seg = Math.min(curves.length - 1, Math.floor(cyc * (curves.length + 0.6)));
      const u = Math.min(1, cyc * (curves.length + 0.6) - seg);
      packet.position.copy(curves[seg].getPoint(u));
      packet.visible = cyc * (curves.length + 0.6) < curves.length;
      nodes.forEach((nd, i) => {
        const near = i === seg && u < 0.2 ? 1 - u / 0.2 : i === seg + 1 && u > 0.8 ? (u - 0.8) / 0.2 : 0;
        nd.inner.scale.setScalar(1 + near * 0.6 + Math.sin(t * 2 + i) * 0.05);
        nd.shell.rotation.y = t * 0.3 + i;
        nd.shell.rotation.x = t * 0.17;
        nodeMats[i].color.copy(i % 2 ? w.colB : w.colA);
      });
      coreMesh.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      g.rotation.y = Math.sin(t * 0.2) * 0.08;
    },
  };
}

/* -------------------------------------------------------------- */
/* 4. Projects: a live confusion matrix of the model                */
/* -------------------------------------------------------------- */
function confusionMoment(w: World): Moment {
  const g = new THREE.Group();
  g.userData.y0 = 1.2;
  const f = new Fader();
  const Z = -3.1, T = 1.25, gap = 0.16;
  const cells: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; edge: THREE.LineSegments; lab?: THREE.Sprite; key: "tn" | "fp" | "fn" | "tp"; r: number; c: number }[] = [];
  const keys: ["tn" | "fp" | "fn" | "tp", number, number][] = [["tn", 0, 0], ["fp", 0, 1], ["fn", 1, 0], ["tp", 1, 1]];
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0, 0.5);
  const edgesGeo = new THREE.EdgesGeometry(box);
  const edgeMat = f.add(new THREE.LineBasicMaterial({ color: col(HEX.cream) }), 0.5);
  keys.forEach(([key, r, c]) => {
    const mat = f.add(new THREE.MeshBasicMaterial({ color: col(HEX.mid) }), 0.92);
    const mesh = new THREE.Mesh(box, mat);
    const edge = new THREE.LineSegments(edgesGeo, edgeMat);
    const x = (c - 0.5) * (T + gap), y = (0.5 - r) * (T + gap);
    mesh.position.set(x, y, Z); edge.position.set(x, y, Z);
    mesh.scale.set(T, T, 0.05); edge.scale.copy(mesh.scale);
    g.add(mesh, edge);
    cells.push({ mesh, mat, edge, key, r, c });
  });
  const axis = (text: string, x: number, y: number, rot = 0) => {
    const s = label([{ text, size: 24, font: "mono", color: HEX.muted }], 0.26, { align: "center" });
    s.position.set(x, y, Z);
    s.material.rotation = rot;
    f.add(s.material); g.add(s);
  };
  axis("pred A", -(T + gap) / 2, T + 0.42);
  axis("pred B", (T + gap) / 2, T + 0.42);
  axis("true A", -T - 0.62, (T + gap) / 2, 0);
  axis("true B", -T - 0.62, -(T + gap) / 2, 0);
  let title: THREE.Sprite | null = null;
  let sig = "";

  const redraw = () => {
    const s = w.trainer.stats;
    const next = `${s.tn}|${s.fp}|${s.fn}|${s.tp}|${s.n}`;
    if (next === sig) return;
    sig = next;
    cells.forEach((cell) => {
      const v = s[cell.key];
      const correct = cell.key === "tn" || cell.key === "tp";
      if (cell.lab) { g.remove(cell.lab); cell.lab.material.map?.dispose(); cell.lab.material.dispose(); }
      const lab = label([
        { text: String(v), size: 64, font: "serif", color: correct ? HEX.ink : HEX.text },
        { text: cell.key.toUpperCase(), size: 20, font: "mono", color: correct ? "rgba(28,24,20,0.7)" : HEX.muted },
      ], 0.62, { align: "center", pad: 6 });
      lab.material.depthTest = false;
      lab.renderOrder = 5;
      f.add(lab.material);
      cell.lab = lab;
      g.add(lab);
      const d = s.n ? v / s.n : 0;
      cell.mesh.scale.z = 0.05 + d * 2.4;
      cell.edge.scale.z = cell.mesh.scale.z;
      lab.position.set(cell.mesh.position.x, cell.mesh.position.y, Z + cell.mesh.scale.z + 0.03);
    });
    if (title) { g.remove(title); title.material.map?.dispose(); title.material.dispose(); }
    title = label([
      { text: "LIVE EVALUATION", size: 22, font: "mono", color: HEX.cream, weight: 600 },
      { text: `accuracy ${(s.acc * 100).toFixed(1)}%  ·  n = ${s.n}`, size: 22, font: "mono", color: HEX.muted, gap: 4 },
    ], 0.56, { align: "center" });
    title.position.set(0, T + 1.05, Z);
    f.add(title.material);
    g.add(title);
    f.set(1);
  };

  return {
    section: 4, group: g,
    update(t, vis) {
      const e = baseMoment(4, g, f, vis);
      if (!g.visible) return;
      if (w.frameCount % 10 === 0 || !sig) redraw();
      cells.forEach((c) => {
        const correct = c.key === "tn" || c.key === "tp";
        c.mat.color.copy(correct ? (c.key === "tn" ? w.colA : w.colB) : col(HEX.mid));
      });
      g.rotation.y = -0.35 + Math.sin(t * 0.25) * 0.05;
      g.scale.setScalar(0.92 + 0.08 * e);
    },
  };
}

/* -------------------------------------------------------------- */
/* 5. Research: the papers and talks standing behind the surface     */
/* -------------------------------------------------------------- */
function paperTexture(p: (typeof publications)[number], i: number) {
  const c = document.createElement("canvas");
  c.width = 520; c.height = 700;
  const x = c.getContext("2d")!;
  x.fillStyle = HEX.paper;
  x.fillRect(0, 0, c.width, c.height);
  // faint ruling
  x.strokeStyle = "rgba(28,24,20,0.06)";
  for (let y = 120; y < 700; y += 28) { x.beginPath(); x.moveTo(36, y); x.lineTo(484, y); x.stroke(); }
  x.fillStyle = p.award ? HEX.emberDeep : HEX.tealDeep;
  x.font = `600 24px ${FONTS.mono}`;
  let venue = `[${i + 1}]  ${p.venue}`;
  while (venue.length > 6 && x.measureText(venue).width > 370) venue = `${venue.slice(0, -2)}…`;
  x.fillText(venue, 40, 66);
  x.fillStyle = "rgba(28,24,20,0.55)";
  x.font = `500 22px ${FONTS.mono}`;
  x.textAlign = "right";
  x.fillText(p.year, 480, 66);
  x.textAlign = "left";
  x.fillStyle = HEX.ink;
  x.font = `400 44px ${FONTS.serif}`;
  let y = 140;
  for (const l of wrap(x, p.title, 440).slice(0, 5)) { x.fillText(l, 40, y); y += 50; }
  x.font = `500 22px ${FONTS.sans}`;
  x.fillStyle = "rgba(28,24,20,0.7)";
  y += 18;
  const limit = p.award ? 585 : 680;
  for (const l of [...wrap(x, p.publisher, 440).slice(0, 3), ...wrap(x, p.where, 440).slice(0, 2)]) {
    if (y > limit) break;
    x.fillText(l, 40, y); y += 30;
  }
  if (p.award) {
    const aw = p.award.length > 22 ? `${p.award.slice(0, 21)}…` : p.award;
    x.font = `600 24px ${FONTS.sans}`;
    const bw = Math.min(440, x.measureText(aw).width + 52);
    x.fillStyle = HEX.emberDeep;
    roundRect(x, 40, 600, bw, 54, 27); x.fill();
    x.fillStyle = "#fff4e6";
    x.fillText(aw, 66, 636);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function papersMoment(): Moment {
  const g = new THREE.Group();
  g.userData.y0 = 1.45;
  const f = new Fader();
  const slabs: THREE.Mesh[] = [];
  const back = f.add(new THREE.MeshBasicMaterial({ color: col("#1b1814") }));
  const list = publications.slice(0, 6);
  const n = list.length;
  const step = n <= 4 ? 1.72 : 1.72 * 4 / n;
  const sc = n <= 4 ? 1 : step / 1.72;
  list.forEach((p, i) => {
    const front = f.add(new THREE.MeshBasicMaterial({ map: paperTexture(p, i) }));
    const geo = new THREE.BoxGeometry(1.4, 1.88, 0.035);
    const mesh = new THREE.Mesh(geo, [back, back, back, back, front, back]);
    const x = (i - (n - 1) / 2) * step;
    mesh.position.set(x, 0, -3.0 + Math.abs(x) * 0.22);
    mesh.rotation.y = -x * 0.09;
    mesh.scale.setScalar(sc);
    g.add(mesh);
    slabs.push(mesh);
    if (p.award) {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 2.2), f.add(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uVis: { value: 0 }, uC: { value: col(HEX.gold) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uVis; uniform vec3 uC; varying vec2 vUv;
          void main(){ vec2 q = abs(vUv - 0.5) * 2.0; float d = max(q.x, q.y); float a = smoothstep(1.0, 0.82, d) * smoothstep(0.7, 0.86, d);
          gl_FragColor = vec4(uC * a * 0.9 * uVis, 1.0); }`,
      })));
      glow.position.z = -0.03;
      mesh.add(glow);
    }
  });
  const talks = list.filter((p) => p.kind === "Talk").length;
  const papers = n - talks;
  const count = [papers && `${papers} PAPER${papers > 1 ? "S" : ""}`, talks && `${talks} TALK${talks > 1 ? "S" : ""}`].filter(Boolean).join(" · ");
  const title = label([{ text: `PUBLISHED · ${count}`, size: 22, font: "mono", color: HEX.cream, weight: 600 }], 0.3, { align: "center" });
  title.position.set(0, 1.55, -2.6);
  f.add(title.material); g.add(title);

  return {
    section: 5, group: g,
    update(t, vis) {
      const e = baseMoment(5, g, f, vis, 1.0);
      if (!g.visible) return;
      slabs.forEach((s, i) => {
        s.position.y = Math.sin(t * 0.8 + i * 1.3) * 0.06 - (1 - e) * (0.4 + i * 0.25);
      });
    },
  };
}

/* -------------------------------------------------------------- */
/* 6. Toolkit: what each unit in hidden layer 2 has learned          */
/* -------------------------------------------------------------- */
function featuresMoment(w: World): Moment {
  const g = new THREE.Group();
  g.userData.y0 = 2.05;
  const f = new Fader();
  const R = 28;
  const MAX = 16;
  const tiles: { mesh: THREE.Mesh; tex: THREE.DataTexture; data: Uint8Array }[] = [];
  const holder = new THREE.Group();
  holder.position.set(0, 0, -1.9);
  holder.rotation.x = -0.12;
  g.add(holder);
  const frameMat = f.add(new THREE.LineBasicMaterial({ color: col(HEX.paper) }), 0.3);
  for (let i = 0; i < MAX; i++) {
    const data = new Uint8Array(R * R * 4);
    const tex = new THREE.DataTexture(data, R, R);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const mat = f.add(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
    const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.92, 0.92)), frameMat);
    mesh.add(fr);
    holder.add(mesh);
    tiles.push({ mesh, tex, data });
  }
  const title = label([
    { text: "WHAT THE HIDDEN UNITS LEARNED", size: 22, font: "mono", color: HEX.cream, weight: 600 },
    { text: "layer 2 activation over the input plane", size: 21, font: "mono", color: HEX.muted, gap: 4 },
  ], 0.56, { align: "center" });
  g.add(title);
  f.add(title.material);
  let lastV = -1, lastH = -1;
  const ca = new THREE.Color(), cb = new THREE.Color(), dark = col("#15120f");

  const layout = (count: number) => {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const step = 1.04;
    tiles.forEach((t, i) => {
      t.mesh.visible = i < count;
      const c = i % cols, r = Math.floor(i / cols);
      t.mesh.position.set((c - (cols - 1) / 2) * step, ((rows - 1) / 2 - r) * step, 0);
    });
    title.position.set(0, (rows / 2) * step + 0.5, -1.9);
  };

  return {
    section: 6, group: g,
    update(t, vis) {
      const e = baseMoment(6, g, f, vis);
      if (!g.visible) return;
      g.scale.setScalar(0.92 + 0.08 * e);
      holder.rotation.y = Math.sin(t * 0.3) * 0.08;
      const model = w.trainer.model;
      const count = Math.min(MAX, model.h);
      if (model.h !== lastH) { layout(count); lastH = model.h; lastV = -1; }
      tiles.forEach((tl, i) => { tl.mesh.position.z = Math.sin(t * 0.9 + i * 0.7) * 0.05; });
      if (w.trainer.version === lastV || (lastV !== -1 && w.frameCount % 12)) return;
      lastV = w.trainer.version;
      // the colours are taken in sRGB for the byte texture
      ca.copy(w.colA).convertLinearToSRGB(); cb.copy(w.colB).convertLinearToSRGB();
      const d0 = dark.clone().convertLinearToSRGB();
      const acts = model.activations(2);
      for (let j = 0; j < R; j++) {
        const y = 1 - (2 * j) / (R - 1);
        for (let i = 0; i < R; i++) {
          const x = -1 + (2 * i) / (R - 1);
          model.forward(x, y);
          for (let q = 0; q < count; q++) {
            const a = acts[q];
            const c = a >= 0 ? cb : ca;
            const k = Math.min(1, Math.abs(a));
            const o = (j * R + i) * 4;
            const d = tiles[q].data;
            d[o] = (d0.r + (c.r - d0.r) * k) * 255;
            d[o + 1] = (d0.g + (c.g - d0.g) * k) * 255;
            d[o + 2] = (d0.b + (c.b - d0.b) * k) * 255;
            d[o + 3] = 255;
          }
        }
      }
      for (let q = 0; q < count; q++) tiles[q].tex.needsUpdate = true;
    },
  };
}

/* -------------------------------------------------------------- */
/* 7. Contact: the run settles, rings of light around the model     */
/* -------------------------------------------------------------- */
function haloMoment(w: World): Moment {
  const g = new THREE.Group();
  g.userData.y0 = -0.8;
  const f = new Fader();
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(S * 1.55, 0.02, 6, 160), f.add(new THREE.MeshBasicMaterial({ color: w.colA })));
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(S * 1.72, 0.014, 6, 160), f.add(new THREE.MeshBasicMaterial({ color: w.colB })));
  const ringC = new THREE.Mesh(new THREE.TorusGeometry(S * 1.9, 0.01, 6, 160), f.add(new THREE.MeshBasicMaterial({ color: col(HEX.cream) }), 0.5));
  [ringA, ringB, ringC].forEach((r) => { r.rotation.x = Math.PI / 2; g.add(r); });
  // tick marks like a dial
  const ticks: number[] = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2, r0 = S * 1.93, r1 = r0 + (i % 10 === 0 ? 0.35 : 0.14);
    ticks.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
  const tick = new THREE.LineSegments(tg, f.add(new THREE.LineBasicMaterial({ color: col(HEX.paper) }), 0.35));
  g.add(tick);
  return {
    section: 7, group: g,
    update(t, vis) {
      const e = baseMoment(7, g, f, vis, 1.5);
      if (!g.visible) return;
      ringA.rotation.z = t * 0.12; ringB.rotation.z = -t * 0.08;
      tick.rotation.y = t * 0.03;
      g.scale.setScalar(0.85 + 0.15 * e);
      (ringA.material as THREE.MeshBasicMaterial).color.copy(w.colA);
      (ringB.material as THREE.MeshBasicMaterial).color.copy(w.colB);
    },
  };
}

export function buildMoments(w: World): Moment[] {
  const list = [networkMoment(w), lossMoment(w), agentsMoment(w), confusionMoment(w), papersMoment(), featuresMoment(w), haloMoment(w)];
  list.forEach((m) => { m.group.visible = false; m.group.position.y = m.group.userData.y0 ?? 0; });
  void textTexture;
  return list;
}
