/* ------------------------------------------------------------------
   Colours used by the 3D world, the loss chart and canvas text.
   Keep these in step with the CSS variables at the top of
   src/styles.css (same names where they overlap). Change a colour in
   both places to re-theme the whole site.
   ------------------------------------------------------------------ */
export const HEX = {
  bg: "#12100d",       // page background (--bg)
  ember: "#ff6b3d",    // class A accent (--ember)
  emberDeep: "#c8431c",// award badge on 3D paper cards
  teal: "#2ed3b7",     // class B accent (--teal)
  tealDeep: "#0e8c79", // venue text on 3D paper cards
  paper: "#efe8db",    // paper cells (--paper)
  cream: "#ffe9c9",    // highlights and 3D titles (--cream)
  text: "#efe7da",     // light text (--text)
  muted: "#a69d8e",    // secondary text (--muted)
  soft: "#cfc6b6",     // tertiary text on dark
  ink: "#1c1814",      // dark text on paper (--ink-text)
  mid: "#3b342c",      // neutral surface between classes
  gold: "#ffc35a",     // award glow (--gold)
};

/** Per-section colour pair for the decision surface (class A, class B). */
export const SECTION_COLORS: [string, string][] = [
  ["#ff6b3d", "#2ed3b7"], // top: live run
  ["#ff7a45", "#3fc9d8"], // about: weights
  ["#ffad4a", "#6f8dff"], // experience: training log
  ["#ff6b3d", "#a48bff"], // flagship: computation graph
  ["#ff6b3d", "#2ed3b7"], // projects: evaluation
  ["#ffc35a", "#2fbfa6"], // research: papers
  ["#ff7f5c", "#56b6ff"], // toolkit: features
  ["#ff6b3d", "#2ed3b7"], // contact
];
