import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { education, profile, site, skills } from "./src/data/content.ts";

const abs = (path: string) => new URL(path.replace(/^\//, ""), site.url).href;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const realLinks = Object.values(profile.links).filter((h) => h && h !== "#" && /^https?:/.test(h));

/** Fills index.html's head from content.ts, and serves/emits robots.txt and sitemap.xml. */
const siteMeta = (): Plugin => {
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${abs("sitemap.xml")}\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site.url}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><priority>1.0</priority></url>\n</urlset>\n`;
  const files: Record<string, [string, string]> = {
    "/robots.txt": [robots, "text/plain; charset=utf-8"],
    "/sitemap.xml": [sitemap, "application/xml; charset=utf-8"],
  };
  const serve = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => {
    const f = files[req.url?.split("?")[0] ?? ""];
    if (!f) return next();
    res.setHeader("Content-Type", f[1]);
    res.end(f[0]);
  };
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    url: site.url,
    jobTitle: profile.role,
    ...(profile.company ? { worksFor: { "@type": "Organization", name: profile.company } } : {}),
    ...(education.school ? { alumniOf: { "@type": "CollegeOrUniversity", name: education.school } } : {}),
    address: { "@type": "PostalAddress", addressLocality: profile.location },
    email: `mailto:${profile.email}`,
    knowsAbout: skills.flatMap((g) => g.items).slice(0, 10),
    ...(realLinks.length ? { sameAs: realLinks } : {}),
  };
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: "meta", attrs, injectTo: "head" });
  return {
    name: "site-meta",
    transformIndexHtml() {
      const og = abs(site.ogImage);
      return [
        { tag: "title", children: esc(site.title), injectTo: "head" },
        meta({ name: "description", content: site.description }),
        meta({ name: "author", content: profile.name }),
        meta({ name: "theme-color", content: site.themeColor }),
        { tag: "link", attrs: { rel: "canonical", href: site.url }, injectTo: "head" },
        meta({ property: "og:type", content: "profile" }),
        meta({ property: "og:url", content: site.url }),
        meta({ property: "og:title", content: site.title }),
        meta({ property: "og:description", content: site.description }),
        meta({ property: "og:locale", content: site.locale }),
        meta({ property: "og:image", content: og }),
        meta({ property: "og:image:width", content: "1200" }),
        meta({ property: "og:image:height", content: "630" }),
        meta({ name: "twitter:card", content: "summary_large_image" }),
        ...(site.twitter ? [meta({ name: "twitter:site", content: `@${site.twitter}` })] : []),
        meta({ name: "twitter:title", content: site.title }),
        meta({ name: "twitter:description", content: site.description }),
        meta({ name: "twitter:image", content: og }),
        { tag: "script", attrs: { type: "application/ld+json" }, children: JSON.stringify(person).replace(/</g, "\\u003c"), injectTo: "head" },
        {
          tag: "noscript", injectTo: "body",
          children: `<p style="padding:2rem;font-family:sans-serif;color:#efe7da;background:#12100d">${esc(profile.name)}, ${esc(profile.role)} in ${esc(profile.location)}. Email ${esc(profile.email)}.</p>`,
        },
      ];
    },
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
    },
  };
};

// Locally there is no serverless runtime, so answer the agent's optional LLM
// endpoint with 501 (the same as an unconfigured deployment). The agent then
// falls back to its built-in retrieval answers and nothing logs a 404.
// On Vercel, api/ask.ts handles this route instead.
const askStub = (): Plugin => {
  const handler = (req: { method?: string; url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => {
    if (req.url?.split("?")[0] !== "/api/ask") return next();
    res.statusCode = req.method === "POST" ? 501 : 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: req.method === "POST" ? "LLM not configured locally" : "Use POST" }));
  };
  return {
    name: "ask-stub",
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
};

export default defineConfig({
  plugins: [react(), siteMeta(), askStub()],
  build: {
    // three.js is one ~580 kB file on its own; that is expected.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Split the big libraries into their own cached files.
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return "three";
          if (/[\\/]node_modules[\\/](gsap|lenis)[\\/]/.test(id)) return "gsap";
        },
      },
    },
  },
});
