import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GridEval } from "../ml/grid";
import { CAPACITY, type Trainer } from "../ml/trainer";
import { HEX, SECTION_COLORS, col } from "./palette";
import { buildMoments, type Moment } from "./moments";
import { run } from "../ml/run";

/** Half-size of the surface in world units, and model-space extent it covers. */
export const S = 5;
export const EXT = 1.08;
/** Height between the two class plateaus. */
export const H = 1.9;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camera framing per section: orbit target, azimuth, elevation, distance and screen shift. */
type Key = { t: [number, number, number]; az: number; el: number; dist: number; shift: number; shiftY: number };
const KEYS: Key[] = [
  { t: [0, -0.3, 0.2], az: 0.62, el: 0.68, dist: 21, shift: 0.17, shiftY: 0.08 }, // top
  { t: [0, 1.7, -1.8], az: -0.16, el: 0.27, dist: 22, shift: 0.27, shiftY: 0 }, // about
  { t: [0, 1.4, -2.2], az: 0.26, el: 0.25, dist: 23, shift: -0.3, shiftY: 0 }, // experience
  { t: [0, 1.9, -0.4], az: 1.0, el: 0.42, dist: 22, shift: 0.27, shiftY: 0 }, // flagship
  { t: [0, 0.8, -1], az: -0.55, el: 0.55, dist: 22, shift: 0.28, shiftY: 0 }, // projects
  { t: [0, 1.3, -2], az: 0.1, el: 0.24, dist: 23, shift: -0.3, shiftY: 0 }, // research
  { t: [0, 2.0, -1.4], az: -0.3, el: 0.34, dist: 20.5, shift: 0.27, shiftY: 0 }, // toolkit
  { t: [0, -0.4, 0], az: 0.9, el: 0.9, dist: 40, shift: 0, shiftY: -0.41 }, // contact
];

export type Stop = { p: number; k: number };

/* ------------------------------------------------------------------ */
/* shaders                                                             */
/* ------------------------------------------------------------------ */
const surfVert = /* glsl */ `
  attribute float aP;
  varying float vP;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vP = aP;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const surfFrag = /* glsl */ `
  uniform vec3 uA, uB, uMid, uLine, uGlow, uHoverCol;
  uniform vec4 uHover;   // x, z, strength, radius
  uniform float uReveal, uTime, uBoundary, uDim;
  varying float vP;
  varying vec3 vW;
  varying vec3 vN;
  float aaLine(float v, float w) {
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
    return 1.0 - min(d / w, 1.0);
  }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float conf = clamp(abs(vP - 0.5) * 2.0, 0.0, 1.0);
    vec3 cls = vP < 0.5 ? uA : uB;
    vec3 base = mix(uMid, cls, pow(conf, 0.75) * 0.92);
    vec3 L = normalize(vec3(-0.45, 0.85, 0.4));
    float diff = max(dot(n, L), 0.0);
    float steep = 1.0 - n.y;
    vec3 col = base * (0.30 + 0.62 * diff) * (1.0 - steep * 0.35);

    // graph paper ruled into the surface
    float g = max(aaLine(vW.x / 0.5, 0.55), aaLine(vW.z / 0.5, 0.55));
    float G = max(aaLine(vW.x / 2.5, 0.9), aaLine(vW.z / 2.5, 0.9));
    col = mix(col, uLine, g * 0.07 + G * 0.13);

    // iso-probability contours every 0.1
    float iso = aaLine(vP * 10.0, 0.7);
    col = mix(col, uLine, iso * 0.16 * (1.0 - conf * 0.4));

    // the decision boundary, p = 0.5
    float bd = abs(vP - 0.5) / max(fwidth(vP), 1e-4);
    float core = 1.0 - smoothstep(0.0, 1.4, bd);
    float halo = 1.0 - smoothstep(0.0, 9.0, bd);
    col += uGlow * (core * 1.05 + halo * 0.16) * uBoundary;

    // pointer brush
    float dh = distance(vW.xz, uHover.xy);
    float ring = 1.0 - smoothstep(0.0, 0.035, abs(dh - uHover.w));
    float fill = (1.0 - smoothstep(0.0, uHover.w, dh)) * 0.18;
    col = mix(col, uHoverCol * 1.25, (ring * 0.9 + fill) * uHover.z);

    // radial reveal during the intro, with a bright scan front
    float r = length(vW.xz) / 7.2;
    float front = uReveal * 1.25;
    float shown = smoothstep(front, front - 0.12, r);
    float scan = exp(-pow((r - front + 0.04) * 34.0, 2.0)) * step(uReveal, 0.999);
    if (shown < 0.01 && scan < 0.01) discard;
    col = col * shown + uGlow * scan * 0.22;
    gl_FragColor = vec4(col * uDim, 1.0);
    #include <colorspace_fragment>
  }
`;

const skirtVert = /* glsl */ `
  attribute float aP;
  attribute float aTop;
  varying float vP;
  varying float vTop;
  varying vec3 vN;
  void main() {
    vP = aP; vTop = aTop; vN = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skirtFrag = /* glsl */ `
  uniform vec3 uA, uB, uMid, uDark;
  uniform float uReveal, uDim;
  varying float vP;
  varying float vTop;
  varying vec3 vN;
  void main() {
    if (uReveal < 0.98) discard;
    vec3 cls = vP < 0.5 ? uA : uB;
    float conf = clamp(abs(vP - 0.5) * 2.0, 0.0, 1.0);
    vec3 top = mix(uMid, cls, conf) * 0.55;
    float shade = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vec3(-0.6, 0.0, 0.8))));
    vec3 col = mix(uDark, top, pow(vTop, 2.2)) * shade;
    col += cls * smoothstep(0.92, 1.0, vTop) * 0.35;
    gl_FragColor = vec4(col * uDim, 1.0);
    #include <colorspace_fragment>
  }
`;

const pointVert = /* glsl */ `
  attribute float aWrong;
  varying vec3 vC;
  varying vec3 vN;
  varying float vWrong;
  void main() {
    vC = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor;
    #endif
    vWrong = aWrong;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const pointFrag = /* glsl */ `
  uniform float uTime, uVis;
  uniform vec3 uCream;
  varying vec3 vC;
  varying vec3 vN;
  varying float vWrong;
  void main() {
    vec3 n = normalize(vN);
    float d = max(dot(n, normalize(vec3(-0.4, 0.9, 0.5))), 0.0);
    vec3 c = vC * (0.55 + 0.75 * d) + vec3(1.0) * pow(d, 18.0) * 0.6;
    float blink = 0.5 + 0.5 * sin(uTime * 7.0);
    c = mix(c, uCream, vWrong * blink * 0.5);
    gl_FragColor = vec4(c * uVis, 1.0);
    #include <colorspace_fragment>
  }
`;

const groundVert = /* glsl */ `
  varying vec3 vW;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const groundFrag = /* glsl */ `
  uniform vec3 uBg, uLine, uGlowA, uGlowB;
  uniform float uReveal;
  varying vec3 vW;
  float aaLine(float v, float w) {
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
    return 1.0 - min(d / w, 1.0);
  }
  void main() {
    float r = length(vW.xz);
    float fade = 1.0 - smoothstep(6.0, 30.0, r);
    float g = max(aaLine(vW.x / 1.0, 0.5), aaLine(vW.z / 1.0, 0.5));
    float rings = aaLine(r / 2.5, 0.7) * smoothstep(5.6, 7.0, r);
    vec3 col = uBg;
    col += uLine * (g * 0.05 + rings * 0.09) * fade * uReveal;
    // soft shadow under the slab
    vec2 q = abs(vW.xz) - vec2(5.0);
    float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    col *= 1.0 - (1.0 - smoothstep(-1.0, 2.2, box)) * 0.6;
    // warm and cool light pooling from the two classes
    col += uGlowA * 0.05 * (1.0 - smoothstep(0.0, 16.0, distance(vW.xz, vec2(-9.0, 5.0)))) * uReveal;
    col += uGlowB * 0.05 * (1.0 - smoothstep(0.0, 16.0, distance(vW.xz, vec2(9.0, -6.0)))) * uReveal;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */

export type WorldOpts = { mobile: boolean; reduce: boolean };

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  readonly n: number;
  private grid: GridEval;
  private gridVersion = -1;
  private gridDirty = true;
  private passVersion = -1;
  private hs: Float32Array;   // smoothed heights
  private ps: Float32Array;   // smoothed probabilities
  private surf!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private skirt!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private skirtIdx: number[] = [];
  private ground!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private points!: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>;
  private wrongAttr!: THREE.InstancedBufferAttribute;
  private spawn = new Float32Array(CAPACITY).fill(-100);
  private lastDataVersion = -1;
  private lastN = 0;
  private lastDataset = "";
  private pred = new Float32Array(CAPACITY);
  private predVersion = -1;
  private motes!: THREE.Points;
  readonly colA = col(HEX.ember);
  readonly colB = col(HEX.teal);
  private moments: Moment[] = [];
  private stops: Stop[] = [{ p: 0, k: 0 }, { p: 1, k: 7 }];
  private weights = new Float32Array(8);
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private camSnap = true;

  private t0 = performance.now();
  private lastT = 0;
  private dt = 1 / 60;
  private raf = 0;
  private running = false;
  private target = 0;
  progress = 0;
  private intro = 0;
  private reveal = 0;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private pointerMoved = false;
  private hover = new THREE.Vector4(0, 0, 0, 0.32);
  private hoverOn = false;
  private hoverAmt = 0;
  brush: 0 | 1 = 0;
  training = false;
  private ray = new THREE.Raycaster();
  private slowFrames = 0;
  private quality = 2; // 2 full, 1 no bloom, 0 lowest
  private frameNo = 0;
  private stepAcc = 0;
  /** EMA of JS time spent per frame excluding the GPU submit (ms) */
  logicMs = 0;
  renderMs = 0;

  onDegrade?: (level: number) => void;
  onHover?: (over: boolean) => void;

  constructor(canvas: HTMLCanvasElement, readonly trainer: Trainer, private opts: WorldOpts) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.mobile, powerPreference: "high-performance", alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.mobile ? 1.25 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(HEX.bg);
    this.scene.background = new THREE.Color(HEX.bg);
    this.camera = new THREE.PerspectiveCamera(opts.mobile ? 46 : 38, window.innerWidth / window.innerHeight, 0.1, 400);

    this.n = opts.mobile ? 36 : 52;
    this.grid = new GridEval(this.n, EXT);
    this.hs = new Float32Array(this.n * this.n);
    this.ps = new Float32Array(this.n * this.n).fill(0.5);

    this.buildGround();
    this.buildSurface();
    this.buildPoints();
    this.buildMotes();
    this.moments = buildMoments(this);
    for (const m of this.moments) this.scene.add(m.group);

    if (!opts.mobile) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.4, 0.45, 0.86);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    this.placeCamera(true);
  }

  /* ---------------- build ---------------- */
  private buildGround() {
    const g = new THREE.PlaneGeometry(400, 400, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: groundVert, fragmentShader: groundFrag,
      uniforms: {
        uBg: { value: col(HEX.bg) }, uLine: { value: col(HEX.paper) },
        uGlowA: { value: this.colA }, uGlowB: { value: this.colB }, uReveal: { value: 0 },
      },
    }));
    this.ground.position.y = -H / 2 - 0.7;
    this.scene.add(this.ground);
  }

  private buildSurface() {
    const n = this.n;
    const pos = new Float32Array(n * n * 3);
    const step = (2 * S) / (n - 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = (j * n + i) * 3;
      pos[v] = -S + i * step; pos[v + 1] = 0; pos[v + 2] = S - j * step;
    }
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const nor = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) nor[i * 3 + 1] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aP", new THREE.BufferAttribute(new Float32Array(n * n).fill(0.5), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), S * 1.5);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-S, -H, -S), new THREE.Vector3(S, H, S));

    const mat = new THREE.ShaderMaterial({
      vertexShader: surfVert, fragmentShader: surfFrag, side: THREE.DoubleSide,
      uniforms: {
        uA: { value: this.colA }, uB: { value: this.colB }, uMid: { value: col(HEX.mid) },
        uLine: { value: col(HEX.paper) }, uGlow: { value: col(HEX.cream) }, uHoverCol: { value: this.colA.clone() },
        uHover: { value: this.hover }, uReveal: { value: 0 }, uTime: { value: 0 }, uBoundary: { value: 1 }, uDim: { value: 1 },
      },
      extensions: { derivatives: true } as unknown as THREE.ShaderMaterial["extensions"],
    });
    this.surf = new THREE.Mesh(g, mat);
    this.scene.add(this.surf);

    // skirt: four walls from the surface edge down to a base, so it reads as a solid model
    const edge: number[] = [];
    for (let i = 0; i < n; i++) edge.push(i);                       // near edge (j = 0)
    for (let j = 1; j < n; j++) edge.push(j * n + n - 1);           // right edge
    for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);    // far edge
    for (let j = n - 2; j > 0; j--) edge.push(j * n);               // left edge
    edge.push(0);
    this.skirtIdx = edge;
    const m = edge.length;
    const sp = new Float32Array(m * 2 * 3);
    const sn = new Float32Array(m * 2 * 3);
    const top = new Float32Array(m * 2);
    const sP = new Float32Array(m * 2).fill(0.5);
    const base = -H / 2 - 0.25;
    for (let e = 0; e < m; e++) {
      const v = edge[e];
      const x = pos[v * 3], z = pos[v * 3 + 2];
      sp.set([x, 0, z], e * 6); sp.set([x, base, z], e * 6 + 3);
      // outward normal from the slab centre
      const nx = Math.abs(x) >= S - 1e-3 ? Math.sign(x) : 0, nz = Math.abs(z) >= S - 1e-3 ? Math.sign(z) : 0;
      sn.set([nx, 0, nz], e * 6); sn.set([nx, 0, nz], e * 6 + 3);
      top[e * 2] = 1; top[e * 2 + 1] = 0;
    }
    const sidx: number[] = [];
    for (let e = 0; e < m - 1; e++) {
      const a = e * 2, b = a + 1, c = a + 2, d = a + 3;
      sidx.push(a, b, c, b, d, c);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute("normal", new THREE.BufferAttribute(sn, 3));
    sg.setAttribute("aTop", new THREE.BufferAttribute(top, 1));
    sg.setAttribute("aP", new THREE.BufferAttribute(sP, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setIndex(sidx);
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), S * 1.5);
    this.skirt = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      vertexShader: skirtVert, fragmentShader: skirtFrag, side: THREE.DoubleSide,
      uniforms: { uA: { value: this.colA }, uB: { value: this.colB }, uMid: { value: col(HEX.mid) }, uDark: { value: col("#0d0b09") }, uReveal: { value: 0 }, uDim: { value: 1 } },
    }));
    this.scene.add(this.skirt);
  }

  private buildPoints() {
    const geo = new THREE.IcosahedronGeometry(1, this.opts.mobile ? 1 : 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: pointVert, fragmentShader: pointFrag,
      uniforms: { uTime: { value: 0 }, uVis: { value: 1 }, uCream: { value: col(HEX.cream) } },
    });
    this.points = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.points.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.points.setColorAt(0, new THREE.Color());
    this.wrongAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    this.wrongAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aWrong", this.wrongAttr);
    this.points.count = 0;
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private buildMotes() {
    const n = this.opts.mobile ? 160 : 360;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 6 + Math.random() * 18, a = Math.random() * Math.PI * 2;
      p.set([Math.cos(a) * r, -1 + Math.random() * 9, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({
      color: col(HEX.cream), size: this.opts.mobile ? 0.045 : 0.035, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.motes);
  }

  /* ---------------- inputs ---------------- */
  setStops(stops: Stop[]) { this.stops = stops; }
  setProgress(p: number) { this.target = Math.min(1, Math.max(0, p)); }
  setIntro(v: number) { this.intro = v; }
  setTraining(on: boolean) { this.training = on; }
  setPointer(x: number, y: number) { this.pointer.set(x, y); this.pointerMoved = true; }
  setBrush(c: 0 | 1) { this.brush = c; }
  /** Fraction of the camera path that belongs to the hero (where the surface is interactive). */
  get inHero() { return this.weights[0] > 0.6; }

  /** Ray-cast the pointer onto the surface; returns model-space (x, y) or null. */
  pick(x: number, y: number): [number, number] | null {
    this.ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = this.ray.intersectObject(this.surf, false)[0];
    if (!hit) return null;
    const u = (hit.point.x / S) * EXT, v = (-hit.point.z / S) * EXT;
    if (Math.abs(u) > 1 || Math.abs(v) > 1) return null;
    return [u, v];
  }

  /* ---------------- camera ---------------- */
  private sectionBlend() {
    const p = this.progress, st = this.stops;
    this.weights.fill(0);
    if (p <= st[0].p) { this.weights[st[0].k] = 1; return; }
    for (let i = 1; i < st.length; i++) {
      if (p <= st[i].p || i === st.length - 1) {
        const a = st[i - 1], b = st[i];
        const f = b.p > a.p ? Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))) : 1;
        const e = f * f * (3 - 2 * f);
        this.weights[a.k] += 1 - e;
        this.weights[b.k] += e;
        return;
      }
    }
  }

  private placeCamera(snap = false) {
    const w = this.weights;
    let az = 0, el = 0, dist = 0, sh = 0, shy = 0, tx = 0, ty = 0, tz = 0;
    for (let k = 0; k < KEYS.length; k++) {
      const wk = w[k];
      if (!wk) continue;
      const K = KEYS[k];
      az += K.az * wk; el += K.el * wk; dist += K.dist * wk; sh += K.shift * wk; shy += K.shiftY * wk;
      tx += K.t[0] * wk; ty += K.t[1] * wk; tz += K.t[2] * wk;
    }
    const t = this.now();
    const mobile = this.opts.mobile;
    const aspect = this.camera.aspect;
    // narrow screens: back off so the slab fits the width
    if (aspect < 1) dist *= Math.min(1.9, 0.55 + 0.75 / aspect);
    if (mobile || aspect < 1) { sh = 0; shy = w[0] * 0.04 + w[7] * 0.1; }
    // slow orbit at the destination, idle sway everywhere, pointer parallax
    az += w[7] * t * 0.05 + Math.sin(t * 0.13) * 0.05 + this.pointerSmooth.x * 0.07;
    el += Math.sin(t * 0.17) * 0.015 + this.pointerSmooth.y * 0.035;
    // intro: start high above, looking straight down, then swing into place
    const k = 1 - this.intro;
    el = lerp(el, 1.45, k);
    dist = lerp(dist, dist * 1.9, k);
    az -= k * 1.1;

    const ce = Math.cos(el);
    this.camTarget.set(tx, ty, tz);
    this.camPos.set(tx + dist * ce * Math.sin(az), ty + dist * Math.sin(el), tz + dist * ce * Math.cos(az));
    if (snap || this.camSnap || this.opts.reduce) { this.camera.position.copy(this.camPos); this.camSnap = false; }
    else this.camera.position.lerp(this.camPos, 1 - Math.exp(-this.dt * 6));
    this.camera.lookAt(this.camTarget);
    const W = window.innerWidth, Hh = window.innerHeight;
    this.camera.setViewOffset(W, Hh, -sh * W, shy * Hh, W, Hh);
  }

  /* ---------------- per-frame model views ---------------- */
  private updateGrid() {
    const tr = this.trainer;
    if (tr.version !== this.gridVersion) { this.gridDirty = true; this.gridVersion = tr.version; }
    if (!this.gridDirty) return;
    if (this.grid.atStart) this.passVersion = tr.version;
    const budget = this.quality === 0 ? 0.7 : this.opts.mobile ? 0.9 : 1.3;
    const before = this.grid.passes;
    this.grid.update(tr.model, budget, 2);
    // a pass that ran start to finish on the current weights leaves the grid clean
    if (this.grid.passes > before && this.passVersion === tr.version) this.gridDirty = false;
  }

  private updateSurface() {
    const n = this.n, out = this.grid.out, hs = this.hs, ps = this.ps;
    const g = this.surf.geometry;
    const pos = g.attributes.position.array as Float32Array;
    const nor = g.attributes.normal.array as Float32Array;
    const pa = g.attributes.aP.array as Float32Array;
    const k = this.opts.reduce ? 1 : 1 - Math.exp(-this.dt * 9);
    const amp = H * smooth(0.25, 1, this.reveal);
    for (let i = 0; i < n * n; i++) {
      ps[i] += (out[i] - ps[i]) * k;
      hs[i] = (ps[i] - 0.5) * amp;
      pos[i * 3 + 1] = hs[i];
      pa[i] = ps[i];
    }
    const dx = (2 * S) / (n - 1);
    for (let j = 0; j < n; j++) {
      const j0 = j > 0 ? j - 1 : j, j1 = j < n - 1 ? j + 1 : j;
      for (let i = 0; i < n; i++) {
        const i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
        const ddx = (hs[j * n + i1] - hs[j * n + i0]) / ((i1 - i0) * dx);
        const ddz = (hs[j1 * n + i] - hs[j0 * n + i]) / ((j1 - j0) * dx);
        // world z decreases as j grows
        let nx = -ddx, ny = 1, nz = ddz;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= l; ny *= l; nz *= l;
        const v = (j * n + i) * 3;
        nor[v] = nx; nor[v + 1] = ny; nor[v + 2] = nz;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.aP.needsUpdate = true;

    const sg = this.skirt.geometry;
    const sp = sg.attributes.position.array as Float32Array;
    const sP = sg.attributes.aP.array as Float32Array;
    const e = this.skirtIdx;
    for (let q = 0; q < e.length; q++) {
      sp[q * 6 + 1] = hs[e[q]];
      sP[q * 2] = ps[e[q]];
      sP[q * 2 + 1] = ps[e[q]];
    }
    sg.attributes.position.needsUpdate = true;
    sg.attributes.aP.needsUpdate = true;
  }

  /** Bilinear height of the smoothed surface at model-space (x, y). */
  heightAt(x: number, y: number) {
    const n = this.n;
    const fi = ((x + EXT) / (2 * EXT)) * (n - 1), fj = ((y + EXT) / (2 * EXT)) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(fi))), j = Math.max(0, Math.min(n - 2, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = this.hs;
    return lerp(lerp(h[j * n + i], h[j * n + i + 1], u), lerp(h[(j + 1) * n + i], h[(j + 1) * n + i + 1], u), v);
  }

  private updatePoints(t: number) {
    const tr = this.trainer;
    const N = tr.n;
    // new data: drop points in
    if (tr.dataVersion !== this.lastDataVersion) {
      if (tr.dataset !== this.lastDataset || N < this.lastN || N > this.lastN + 1) {
        const base = Math.max(t, 0);
        for (let i = 0; i < N; i++) this.spawn[i] = base + (this.intro < 1 && !this.opts.reduce ? 0.6 : 0) + (i / N) * 0.9;
        if (this.opts.reduce) this.spawn.fill(-100);
      } else if (N === this.lastN + 1) {
        this.spawn[N - 1] = t;
      }
      this.lastDataset = tr.dataset; this.lastN = N; this.lastDataVersion = tr.dataVersion;
      const cA = this.colA, cB = this.colB;
      for (let i = 0; i < N; i++) this.points.setColorAt(i, tr.Y[i] ? cB : cA);
      if (this.points.instanceColor) this.points.instanceColor.needsUpdate = true;
      this.predVersion = -1;
    }
    // which points are currently misclassified (cheap, a few hundred forwards)
    if (this.predVersion !== tr.version && this.frameNo % 6 === 0) {
      this.predVersion = tr.version;
      const w = this.wrongAttr.array as Float32Array;
      const early = tr.model.t < 30;
      for (let i = 0; i < N; i++) {
        const p = tr.model.forward(tr.X[i * 2], tr.X[i * 2 + 1]);
        this.pred[i] = p;
        w[i] = !early && (p >= 0.5 ? 1 : 0) !== tr.Y[i] ? 1 : 0;
      }
      this.wrongAttr.needsUpdate = true;
    }
    this.points.count = N;
    const m = this.points.instanceMatrix.array as Float32Array;
    const r = this.opts.mobile ? 0.11 : 0.085;
    for (let i = 0; i < N; i++) {
      const x = tr.X[i * 2], y = tr.X[i * 2 + 1];
      const age = t - this.spawn[i];
      const drop = age < 0 ? 1 : Math.max(0, 1 - age / 0.55);
      const sc = age < 0 ? 0 : r * Math.min(1, age / 0.12 + 0.2) * (1 + Math.max(0, 0.6 - age) * 0.6);
      const o = i * 16;
      m[o] = sc; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = sc; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sc; m[o + 11] = 0;
      m[o + 12] = (x / EXT) * S;
      m[o + 13] = this.heightAt(x, y) + r * 1.15 + drop * drop * 4;
      m[o + 14] = (-y / EXT) * S;
      m[o + 15] = 1;
    }
    this.points.instanceMatrix.needsUpdate = true;
  }

  private updateColors() {
    let ra = 0, ga = 0, ba = 0, rb = 0, gb = 0, bb = 0;
    const tmp = new THREE.Color();
    for (let k = 0; k < 8; k++) {
      const w = this.weights[k];
      if (!w) continue;
      const [a, b] = SECTION_COLORS[k];
      tmp.set(a); ra += tmp.r * w; ga += tmp.g * w; ba += tmp.b * w;
      tmp.set(b); rb += tmp.r * w; gb += tmp.g * w; bb += tmp.b * w;
    }
    this.colA.setRGB(ra, ga, ba, THREE.LinearSRGBColorSpace);
    this.colB.setRGB(rb, gb, bb, THREE.LinearSRGBColorSpace);
  }

  private updateHover() {
    const want = this.hoverOn;
    this.hoverAmt += ((want ? 1 : 0) - this.hoverAmt) * (1 - Math.exp(-this.dt * 10));
    this.hover.z = this.hoverAmt * this.weights[0];
    (this.surf.material.uniforms.uHoverCol.value as THREE.Color).copy(run.brush ? this.colB : this.colA);
    if (!this.pointerMoved || this.opts.mobile) return;
    this.pointerMoved = false;
    let over = false;
    if (this.inHero && this.intro > 0.95) {
      const hit = this.pick(this.pointer.x, this.pointer.y);
      if (hit) { over = true; this.hover.x = (hit[0] / EXT) * S; this.hover.y = (-hit[1] / EXT) * S; }
    }
    if (over !== this.hoverOn) { this.hoverOn = over; this.onHover?.(over); }
  }

  /* ---------------- loop ---------------- */
  private now() { return (performance.now() - this.t0) / 1000; }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const c0 = performance.now();
    const t = this.now();
    this.dt = Math.min(0.1, Math.max(0.001, t - this.lastT));
    this.lastT = t;
    this.frameNo++;
    this.adapt(t);

    this.progress += (this.target - this.progress) * (this.opts.reduce ? 1 : 1 - Math.exp(-this.dt * 4));
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-this.dt * 3));
    this.sectionBlend();
    this.reveal = this.opts.reduce ? 1 : Math.min(1, this.reveal + this.dt * (this.intro > 0.05 ? 0.42 : 0));

    // training: a few Adam steps per frame while the hero is on screen
    if (run.training && this.reveal > 0.45) {
      const s = this.trainer.stats;
      const converged = s.acc === 1 && s.loss < 0.01;
      // about 120 Adam steps a second whatever the frame rate, capped per frame
      this.stepAcc += this.dt * (converged ? 45 : 120);
      const steps = Math.min(6, Math.floor(this.stepAcc));
      this.stepAcc = Math.min(2, this.stepAcc - steps);
      if (steps) this.trainer.train(steps);
    }
    this.updateGrid();
    this.updateSurface();
    this.updatePoints(t);
    this.updateColors();
    this.updateHover();
    this.placeCamera();

    const su = this.surf.material.uniforms;
    su.uReveal.value = this.reveal;
    su.uTime.value = t;
    // the boundary glow dims while reading, so it never fights the text
    su.uBoundary.value = 0.6 + 0.4 * this.weights[0] + 0.3 * this.weights[7];
    // the model steps back a little while there is text to read, a lot at the contact cell
    const dim = 1 - 0.18 * (1 - this.weights[0] - this.weights[7]) - 0.55 * this.weights[7];
    su.uDim.value = dim;
    this.skirt.material.uniforms.uDim.value = dim;
    this.points.material.uniforms.uVis.value = dim;
    this.skirt.material.uniforms.uReveal.value = this.reveal;
    this.ground.material.uniforms.uReveal.value = smooth(0, 0.6, this.reveal);
    this.points.material.uniforms.uTime.value = t;
    this.motes.rotation.y = t * 0.012;
    (this.motes.material as THREE.PointsMaterial).opacity = 0.4 * this.reveal;

    for (let k = 0; k < this.moments.length; k++) {
      const m = this.moments[k];
      m.update(t, this.opts.reduce ? (this.weights[m.section] > 0.5 ? 1 : 0) : smooth(0.35, 0.92, this.weights[m.section]), this.dt);
    }

    const c1 = performance.now();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    const c2 = performance.now();
    this.logicMs += (c1 - c0 - this.logicMs) * 0.05;
    this.renderMs += (c2 - c1 - this.renderMs) * 0.05;
  };

  /** Adaptive quality: if frames stay slow, drop bloom, then resolution. */
  private adapt(t: number) {
    if (t < 4 || this.quality === 0 || document.hidden) return;
    this.slowFrames = this.dt > 0.034 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 75) {
      this.slowFrames = 0;
      this.quality--;
      if (this.quality === 1) {
        this.composer?.dispose();
        this.composer = undefined;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
      } else {
        this.renderer.setPixelRatio(0.75);
      }
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.onDegrade?.(this.quality);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now() - this.lastT * 1000;
    this.frame();
  }

  stop() { cancelAnimationFrame(this.raf); this.running = false; }

  /** Compile shaders and draw one frame behind the loader. */
  warm() {
    this.sectionBlend();
    this.placeCamera(true);
    this.renderer.compile(this.scene, this.camera);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  dispose() {
    this.stop();
    for (const m of this.moments) m.dispose?.();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        map?.dispose();
        mat.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }

  get gl() { return this.renderer; }
  get isMobile() { return this.opts.mobile; }
  get isReduced() { return this.opts.reduce; }
  get frameCount() { return this.frameNo; }
}
