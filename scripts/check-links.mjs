/**
 * Link check — runs in "build" before next build (v0.6.1).
 *
 * Olivier, 2026-10-29: "Add company does not work anymore. You need to check
 * all links before new releases." Social Tracking was split out of Social and
 * kept components that link to Social-only pages (/admin, /settings,
 * /publishing…). This script FAILS the build when a page that ships links to
 * a route this app does not have.
 *
 * How: start from every page/layout under src/app, follow imports (@/… and
 * relative), and collect internal links in the reachable files —
 * href="/x", href={`/x…`}, router.push("/x"), location.href = "/x",
 * fetch("/api/x"). Each must match a route in src/app (dynamic segments
 * [id] match anything) or a file in public/.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ── routes ──
const routes = [];
for (const f of walk(APP)) {
  const m = f.match(/[\\/](page|route)\.(tsx|ts)$/);
  if (!m) continue;
  const segs = relative(APP, dirname(f)).split(sep).filter((s) => s && !/^\(.*\)$/.test(s));
  routes.push(segs);
}
const publicFiles = new Set(existsSync(join(ROOT, "public")) ? walk(join(ROOT, "public")).map((f) => "/" + relative(join(ROOT, "public"), f).split(sep).join("/")) : []);

function routeExists(path) {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (publicFiles.has(clean)) return true;
  if (/\.(zip|png|svg|ico|pdf|txt|xml)$/.test(clean) && clean.includes("${")) return true;
  const parts = clean.split("/").filter(Boolean);
  return routes.some((r) => {
    if (r.some((s) => s.startsWith("[..."))) {
      const fixed = r.findIndex((s) => s.startsWith("[..."));
      return parts.length >= fixed && r.slice(0, fixed).every((s, i) => s.startsWith("[") || s === parts[i]);
    }
    if (r.length !== parts.length) return false;
    return r.every((s, i) => s.startsWith("[") || parts[i] === s || parts[i].startsWith("${"));
  });
}

// ── reachable files ──
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, base + ".tsx", base + ".ts", base + ".js", base + ".mjs", join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
const entries = walk(APP).filter((f) => /[\\/](page|layout|route|error|global-error)\.(tsx|ts)$/.test(f));
const seen = new Set();
const stack = [...entries];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const r = resolveImport(f, m[1] || m[2]);
    if (r && !seen.has(r)) stack.push(r);
  }
}

// ── links ──
const LINK = [
  /href=\{?\s*["'`](\/[^"'`\s]*)["'`]/g,
  /href:\s*["'`](\/[^"'`\s]*)["'`]/g,
  /router\.(?:push|replace)\(\s*["'`](\/[^"'`\s]*)["'`]/g,
  /location\.href\s*=\s*["'`](\/[^"'`\s]*)["'`]/g,
  /redirect\(\s*["'`](\/[^"'`\s]*)["'`]/g,
  /fetch\(\s*["'`](\/api\/[^"'`\s]*)["'`]/g,
];
const bad = [];
for (const f of seen) {
  if (!/\.(tsx|ts)$/.test(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const re of LINK) {
    for (const m of src.matchAll(re)) {
      let link = m[1];
      // template literal: keep the fixed part up to the first ${…}
      link = link.replace(/\$\{[^}]*\}/g, "${x}");
      if (link.startsWith("//")) continue;
      if (!routeExists(link)) {
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`${relative(ROOT, f)}:${line}  ${m[1]}`);
      }
    }
  }
}

if (bad.length) {
  console.error(`links: ${bad.length} link(s) point to a page this app does not have:\n  ` + [...new Set(bad)].join("\n  "));
  process.exit(1);
}
console.log(`links: ✓ ${seen.size} reachable files checked against ${routes.length} routes`);
