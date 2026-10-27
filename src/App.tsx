import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import type { World, Stop } from "./world/World";
import type { Flat } from "./world/Flat";
import Loader from "./components/Loader";
import Console, { RunPill } from "./components/Console";
import MetricViz from "./components/MetricViz";
import Pipeline from "./components/Pipeline";
import Cursor from "./components/Cursor";
import Agent from "./components/Agent";
import Palette, { type Command } from "./components/Palette";
import { run } from "./ml/run";
import { certifications, contact, education, experience, featured, profile, projects, publications, site, skills } from "./data/content";
import { resolveViz } from "./components/MetricViz";

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Notebook cells, in order. `key` is the fixed camera/scene slot in the 3D
 *  world (src/world/World.ts KEYS and moments.ts), so a hidden section never
 *  shifts the others. Sections with no content hide themselves. */
const ALL_CELLS = [
  { id: "about", label: "About", key: 1, show: true },
  { id: "experience", label: "Experience", key: 2, show: experience.length > 0 },
  { id: "flagship", label: featured.title, key: 3, show: featured.parts.length > 0 },
  { id: "projects", label: "Projects", key: 4, show: projects.length > 0 },
  { id: "research", label: "Research", key: 5, show: publications.length > 0 },
  { id: "toolkit", label: "Toolkit", key: 6, show: skills.length + certifications.length > 0 },
  { id: "contact", label: "Contact", key: 7, show: true },
];
const CELLS = ALL_CELLS.filter((c) => c.show);
const SECTION_IDS = ["top", ...CELLS.map((c) => c.id)];
const SECTION_KEYS = [0, ...CELLS.map((c) => c.key)];
const CELL_N: Record<string, number> = Object.fromEntries(CELLS.map((c, i) => [c.id, i + 1]));
const isLink = (h?: string) => !!h && h !== "#";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "flagship";
const pubKinds = new Set(publications.map((p) => p.kind ?? "Paper"));
const researchTitle = pubKinds.size > 1 ? ["Papers and", "talks"] : pubKinds.has("Talk") ? ["Selected", "talks"] : ["Published", "research"];
const socials = ([["LinkedIn", profile.links.linkedin], ["GitHub", profile.links.github], ["X", profile.links.x]] as const).filter(([, h]) => isLink(h));
const [emailUser, emailHost] = profile.email.split("@");
// long names scale the hero type down so they never overflow
const nameScale = String(Math.min(1, 8 / Math.max(1, ...(profile.nameLines.length ? profile.nameLines : [profile.name]).slice(0, 2).map((l, i) => l.length + (i ? 1.2 : 0)))));

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flatCanvas = useRef<HTMLCanvasElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [active, setActive] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentSeed, setAgentSeed] = useState<string | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
    let world: World | null = null;
    let flat: Flat | null = null;
    let lenis: Lenis | null = null;
    let dead = false;
    const cleanups: (() => void)[] = [];
    const el = loader.current!;
    const num = el.querySelector<HTMLElement>(".loader__num")!;
    const curve = el.querySelector<SVGPathElement>(".loader__curve")!;
    const items = Array.from(el.querySelectorAll<HTMLElement>(".loader__log li"));
    document.documentElement.classList.add("is-loading");
    const ctx = gsap.context(() => {}, root);

    const counter = { v: 0 };
    const setCount = (to: number, line: number, dur = 0.5) => {
      items.forEach((li, i) => { li.classList.toggle("is-done", i < line); li.classList.toggle("is-run", i === line); });
      return gsap.to(counter, {
        v: to, duration: reduce ? 0 : dur, ease: "power2.out",
        onUpdate: () => {
          num.textContent = String(Math.round(counter.v)).padStart(3, "0");
          curve.style.strokeDashoffset = String(1 - counter.v / 100);
        },
      });
    };
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

    const boot = async () => {
      await setCount(14, 0, 0.35);
      if (dead) return;
      run.set({ live: false, inView: true, playing: !reduce });
      if (reduce) {
        // no live animation: show an already trained model, play is one click away
        run.trainer.train(1600);
        run.trainer.evaluate();
      }
      await setCount(34, 1, 0.35);
      await document.fonts.ready;
      if (dead) return;
      await setCount(52, 2, 0.35);
      if (dead) return;
      try {
        const { World } = await import("./world/World");
        if (dead) return;
        world = new World(canvas.current!, run.trainer, { mobile, reduce });
      } catch (err) {
        console.warn("WebGL unavailable, using the 2D fallback", err);
        world = null;
        setNoGL(true);
      }
      if (dead) { world?.dispose(); return; }
      await setCount(78, 3, 0.4);
      if (dead) return;
      world?.warm();
      await frame();
      if (dead) return;

      // ---- scroll: map scroll position to camera stops, one per notebook cell ----
      const sections = SECTION_IDS.map((id) => document.getElementById(id)!);
      const computeStops = () => {
        const vh = window.innerHeight;
        const max = Math.max(1, document.documentElement.scrollHeight - vh);
        const list: Stop[] = [{ p: 0, k: 0 }];
        sections.forEach((s, i) => {
          if (i === 0) return;
          const k = SECTION_KEYS[i];
          const top = s.getBoundingClientRect().top + window.scrollY;
          const h = s.offsetHeight;
          if (i === sections.length - 1) { list.push({ p: Math.min(1, (top + h * 0.2 - vh * 0.3) / max), k }, { p: 1, k }); return; }
          const a = top - vh * 0.2, b = top + h - vh * 0.8;
          if (b - a > vh * 0.25) list.push({ p: a / max, k }, { p: b / max, k });
          else list.push({ p: (top + h / 2 - vh / 2) / max, k });
        });
        const clean = list.filter((s, i) => i === 0 || s.p > list[i - 1].p + 1e-4);
        world?.setStops(clean);
        onScroll();
      };
      function onScroll() {
        const vh = window.innerHeight;
        const max = Math.max(1, document.documentElement.scrollHeight - vh);
        const p = window.scrollY / max;
        world?.setProgress(p);
        if (bar.current) bar.current.style.transform = `scaleY(${p})`;
        let idx = -1;
        sections.forEach((s, k) => { if (k && s.getBoundingClientRect().top < vh * 0.55) idx = k - 1; });
        setActive(idx);
        document.documentElement.classList.toggle("in-hero", window.scrollY < vh * 0.5);
        const inView = window.scrollY < vh * 0.65 && !document.hidden;
        if (inView !== run.inView) run.set({ inView });
      }

      if (!reduce) {
        lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
        lenisRef.current = lenis;
        lenis.on("scroll", ScrollTrigger.update);
        const raf = (time: number) => lenis!.raf(time * 1000);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);
        cleanups.push(() => { gsap.ticker.remove(raf); lenis!.destroy(); lenisRef.current = null; });
        lenis.stop();
      }
      ctx.add(() => buildScroll(mobile, reduce));
      ScrollTrigger.addEventListener("refresh", computeStops);
      window.addEventListener("scroll", onScroll, { passive: true });
      const onVis = () => onScroll();
      document.addEventListener("visibilitychange", onVis);
      cleanups.push(() => {
        ScrollTrigger.removeEventListener("refresh", computeStops);
        window.removeEventListener("scroll", onScroll);
        document.removeEventListener("visibilitychange", onVis);
      });
      ScrollTrigger.refresh();
      computeStops();
      const ro = new ResizeObserver(() => ScrollTrigger.refresh());
      ro.observe(document.querySelector("main")!);
      cleanups.push(() => ro.disconnect());

      // ---- pointer: drop points on the surface (click or tap, not drags or scrolls) ----
      const isUI = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.(".cell, .console, .hud a, .hud button, .hud nav, a, button, input, .agentx, .palette, .hero__copy");
      let down: { x: number; y: number; t: number } | null = null;
      const ndc = (e: PointerEvent) => [(e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1] as const;
      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "mouse" && world) { const [x, y] = ndc(e); world.setPointer(isUI(e.target) ? 9 : x, isUI(e.target) ? 9 : y); }
      };
      const onDown = (e: PointerEvent) => { down = isUI(e.target) ? null : { x: e.clientX, y: e.clientY, t: performance.now() }; };
      const onUp = (e: PointerEvent) => {
        if (!down || !run.live) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        const quick = performance.now() - down.t < 600;
        down = null;
        if (moved > 10 || !quick) return;
        let hit: [number, number] | null = null;
        if (world) { if (world.inHero) { const [x, y] = ndc(e); hit = world.pick(x, y); } }
        else if (flat) hit = flat.pick(e.clientX, e.clientY);
        if (!hit) return;
        const c = (e.shiftKey ? 1 - run.brush : run.brush) as 0 | 1;
        run.trainer.addPoint(hit[0], hit[1], c);
        if (!run.playing) run.set({ playing: true }); else run.emit();
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp);
      const onResize = () => { world?.resize(); flat?.resize(); };
      window.addEventListener("resize", onResize);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("resize", onResize);
      });

      if (world) {
        world.onDegrade = () => document.documentElement.classList.add("lowfx");
        world.onHover = (over) => window.dispatchEvent(new CustomEvent("cursor:label", { detail: over ? (run.brush ? "Drop B" : "Drop A") : "" }));
        (window as unknown as { __world: World }).__world = world;
      } else {
        const { Flat } = await import("./world/Flat");
        if (dead) return;
        await frame();
        flat = new Flat(flatCanvas.current!);
        flat.start();
      }

      await setCount(100, 4, 0.35);
      if (dead) return;

      // ---- exit: the kernel cell collapses, the camera swoops down onto the model ----
      document.documentElement.classList.remove("is-loading");
      world?.setIntro(reduce ? 1 : 0);
      world?.start();
      ctx.add(() => {
        const tl = gsap.timeline({ onComplete: () => { lenis?.start(); } });
        if (reduce) {
          tl.set(el, { autoAlpha: 0 });
          run.set({ live: true });
          return;
        }
        const intro = { v: 0 };
        tl.to(".loader__inner", { y: -30, autoAlpha: 0, duration: 0.55, ease: "power3.in" })
          .to(el, { clipPath: "inset(0 0 100% 0)", duration: 1.0, ease: "expo.inOut" }, "-=0.15")
          .to(intro, { v: 1, duration: 3.4, ease: "power3.inOut", onUpdate: () => world?.setIntro(intro.v) }, "<")
          .call(() => run.set({ live: true }), [], "<+=0.9")
          .fromTo(".hero__name .ch", { yPercent: 115 }, { yPercent: 0, duration: 1.3, stagger: 0.035, ease: "expo.out" }, "<+=0.4")
          .fromTo(".hero__fade", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.07, ease: "power3.out", clearProps: "transform" }, "<+=0.5");
      });
    };
    boot();

    return () => {
      dead = true;
      cleanups.forEach((c) => c());
      ctx.revert();
      world?.dispose();
      flat?.dispose();
      document.documentElement.classList.remove("is-loading");
    };
  }, []);

  const go = useCallback((id: string) => {
    setMenu(false);
    const target = id === "top" ? 0 : (() => {
      const el = document.getElementById(id);
      if (!el) return null;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const vh = window.innerHeight;
      return el.offsetHeight > vh * 0.9 ? top : top + el.offsetHeight / 2 - vh / 2;
    })();
    if (target === null) return;
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 1.8 });
    else window.scrollTo(0, target);
  }, []);

  const openAgent = useCallback((seed?: string) => { setAgentSeed(seed); setAgentOpen(true); }, []);
  const closeAgent = useCallback(() => { setAgentOpen(false); setAgentSeed(undefined); }, []);
  const downloadResume = useCallback(() => {
    const a = document.createElement("a");
    a.href = site.resume; a.download = site.resumeFileName; a.click();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-dialog", agentOpen || paletteOpen);
    const l = lenisRef.current;
    if (!l) return;
    if (agentOpen || paletteOpen) l.stop(); else l.start();
  }, [agentOpen, paletteOpen]);

  // the custom cursor waits for the first real pointer move (no stray reticle at 0,0)
  useEffect(() => {
    const first = () => document.documentElement.classList.add("cursor-moved");
    window.addEventListener("pointermove", first, { once: true });
    return () => window.removeEventListener("pointermove", first);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: Command[] = useMemo(() => [
    { id: "agent", label: "Ask my agent a question", hint: "AI", run: () => openAgent() },
    { id: "resume", label: "Download resume (PDF)", hint: "PDF", run: downloadResume },
    { id: "email", label: "Copy email address", run: () => navigator.clipboard?.writeText(profile.email) },
    ...CELLS.map((c, i) => ({ id: `go-${c.id}`, label: `Go to ${c.label}`, hint: `[${i + 1}]`, run: () => go(c.id) })),
    { id: "go-top", label: "Back to the live training run", run: () => go("top") },
    { id: "pause", label: "Pause or resume training", run: () => run.set({ playing: !run.playing }) },
    { id: "reset", label: "Reset the network's weights", run: () => { run.trainer.reset(); run.emit(); go("top"); } },
    ...featured.links.filter((l) => isLink(l.href)).map((l, i) => ({ id: `flagship-${i}`, label: l.label, run: () => window.open(l.href, "_blank", "noopener") })),
    ...socials.map(([name, href]) => ({ id: name.toLowerCase(), label: `Open ${name}`, run: () => window.open(href, "_blank", "noopener") })),
  ], [go, openAgent, downloadResume]);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div ref={root}>
      <a className="skip" href="#about">Skip to content</a>
      <canvas className={`world${noGL ? " world--none" : ""}`} ref={canvas} aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <Loader ref={loader} />
      <Cursor />

      {/* ---------- HUD ---------- */}
      <header className="hud">
        <div className="hud__top hud__fade">
          <a href="#top" className="mark" onClick={(e) => { e.preventDefault(); go("top"); }} aria-label={`${profile.name}, back to the top`}>
            <span className="mark__md">{profile.initials}</span><span className="mark__url">{site.wordmark}</span>
          </a>
          <RunPill onClick={() => go("top")} />
          <div className="hud__right">
            <a className="hbtn hbtn--hide-s" href="#contact" onClick={(e) => { e.preventDefault(); go("contact"); }}>Contact</a>
            <button className="hbtn hbtn--menu" aria-expanded={menu} aria-controls="cells" onClick={() => setMenu((m) => !m)}>{menu ? "Close" : "Cells"}</button>
          </div>
        </div>
        <nav id="cells" className={`cells hud__fade${menu ? " cells--open" : ""}`} aria-label="Sections">
          <ol>
            {CELLS.map((c, i) => (
              <li key={c.id} className={i === active ? "is-active" : i < active ? "is-past" : ""}>
                <a href={`#${c.id}`} onClick={(e) => { e.preventDefault(); go(c.id); }} aria-current={i === active ? "true" : undefined}>
                  <span className="cells__n">[{i + 1}]</span><span className="cells__l">{c.label}</span>
                </a>
              </li>
            ))}
          </ol>
          <div className="cells__track" aria-hidden="true"><i ref={(e) => { bar.current = e; }} /></div>
        </nav>
        <div className="dock hud__fade">
          <button className="dock__btn dock__btn--agent" onClick={() => openAgent()} data-cursor="Ask">
            <i aria-hidden="true" /> Ask my agent
          </button>
          <a className="dock__btn dock__btn--resume" href={site.resume} download={site.resumeFileName} data-cursor="PDF">Resume</a>
          <button className="dock__btn dock__btn--kbd" onClick={() => setPaletteOpen(true)} aria-label="Open command menu">
            {touch ? "Menu" : <><kbd>{isMac ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd></>}
          </button>
        </div>
      </header>

      <Agent open={agentOpen} onClose={closeAgent} seed={agentSeed} />
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onAsk={(q) => openAgent(q)} />

      <main>
        {/* ---------- HERO: the live run ---------- */}
        <section className="hero" id="top">
          <div className="hero__copy">
            <p className="hero__eyebrow hero__fade"><span>{profile.role}</span><span>{profile.company ? `${profile.company}, ` : ""}{profile.location}</span></p>
            <h1 className="hero__name" aria-label={profile.name} style={{ ["--nk" as string]: nameScale }}>
              {(profile.nameLines.length ? profile.nameLines : [profile.name]).slice(0, 2).map((line, l) => (
                <span key={l} className={`hero__line${l ? " hero__line--2" : ""}${line.length > 9 ? " hero__line--long" : ""}`} aria-hidden="true">
                  {[...line].map((c, i) => <span className="ch" key={i}>{c === " " ? "\u00a0" : c}</span>)}
                </span>
              ))}
            </h1>
            <p className="hero__lede hero__fade">{profile.intro}</p>
            <div className="hero__actions hero__fade">
              <button className="btn btn--solid" onClick={() => openAgent()}>Ask my agent</button>
              <a className="btn" href={site.resume} download={site.resumeFileName}>Download resume</a>
            </div>
          </div>
          <div className="hero__stage" aria-hidden="true">
            {noGL && <canvas className="flat" ref={flatCanvas} />}
          </div>
          <div className="hero__console hero__fade"><Console touch={touch} /></div>
          <p className="hero__note hero__fade">A real neural network, written from scratch, trains in your browser on this page. Scroll and it becomes the notebook.</p>
        </section>

        {/* ---------- [1] ABOUT ---------- */}
        <section className="stage stage--l" id="about">
          <Cell n={CELL_N.about} file="about.md" kind="markdown">
            <div className="split">
              <div>
                <h2 className="h2 reveal">{profile.headline[0]} {profile.headline[1] && <em>{profile.headline[1]}</em>}</h2>
                <dl className="facts">
                  <div><dt>role</dt><dd>{profile.role}</dd></div>
                  {profile.company && <div><dt>at</dt><dd>{profile.company}</dd></div>}
                  <div><dt>based</dt><dd>{profile.location}</dd></div>
                  {education.school && <div><dt>studied</dt><dd>{education.degree}, {education.school}</dd></div>}
                  {profile.coords && <div><dt>coords</dt><dd>{profile.coords}</dd></div>}
                </dl>
              </div>
              <div className="prose">{profile.about.map((p) => <p key={p.slice(0, 16)}>{p}</p>)}</div>
            </div>
          </Cell>
        </section>

        {/* ---------- [2] EXPERIENCE ---------- */}
        {experience.length > 0 && <section className="stage stage--r" id="experience">
          <Cell n={CELL_N.experience} file="training_log.py" kind="log">
            <h2 className="h2 reveal">Training <em>log</em></h2>
            <ol className="log">
              {experience.map((e, i) => (
                <li key={i} className={i === 0 ? "log__now" : ""}>
                  <p className="log__ckpt">ckpt {experience.length - i} <span>{e.start} to {e.end}</span></p>
                  <h3 className="h3">{e.role}</h3>
                  <p className="log__org">{e.org}, {e.place}</p>
                  <ul>{e.points.map((p) => <li key={p.slice(0, 24)}>{p}</li>)}</ul>
                </li>
              ))}
            </ol>
          </Cell>
        </section>}

        {/* ---------- [3] FLAGSHIP ---------- */}
        {CELL_N.flagship && <section className="stage stage--l" id="flagship">
          <Cell n={CELL_N.flagship} file={`${slug(featured.title)}.py`} kind="flagship" wide>
            <div className="split split--flag">
              <div>
                <p className="kicker">Flagship project</p>
                <h2 className="h2 reveal">{featured.title}</h2>
                <p className="tagline">{featured.tagline}</p>
                <p className="desc">{featured.description}</p>
              </div>
              <div>
                <Pipeline />
                <ul className="ticks">{featured.facts.map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="stack">{featured.stack.map((s) => <span key={s}>{s}</span>)}</p>
                {featured.links.filter((l) => isLink(l.href)).map((l) => (
                  <a key={l.href} className="btn btn--ink" href={l.href} target="_blank" rel="noreferrer" data-cursor="Open">{l.label}</a>
                ))}
              </div>
            </div>
          </Cell>
        </section>}

        {/* ---------- [4] PROJECTS ---------- */}
        {projects.length > 0 && <section className="stage stage--l stage--long" id="projects">
          <div className="projects">
            <header className="projects__head">
              <p className="prompt">In [{CELL_N.projects}]:</p>
              <h2 className="h2 h2--light reveal">Experiments, <em>each with its result</em></h2>
              <p className="projects__sub">{projects.length} {projects.length === 1 ? "project" : "projects"}. The output beside each one is drawn from its reported numbers. Behind them, the live model is scoring itself.</p>
            </header>
            {projects.map((p, i) => (
              <article className="pcell" key={p.title}>
                <p className="pcell__prompt">[{CELL_N.projects}.{i + 1}]</p>
                <div className={`pcell__body${resolveViz(p).type === "none" ? " pcell__body--solo" : ""}`}>
                  <div className="pcell__text">
                    <p className="pcell__meta"><span>{p.category}</span><span>{p.year}</span>{p.badge && <em className="badge">{p.badge}</em>}</p>
                    <h3 className="pcell__title">{p.title}</h3>
                    <p className="pcell__sum">{p.summary}</p>
                    <p className="pcell__detail">{p.detail}</p>
                    <p className="stack">{p.stack.map((s) => <span key={s}>{s}</span>)}</p>
                    {p.links && p.links.length > 0 && <p className="pcell__links">{p.links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noreferrer" data-cursor="Open">{l.label} ↗</a>)}</p>}
                  </div>
                  <MetricViz p={p} />
                </div>
              </article>
            ))}
            {isLink(profile.links.github) && <p className="projects__more"><a href={profile.links.github} target="_blank" rel="noreferrer" data-cursor="Open">More on GitHub ↗</a></p>}
          </div>
        </section>}

        {/* ---------- [5] RESEARCH ---------- */}
        {CELL_N.research && <section className="stage stage--r" id="research">
          <Cell n={CELL_N.research} file="references.bib" kind="citations">
            <h2 className="h2 reveal">{researchTitle[0]} <em>{researchTitle[1]}</em></h2>
            <ol className={`refs${publications.length === 1 ? " refs--one" : ""}`}>
              {publications.map((p, i) => (
                <li key={p.title} className={p.award ? "refs__award" : ""}>
                  <span className="refs__n">[{i + 1}]</span>
                  <div>
                    <p className="refs__venue">{p.venue} <span>{p.year}{p.kind === "Talk" ? " · talk" : ""}</span>{p.award && <em className="badge badge--gold">{p.award}</em>}</p>
                    <h3 className="refs__title">{p.title}</h3>
                    <p className="refs__meta">{p.publisher}. {p.where}.</p>
                    {p.note && <p className="refs__note">{p.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Cell>
        </section>}

        {/* ---------- [6] TOOLKIT ---------- */}
        {CELL_N.toolkit && <section className="stage stage--l" id="toolkit">
          <Cell n={CELL_N.toolkit} file="toolkit.py" kind="code" wide>
            <h2 className="h2 reveal">Toolkit</h2>
            <div className="imports">
              {skills.map((g) => (
                <div key={g.group} className="imports__g">
                  <p className="imports__c"># {g.group}</p>
                  <ul>{g.items.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              ))}
            </div>
            {certifications.length > 0 && <>
            <p className="df__cap"><span>certifications</span>.head({certifications.length})</p>
            <div className="df" role="region" aria-label="Certifications" tabIndex={0}>
              <table>
                <thead><tr><th scope="col" /><th scope="col">name</th><th scope="col">issuer</th><th scope="col">date</th></tr></thead>
                <tbody>
                  {certifications.map((c, i) => (
                    <tr key={c.name}><th scope="row">{i}</th><td>{c.name}</td><td>{c.issuer}</td><td>{c.date}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>}
          </Cell>
        </section>}

        {/* ---------- [7] CONTACT ---------- */}
        <section className="stage stage--c" id="contact">
          <div className="contact">
            <p className="prompt prompt--c">In [{CELL_N.contact}]:</p>
            <h2 className="contact__h reveal">{contact.heading[0]} {contact.heading[1] && <em>{contact.heading[1]}</em>}</h2>
            <p className="contact__lead">{contact.lead}</p>
            <a className="contact__email" href={`mailto:${profile.email}`} data-cursor="Write">{emailUser}<wbr />{emailHost ? `@${emailHost}` : ""}</a>
            <div className="contact__row">
              <CopyButton />
              <a className="btn btn--solid" href={site.resume} download={site.resumeFileName}>Download resume</a>
              {socials.map(([name, href]) => <a key={name} className="btn" href={href} target="_blank" rel="noreferrer">{name}</a>)}
            </div>
          </div>
          <footer className="footer">
            <p>© {new Date().getFullYear()} {profile.name}. {profile.location}.</p>
            {site.footerNote && <p className="footer__note">{site.footerNote}</p>}
            <p>The network above was trained in your browser. Three.js, GSAP and a few hundred lines of TypeScript.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}

function Cell({ n, file, kind, wide, children }: { n: number; file: string; kind: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`cell${wide ? " cell--wide" : ""}`}>
      <p className="prompt">In [{n}]:</p>
      <div className="cell__card">
        <p className="cell__bar"><span>{file}</span><span>{kind}</span></p>
        <div className="cell__body">{children}</div>
      </div>
    </div>
  );
}

function CopyButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
  return (
    <button className="btn" onClick={async () => {
      try { await navigator.clipboard.writeText(profile.email); setCopied(true); } catch { window.location.href = `mailto:${profile.email}`; }
    }}>
      {copied ? "Copied" : "Copy email"}
      <span className="sr-only" aria-live="polite">{copied ? "Email address copied" : ""}</span>
    </button>
  );
}

/* -------------------------------------------------------------- */
/* Scroll choreography                                             */
/* -------------------------------------------------------------- */
function buildScroll(mobile: boolean, reduce: boolean) {
  if (reduce) return;
  gsap.utils.toArray<HTMLElement>(".reveal").forEach((h) => {
    const split = SplitText.create(h, { type: "words", mask: "words" });
    gsap.fromTo(split.words, { yPercent: 110 }, {
      yPercent: 0, duration: 1, stagger: 0.05, ease: "expo.out",
      scrollTrigger: { trigger: h, start: "top 90%", toggleActions: "play none none reverse" },
    });
  });
  // cells rise in; transform and opacity only (no filters over the paper)
  gsap.utils.toArray<HTMLElement>(".cell__card, .pcell__body, .contact").forEach((c) => {
    gsap.fromTo(c, { y: 50, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 1, ease: "power3.out",
      scrollTrigger: { trigger: c, start: "top 94%", toggleActions: "play none none reverse" },
    });
  });
  gsap.utils.toArray<HTMLElement>(".prompt, .pcell__prompt").forEach((c) => {
    gsap.fromTo(c, { x: -14, autoAlpha: 0 }, {
      x: 0, autoAlpha: 1, duration: 0.8, ease: "power3.out",
      scrollTrigger: { trigger: c, start: "top 94%", toggleActions: "play none none reverse" },
    });
  });
  // hero copy drifts up and fades as you leave the live run
  if (!mobile) gsap.fromTo(".hero__copy", { y: 0, autoAlpha: 1 }, {
    y: mobile ? -40 : -90, autoAlpha: 0, ease: "none", immediateRender: false,
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 15%", scrub: true },
  });
}
