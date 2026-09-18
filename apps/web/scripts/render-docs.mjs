// Renders the repo's Markdown docs (PLAN.md, docs/*.md) to styled HTML pages in
// docs/, in the narrative page's visual language. The Markdown stays the source
// of truth: edit it, then `npm run docs` (also runs before dev and build).
//
// Cross-links: inline-code mentions of another doc (`findings.md`) become links,
// and friction-log references (#41, [46, 47]) link to that entry's anchor.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const SOURCE = "https://github.com/lucasdickey/mercury-demo/blob/main/";

const PAGES = [
  {
    src: "PLAN.md", out: "plan.html", nav: "Plan", title: "Steward Build Plan",
    eyebrow: "Execution plan · rev 2",
    dek: "The plan expected a modest demo. The build brute-forced every step until Mercury said no, and logged each wall. Start with the table below: what I set out to do, how hard I pushed, and where it actually stopped.",
    feature: "brute-force-what-i-expected-vs-how-far-i-pushed",
  },
  { src: "docs/findings.md", out: "findings.html", nav: "Findings", title: "Findings, Ranked", eyebrow: "Findings · ranked BLUF" },
  { src: "docs/api-friction-log.md", out: "api-friction-log.html", nav: "Friction log", title: "API Friction Log", eyebrow: "Friction log · every wall, with a fix", frictionLog: true },
  { src: "docs/direction.md", out: "direction.html", nav: "Direction", title: "Choosing a Direction", eyebrow: "Research · direction" },
  { src: "docs/landscape.md", out: "landscape.html", nav: "Landscape", title: "Agent Banking Landscape", eyebrow: "Research · landscape" },
  { src: "docs/sandbox-surface.md", out: "sandbox-surface.html", nav: "Sandbox", title: "Sandbox Surface", eyebrow: "Recon · what the sandbox seeds" },
  { src: "docs/scope-catalog.md", out: "scope-catalog.html", nav: "Scopes", title: "Token Scope Catalog", eyebrow: "Recon · token scopes" },
  { src: "docs/take-home-brief.md", out: "take-home-brief.html", nav: "Brief", title: "Take-Home Brief", eyebrow: "The assignment" },
];

// Hand-built pages that share the nav.
const NAV = [
  { href: "index.html", label: "Memo" },
  { href: "narrative.html", label: "Narrative" },
  ...PAGES.map((p) => ({ href: p.out, label: p.nav })),
  { href: "explainer.html", label: "Explainer" },
];

const DOC_LINKS = Object.fromEntries([
  ...PAGES.map((p) => [p.src.split("/").pop(), p.out]),
  ["narrative.md", "narrative.html"],
]);

const frictionMax = Math.max(
  ...[...readFileSync(resolve(root, "docs/api-friction-log.md"), "utf8").matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1])),
);

const slug = (text) =>
  text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function makeMarked(page, headings) {
  const renderer = {
    heading({ tokens, depth, text }) {
      const inner = this.parser.parseInline(tokens);
      if (depth === 1) return ""; // the page header carries the title
      const id = slug(text);
      if (depth === 2) headings.push({ id, html: inner });
      return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
    },
  };
  if (page.frictionLog) {
    // Entries are numbered across sections; give each an anchor (#n41).
    renderer.list = function (token) {
      if (!token.ordered) return false;
      const start = token.start === "" ? 1 : Number(token.start);
      const items = token.items.map((item, i) => this.listitem(item).replace(/^<li>/, `<li id="n${start + i}">`)).join("");
      return `<ol${start !== 1 ? ` start="${start}"` : ""}>\n${items}</ol>\n`;
    };
  }
  return new Marked({ gfm: true, renderer });
}

// Rewrites text outside tags, skipping <code>, <pre>, and <a> contents.
function linkify(html, page) {
  const log = page.frictionLog ? "" : "api-friction-log.html";
  const ref = (n) => (Number(n) >= 1 && Number(n) <= frictionMax ? `<a class="ref" href="${log}#n${n}">${n}</a>` : n);
  let depth = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<(code|pre|a)[\s>]/.test(part)) depth++;
        else if (/^<\/(code|pre|a)>/.test(part)) depth = Math.max(0, depth - 1);
        return part;
      }
      if (depth > 0) return part;
      return part
        .replace(/(?<![\w/&;])#(\d{1,3})\b/g, (m, n) => (ref(n) === n ? m : `#${ref(n)}`))
        .replace(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g, (_, list) => `[${list.replace(/\d+/g, ref)}]`);
    })
    .join("")
    .replace(/<code>((?:docs\/)?([\w-]+\.md))<\/code>/g, (m, _full, name) =>
      DOC_LINKS[name] ? `<a href="${DOC_LINKS[name]}"><code>${_full}</code></a>` : m,
    );
}

// Wraps each h2 and what follows it in a <section>; the feature section gets a
// callout and is lifted above the table of contents.
function sectionize(html, page) {
  const parts = html.split(/(?=<h2 id=")/);
  return parts
    .map((part) => {
      const id = part.match(/^<h2 id="([^"]+)"/)?.[1];
      if (!id) return part.trim() ? `<section class="lead">${part}</section>` : "";
      return `<section${id === page.feature ? ' class="feature"' : ""}>${part}</section>`;
    })
    .filter(Boolean);
}

function render(page) {
  const md = readFileSync(resolve(root, page.src), "utf8");
  const headings = [];
  const html = makeMarked(page, headings).parse(md).replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, "</table></div>");
  const sections = sectionize(linkify(html, page), page);
  const feature = sections.find((s) => s.startsWith('<section class="feature"')) ?? "";
  const body = sections.filter((s) => s !== feature).join("\n");
  const toc = headings.length >= 4
    ? `<nav class="toc" aria-label="On this page"><p class="eyebrow">On this page</p><ul>${headings
        .map((h) => `<li><a href="#${h.id}">${h.html.replace(/<\/?a[^>]*>/g, "")}</a></li>`)
        .join("")}</ul></nav>`
    : "";
  const nav = NAV.map((n) => `<a href="${n.href}"${n.href === page.out ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return `<!doctype html>
<!-- Generated from ${page.src} by apps/web/scripts/render-docs.mjs. Edit the Markdown, then run \`npm run docs\`. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(page.title)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧾</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style>
</head>
<body>
<header class="bar"><nav class="site" aria-label="Documents">${nav}</nav></header>
<main class="wrap">
  <header class="top">
    <p class="eyebrow">${escape(page.eyebrow)}</p>
    <h1>${escape(page.title)}</h1>
    ${page.dek ? `<p class="dek">${escape(page.dek)}</p>` : ""}
    <p class="meta">Rendered from <a href="${SOURCE}${page.src}"><code>${page.src}</code></a></p>
  </header>
  <article class="doc">
${feature}
  </article>
  ${toc}
  <article class="doc">
${body}
  </article>
</main>
</body>
</html>
`;
}

const CSS = `
  :root {
    --paper: #f5f7f9; --panel: #ffffff; --ink: #16202c; --muted: #5b6877; --rule: #dce1e7;
    --accent: #1f6f5c; --accent-soft: #e3f0ec; --amber: #9a6414; --amber-soft: #f8eedc;
    --display: "Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif;
    --body: "Source Serif 4", Georgia, "Times New Roman", serif;
    --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #0f151c; --panel: #151d26; --ink: #e6ebf0; --muted: #96a3b1; --rule: #25313f;
      --accent: #5cc3a6; --accent-soft: #15302a; --amber: #e0a84a; --amber-soft: #2c2415;
    }
  }
  :root[data-theme="dark"] {
    --paper: #0f151c; --panel: #151d26; --ink: #e6ebf0; --muted: #96a3b1; --rule: #25313f;
    --accent: #5cc3a6; --accent-soft: #15302a; --amber: #e0a84a; --amber-soft: #2c2415;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { color-scheme: light dark; scroll-padding-top: 64px; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--body); font-size: 17px; line-height: 1.6; }
  a { color: var(--accent); text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
  code { font-family: var(--mono); font-size: 0.82em; background: var(--accent-soft); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
  a code { text-decoration: underline; text-decoration-color: currentColor; }

  .bar { position: sticky; top: 0; z-index: 2; background: color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--rule); }
  .site { max-width: 1040px; margin: 0 auto; padding: 10px 16px; display: flex; gap: 4px 16px; overflow-x: auto; scrollbar-width: none; font-family: var(--mono); font-size: 0.76rem; white-space: nowrap; }
  .site a { color: var(--muted); text-decoration: none; padding: 4px 0; }
  .site a:hover { color: var(--ink); }
  .site a[aria-current="page"] { color: var(--accent); font-weight: 600; }

  .wrap { max-width: 800px; margin: 0 auto; padding: 48px 16px 96px; }
  h1, h2, h3, h4 { font-family: var(--display); line-height: 1.15; text-wrap: balance; }
  h1 { font-size: clamp(2rem, 6vw, 3rem); font-weight: 700; letter-spacing: -0.02em; margin: 8px 0 0; }
  h2 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 12px; }
  h3 { font-size: 1.1rem; font-weight: 700; margin: 32px 0 8px; }
  h4 { font-size: 1rem; margin: 24px 0 8px; }
  .eyebrow { font-family: var(--mono); font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0; }
  .dek { font-size: 1.2rem; color: var(--muted); margin: 16px 0 0; max-width: 36em; }
  .meta { font-family: var(--mono); font-size: 0.74rem; color: var(--muted); margin: 20px 0 0; }
  .meta code { background: none; padding: 0; }

  .toc { margin-top: 32px; padding: 16px 20px; background: var(--panel); border: 1px solid var(--rule); border-radius: 8px; }
  .toc ul { list-style: none; margin: 8px 0 0; padding: 0; columns: 2 16em; column-gap: 32px; font-size: 0.92rem; }
  .toc li { break-inside: avoid; margin: 2px 0; }
  .toc code { background: none; padding: 0; }

  .doc section { margin-top: 56px; }
  .doc section.lead { margin-top: 32px; }
  .doc p, .doc ul, .doc ol, .doc blockquote, .doc pre, .doc .table { margin: 0 0 16px; }
  .doc li { margin: 6px 0; }
  .doc li > p { margin: 0 0 8px; }
  .doc hr { border: 0; border-top: 1px solid var(--rule); margin: 40px 0; }
  .doc blockquote { border-left: 3px solid var(--accent); padding: 4px 0 4px 16px; color: var(--muted); }
  .doc pre { background: #111820; color: #d9e2ea; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; }
  .doc pre code { background: none; padding: 0; font-size: inherit; color: inherit; overflow-wrap: normal; }
  .doc input[type="checkbox"] { margin-right: 6px; }
  .doc li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.2em; }
  .doc ol > li[id] { scroll-margin-top: 64px; }
  .doc ol > li[id]:target { background: var(--amber-soft); outline: 6px solid var(--amber-soft); border-radius: 2px; }
  a.ref { font-variant-numeric: tabular-nums; }

  .table { overflow-x: auto; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; line-height: 1.45; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
  th { font-family: var(--display); font-weight: 700; font-size: 0.85rem; background: var(--accent-soft); }
  tr:last-child td { border-bottom: 0; }

  .doc section.feature { margin: 40px -16px 0; padding: 28px 16px; background: var(--amber-soft); border-top: 3px solid var(--amber); }
  .doc section.feature h2 { font-size: clamp(1.6rem, 4.5vw, 2.1rem); }
  .doc section.feature > p:first-of-type { font-size: 1.12rem; }
  .doc section.feature .table { border-color: color-mix(in srgb, var(--amber) 35%, transparent); }
  .doc section.feature th { background: color-mix(in srgb, var(--amber) 18%, var(--panel)); }
  .doc section.feature td:first-child { color: var(--muted); }
  .doc section.feature td:last-child strong { color: var(--accent); }
  @media (min-width: 832px) { .doc section.feature { margin-inline: -32px; padding-inline: 32px; border-radius: 0 0 10px 10px; } }
`;

for (const page of PAGES) {
  writeFileSync(resolve(root, "docs", page.out), render(page));
}
console.log(`rendered ${PAGES.length} docs → docs/*.html`);
