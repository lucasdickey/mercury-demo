// Copies the repo-level docs/ (memo, explainer, logs) into public/docs so the
// deployed app serves them at /docs/*. Runs before dev and build.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../docs");
const dest = resolve(here, "../public/docs");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied docs → ${dest}`);
