// =====================================================================
// All site content lives here. Edit this file to make the site yours.
// The components, the 3D world, the loader, the command palette, the
// on-site agent (and its optional LLM endpoint), index.html, sitemap.xml
// and robots.txt all read from it. You should not need to touch any
// other file to change the person, the words or the numbers.
//
// The demo person below, Sana Qureshi, is fictional, and so are the
// companies, university, projects, papers and numbers.
// =====================================================================

/** Site-wide settings: used by index.html (title, meta, Open Graph,
 *  JSON-LD), sitemap.xml, robots.txt, the HUD and the footer. */
export const site = {
  /** Public URL of the site, with a trailing slash. */
  url: "https://example.com/",
  /** Browser tab and share title. */
  title: "Sana Qureshi · Data Scientist",
  /** Search and share description (aim for 150 to 160 characters). */
  description:
    "Sana Qureshi is a data scientist in Toronto working on fraud detection, demand forecasting and A/B testing. A small neural network trains live in your browser on this page.",
  /** Open Graph locale. */
  locale: "en_CA",
  /** Share image in public/ (1200x630). */
  ogImage: "/og.png",
  /** Resume PDF in public/, and the file name visitors download it as. */
  resume: "/Resume.pdf",
  resumeFileName: "Sana_Qureshi_Resume.pdf",
  /** Short text next to the initials in the top-left mark (hidden on phones). */
  wordmark: "sana qureshi · data science",
  /** Theme colour for mobile browser chrome. */
  themeColor: "#12100d",
  /** Shown in the footer. Delete the text (empty string) once the site is about you. */
  footerNote: "Sample portfolio. The person, companies and projects are fictional.",
  /** Optional Twitter/X handle for share cards, without the @. Leave empty to omit. */
  twitter: "",
};

export const profile = {
  name: "Sana Qureshi",
  /** Used for the big two-line name in the hero. Split where you want the line break. */
  nameLines: ["Sana", "Qureshi"],
  /** Initials for the top-left mark and the favicon. */
  initials: "sq",
  role: "Data Scientist",
  company: "Fernway Financial",
  location: "Toronto, Canada",
  coords: "43.65° N, 79.38° W",
  email: "sana@example.com",
  intro:
    "I build models that decide things with money on the line: which payments look like fraud, how much stock a store should order, and whether a product change actually helped.",
  /** About heading. The second part is set in italics. */
  headline: ["Numbers that still hold up", "a quarter later."],
  about: [
    "I'm a Data Scientist at Fernway Financial, a payments and small business banking company in Toronto. I work on the fraud team and the experimentation platform, and I own the model that scores every card payment before it is approved.",
    "Before Fernway I spent three years forecasting demand for a regional grocery chain, where a bad forecast shows up a week later as empty shelves or a dumpster of spoiled berries. That job taught me to care about how a model fails, not only how well it scores.",
    "I studied statistics at Lakemont University. I like simple baselines, honest error bars and dashboards that people actually open.",
  ],
  /** Social links. Use "#" or an empty string to hide a button. */
  links: {
    github: "#",
    linkedin: "#",
    x: "#",
  },
};

/** Education, shown in the About cell and used by the agent. */
export const education = {
  degree: "MSc in Statistics",
  school: "Lakemont University",
  place: "Toronto",
  years: "2016 to 2018",
};

export type Experience = {
  role: string;
  org: string;
  place: string;
  start: string;
  end: string;
  points: string[];
};

/** Newest first. One to five entries all lay out well. */
export const experience: Experience[] = [
  {
    role: "Data Scientist, Fraud and Experimentation",
    org: "Fernway Financial",
    place: "Toronto",
    start: "Mar 2022",
    end: "Present",
    points: [
      "Own the real-time card fraud model that scores about 1.8 million payments a day in under 40 ms, and cut fraud losses by 31% in its first year without raising the decline rate.",
      "Built the statistics engine behind Fernway's A/B testing platform: CUPED variance reduction, sequential testing and automatic sample ratio checks, now used by 14 product teams.",
      "Run the monthly model review with risk and compliance, and wrote the playbook for retraining, drift alerts and rollbacks.",
    ],
  },
  {
    role: "Data Scientist, Demand Forecasting",
    org: "Harbour & Pine Grocers",
    place: "Toronto",
    start: "Jun 2019",
    end: "Feb 2022",
    points: [
      "Replaced a spreadsheet forecast with a LightGBM model for 140 stores and 22,000 products, lowering weekly forecast error from 14.2% to 8.9% WMAPE.",
      "Worked with store managers on fresh produce ordering, which cut spoilage by 17% across the pilot region.",
    ],
  },
  {
    role: "Research Assistant, Applied Statistics Lab",
    org: "Lakemont University",
    place: "Toronto",
    start: "Sep 2016",
    end: "May 2019",
    points: [
      "Studied forecast reconciliation for hierarchical retail data, which became my master's thesis and a journal paper.",
      "Taught the lab sections of an undergraduate regression course for four terms.",
    ],
  },
];

/** Project categories. Add or rename freely; they are only labels. */
export type Category = "Fraud and risk" | "Forecasting" | "Experimentation" | "Data and MLOps";

/**
 * The small "Out" visual beside each project card. Pick one per project with
 * the `viz` field. When `viz` is left out, the site picks a default:
 * a gauge if `metric.value` ends in "%", otherwise a big number if there is
 * a metric, otherwise nothing.
 *
 *  "gauge"   a half-circle arc filled to metric.value (needs a % metric).
 *            Optional `bar` adds one extra 0..1 score under it, e.g. F1.
 *  "number"  the metric value set large, with its label.
 *  "bars"    horizontal bars, one per item. Each bar is value / max
 *            (max defaults to 1). `text` overrides the printed value.
 *  "compare" a before/after pair of bars, e.g. old vs new error rate.
 *            Lower is better when `lowerIsBetter` is true.
 *  "count"   a grid of n squares with n set large, for counts like
 *            "12 checks". Keep n at 40 or below.
 *  "steps"   an ordered list of short steps, e.g. a pipeline.
 *  "hub"     one centre node connected to up to five satellite nodes.
 *  "code"    a few lines of monospaced text.
 *  "none"    no visual; the text spans the full card.
 *
 * Only draw numbers you actually reported. Never invent curves or data points.
 */
export type Viz =
  | { type: "gauge"; bar?: { label: string; value: number } }
  | { type: "number" }
  | { type: "bars"; items: { label: string; value: number; max?: number; text?: string }[]; caption?: string }
  | { type: "compare"; before: { label: string; value: number; text: string }; after: { label: string; value: number; text: string }; lowerIsBetter?: boolean; caption?: string }
  | { type: "count"; n: number; label?: string }
  | { type: "steps"; steps: string[]; caption?: string }
  | { type: "hub"; center: string; nodes: string[]; caption?: string }
  | { type: "code"; code: string; caption?: string }
  | { type: "none" };

export type Project = {
  title: string;
  summary: string;
  detail: string;
  category: Category;
  stack: string[];
  /** The headline number. Shown in the visual and used by the agent. */
  metric?: { value: string; label: string };
  year: string;
  links?: { label: string; href: string }[];
  /** A small tag next to the year, e.g. "Published" or "Open source". */
  badge?: string;
  viz?: Viz;
};

/** The flagship project. `parts` are drawn as a four-step computation graph
 *  in the cell and in 3D (two to six parts work), all reading from `hub`. */
export const featured = {
  /** Also used as the nav label for this section. */
  title: "Larkspur",
  tagline: "Every card payment gets a fraud score in under 40 milliseconds, and every analyst decision makes the next score better.",
  description:
    "Larkspur is the real-time fraud system I designed and lead at Fernway. Payment events stream in, features are computed over rolling windows per card, device and merchant, a gradient boosted model scores the payment, and the riskiest cases land in an analyst review queue. Every review outcome flows back as a label, so the model is retrained weekly on fresh, confirmed fraud instead of stale chargebacks.",
  facts: [
    "1.8 million payments scored a day, p99 latency 38 ms",
    "Fraud losses down 31% in the first year at the same decline rate",
    "Shadow mode and a one-click rollback for every model release",
  ],
  stack: ["Python", "LightGBM", "Kafka", "Redis", "PostgreSQL", "MLflow"],
  links: [] as { label: string; href: string }[],
  /** Caption above the in-cell graph. */
  graphLabel: "scoring path",
  /** Labels for the left (input) and right (output) ends of the graph. */
  input: "payment",
  output: "approve, review or decline",
  /** The shared layer every part reads from and writes to. */
  hub: "Label feedback loop",
  parts: [
    { name: "Ingest", role: "Streams each payment event with card, device and merchant context." },
    { name: "Features", role: "Computes 180 rolling-window features per card, device and merchant." },
    { name: "Score", role: "A LightGBM model returns a fraud probability in under 40 ms." },
    { name: "Review", role: "Analysts work the riskiest cases, and their decisions become new labels." },
  ],
};

export const projects: Project[] = [
  {
    title: "Account Takeover Detection",
    summary: "Flags logins that look like someone else is using a customer's account.",
    detail:
      "A sequence model over the last 50 sessions per account, with features for new devices, impossible travel and unusual navigation. At a 1% false positive rate it catches 74% of confirmed takeovers, up from 41% with the old rules.",
    category: "Fraud and risk",
    stack: ["PyTorch", "GRU", "Kafka", "Python"],
    metric: { value: "74%", label: "recall at 1% false positives" },
    year: "2025",
    viz: { type: "compare", before: { label: "rules", value: 0.41, text: "41%" }, after: { label: "model", value: 0.74, text: "74%" }, caption: "recall" },
  },
  {
    title: "Merchant Risk Graph",
    summary: "Finds risky merchants by the cards, devices and bank accounts they share.",
    detail:
      "Builds a weekly graph of 90,000 merchants and their shared entities, then adds graph features such as two-hop fraud rate to the onboarding model. It caught 38% more bad merchants at the same review volume.",
    category: "Fraud and risk",
    stack: ["NetworkX", "PySpark", "LightGBM"],
    metric: { value: "38%", label: "more bad merchants caught" },
    year: "2024",
    badge: "Best Paper",
    viz: { type: "hub", center: "merchant", nodes: ["cards", "devices", "bank accts", "owners"], caption: "shared entities" },
  },
  {
    title: "CUPED Variance Reduction",
    summary: "Makes A/B tests reach a decision faster by using each user's pre-experiment behaviour.",
    detail:
      "Added CUPED to the experimentation platform with a per-metric covariate chosen automatically. Median variance fell by 42%, so a typical test now needs about 11 days instead of 19.",
    category: "Experimentation",
    stack: ["Python", "SQL", "statsmodels"],
    metric: { value: "42%", label: "less variance per test" },
    year: "2023",
    viz: { type: "compare", before: { label: "before", value: 19, text: "19 days" }, after: { label: "CUPED", value: 11, text: "11 days" }, lowerIsBetter: true, caption: "median test length" },
  },
  {
    title: "Sequential Testing Guardrails",
    summary: "Lets teams check results every day without fooling themselves.",
    detail:
      "Replaced fixed-horizon p-values with always-valid confidence sequences, plus sample ratio mismatch alerts. False positive rate under daily peeking dropped from 23% to 5% in simulation.",
    category: "Experimentation",
    stack: ["Python", "NumPy", "SQL"],
    metric: { value: "5%", label: "false positives with daily peeking" },
    year: "2024",
    viz: { type: "compare", before: { label: "peeking", value: 0.23, text: "23%" }, after: { label: "sequential", value: 0.05, text: "5%" }, lowerIsBetter: true, caption: "false positive rate" },
  },
  {
    title: "Grocery Demand Forecast",
    summary: "Weekly sales forecasts for 140 stores and 22,000 products.",
    detail:
      "A global LightGBM model with price, promotion, holiday and weather features, reconciled across store, region and category so the numbers add up for every team that reads them.",
    category: "Forecasting",
    stack: ["LightGBM", "Python", "Airflow", "PostgreSQL"],
    metric: { value: "8.9%", label: "WMAPE, down from 14.2%" },
    year: "2021",
    viz: { type: "compare", before: { label: "spreadsheet", value: 14.2, text: "14.2%" }, after: { label: "model", value: 8.9, text: "8.9%" }, lowerIsBetter: true, caption: "weekly WMAPE" },
  },
  {
    title: "Fresh Produce Ordering",
    summary: "Turns probabilistic forecasts into daily order quantities for perishables.",
    detail:
      "Quantile forecasts feed a newsvendor rule that balances the cost of an empty shelf against the cost of waste for each product. Spoilage fell 17% in the pilot region with no drop in availability.",
    category: "Forecasting",
    stack: ["Quantile regression", "Python", "SciPy"],
    metric: { value: "17%", label: "less spoilage" },
    year: "2021",
    viz: { type: "steps", steps: ["Quantile forecast per item", "Cost of a stockout vs waste", "Order quantity per store"], caption: "ordering rule" },
  },
  {
    title: "Small Business Cash Flow Forecast",
    summary: "A 30-day balance forecast shown to Fernway's small business customers.",
    detail:
      "Combines recurring payment detection with a hierarchical time series model. The median error on day 30 is 6% of the balance, and customers who see the forecast overdraw 22% less often.",
    category: "Forecasting",
    stack: ["Python", "statsmodels", "SQL"],
    metric: { value: "22%", label: "fewer overdrafts" },
    year: "2025",
    viz: { type: "bars", items: [{ label: "day 7 error", value: 0.02, max: 0.1, text: "2%" }, { label: "day 14 error", value: 0.035, max: 0.1, text: "3.5%" }, { label: "day 30 error", value: 0.06, max: 0.1, text: "6%" }], caption: "median error" },
  },
  {
    title: "Model Drift Monitor",
    summary: "Daily checks that warn the team before a model quietly gets worse.",
    detail:
      "Runs population stability, feature null rates, score distribution and delayed-label checks for every production model, and posts a short summary to the team channel each morning.",
    category: "Data and MLOps",
    stack: ["Python", "Airflow", "MLflow", "SQL"],
    metric: { value: "24", label: "checks per model, every day" },
    year: "2023",
    viz: { type: "count", n: 24, label: "checks per model" },
  },
  {
    title: "Synthetic Fraud Generator",
    summary: "An open-source tool that makes realistic fake payment data for testing fraud models.",
    detail:
      "Simulates customers, merchants and 12 fraud patterns such as card testing and account takeover, so teams can test pipelines without touching real customer data.",
    category: "Data and MLOps",
    stack: ["Python", "NumPy", "pandas"],
    metric: { value: "12", label: "fraud patterns" },
    year: "2024",
    badge: "Open source",
    links: [{ label: "Source", href: "#" }],
    viz: { type: "code", code: "sim = Simulator(cards=50_000)\nsim.add(\"card_testing\", rate=0.002)\nsim.add(\"account_takeover\")\ndf = sim.run(days=90)", caption: "usage" },
  },
  {
    title: "Promotion Uplift Model",
    summary: "Estimates which shoppers a coupon actually changes, not just who would buy anyway.",
    detail:
      "A two-model uplift approach trained on randomised coupon tests. Targeting the top three deciles returned 2.3 dollars per dollar of discount, compared with 1.1 for sending coupons to everyone.",
    category: "Experimentation",
    stack: ["scikit-learn", "Python", "SQL"],
    metric: { value: "2.3x", label: "return per discount dollar" },
    year: "2020",
    viz: { type: "bars", items: [{ label: "everyone", value: 1.1, max: 2.5, text: "1.1x" }, { label: "top 3 deciles", value: 2.3, max: 2.5, text: "2.3x" }], caption: "return per dollar" },
  },
];

export type Publication = {
  title: string;
  /** Conference, journal or event short name. */
  venue: string;
  where: string;
  publisher: string;
  year: string;
  note?: string;
  /** Name of an award, e.g. "Best Paper Award". Highlights the entry. */
  award?: string;
  /** "Paper" or "Talk". Defaults to "Paper". */
  kind?: "Paper" | "Talk";
};

/** Papers and talks. Leave the array empty to hide the section. */
export const publications: Publication[] = [
  {
    title: "Two-Hop Features for Merchant Fraud Detection at Small Scale",
    venue: "AMLF 2024",
    where: "Montreal",
    publisher: "Workshop on Applied Machine Learning in Finance, proceedings",
    year: "2024",
    award: "Best Paper Award",
  },
  {
    title: "Faster Experiments with Fewer Users: CUPED in Payments",
    venue: "Northern Data Summit 2023",
    where: "Toronto",
    publisher: "Conference talk",
    year: "2023",
    kind: "Talk",
    note: "The method behind the CUPED project",
  },
  {
    title: "Reconciling Hierarchical Forecasts for Perishable Retail Demand",
    venue: "Journal of Retail Analytics",
    where: "Vol. 7, Issue 2",
    publisher: "Based on my master's thesis",
    year: "2019",
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: "Modelling", items: ["Gradient boosting", "Time series", "Survival analysis", "Graph features", "Uplift modelling", "PyTorch", "scikit-learn", "LightGBM"] },
  { group: "Experimentation", items: ["A/B testing", "CUPED", "Sequential testing", "Causal inference", "Power analysis", "Bayesian methods"] },
  { group: "Data and MLOps", items: ["SQL", "PySpark", "Airflow", "dbt", "Kafka", "MLflow", "Docker", "Feature stores"] },
  { group: "Languages and tools", items: ["Python", "R", "pandas", "statsmodels", "Git", "Jupyter", "PostgreSQL"] },
];

export const certifications: { name: string; issuer: string; date: string }[] = [
  { name: "Causal Inference for Practitioners", issuer: "Lakemont University Continuing Studies", date: "Oct 2024" },
  { name: "Certified Experimentation Practitioner", issuer: "Northern Analytics Guild", date: "Apr 2023" },
  { name: "Probabilistic Forecasting", issuer: "Open Forecasting Academy", date: "Nov 2020" },
];

/** Contact section copy. The heading's second part is set in italics. */
export const contact = {
  heading: ["Have a decision that needs", "better numbers?"],
  lead: "I'm happy to talk about fraud, forecasting or experimentation work, or to compare notes on a tricky A/B test. Email is best.",
};

/** The on-site agent: example questions shown as chips. Keep them answerable from this file. */
export const agent = {
  suggestions: [
    "What does Sana work on at Fernway?",
    "What's her strongest project?",
    "Has she won any awards?",
    "How does she run A/B tests?",
    "How do I contact her?",
  ],
  /** Pronouns used by the agent's offline answers ("he", "she" or "they"). */
  pronoun: "she" as "he" | "she" | "they",
};
