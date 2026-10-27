// Shared state of the live run, read by the hero console, the HUD pill and the renderers.
import { Trainer } from "./trainer";

type Listener = () => void;

class Run {
  trainer = new Trainer();
  /** visitor pressed play (default) or pause */
  playing = true;
  /** hero is on screen and the tab is visible */
  inView = true;
  /** the intro has finished */
  live = false;
  brush: 0 | 1 = 0;
  private ls = new Set<Listener>();

  get training() { return this.playing && this.inView && this.live; }
  on(l: Listener) { this.ls.add(l); return () => { this.ls.delete(l); }; }
  emit() { this.ls.forEach((l) => l()); }
  set(p: Partial<Pick<Run, "playing" | "inView" | "live" | "brush">>) { Object.assign(this, p); this.emit(); }
}

export const run = new Run();
