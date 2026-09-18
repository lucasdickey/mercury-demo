// Renders the Markdown docs to HTML, then copies the repo-level docs/ (memo,
// explainer, rendered pages, logs) into public/docs so the deployed app serves
// them at /docs/*. Runs before dev and build.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./render-docs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../docs");
const dest = resolve(here, "../public/docs");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
// Research notes stay in the repo but aren't published.
const UNPUBLISHED = new Set(["direction.md", "landscape.md", "sandbox-surface.md"]);
cpSync(src, dest, { recursive: true, filter: (path) => !UNPUBLISHED.has(basename(path)) });
console.log(`copied docs → ${dest}`);
