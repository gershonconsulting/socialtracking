/**
 * Build Social Tracking's own Chrome extension — "Social Tracking by
 * Gershon.AI — Post Verifier" — from extension-src/ (v0.4.0).
 *
 * Runs before `next build` ("build" in package.json), so every deploy ships:
 *   public/socialtracking-extension-v<version>.zip   (the download, version in the name)
 *   extension-src/icons/icon{16,48,128}.png          (so extension-src/ is a complete
 *                                                     "Load unpacked" folder)
 *
 * The build FAILS (exit 1) when:
 *   - extension-src/manifest.json's version differs from EXTENSION_LATEST in
 *     src/lib/extension-version.ts — every download link is built from that
 *     constant, so a mismatch would ship a link to a file that does not exist;
 *   - a publishing file (gx-publish.js, gx-personal.js) or a non-Tracking host
 *     slipped into the source tree — this extension verifies, it never publishes.
 *
 * The icon (Gershon red rounded square, white check mark) is drawn by
 * scripts/tracking-icon.mjs in plain JavaScript. Zip entries are STORED with a
 * fixed date, so the same sources always give the same bytes.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { trackingIconPng } from "./tracking-icon.mjs";

const SRC_DIR = "extension-src";
const PUBLIC_DIR = "public";
const FORBIDDEN = ["gx-publish.js", "gx-personal.js", "gx-session-watch.js"];
const EXPECTED_NAME = "Social Tracking by Gershon.AI — Post Verifier";

function fail(msg) {
  console.error("extension: " + msg);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(SRC_DIR, "manifest.json"), "utf8"));
const latestMatch = readFileSync("src/lib/extension-version.ts", "utf8").match(/EXTENSION_LATEST\s*=\s*"([^"]+)"/);
const LATEST = latestMatch ? latestMatch[1] : null;
if (!manifest.version || manifest.version !== LATEST) {
  fail(`manifest version ${manifest.version} != EXTENSION_LATEST ${LATEST} — bump both together.`);
}
if (manifest.name !== EXPECTED_NAME) fail(`manifest name is "${manifest.name}", expected "${EXPECTED_NAME}".`);
for (const f of FORBIDDEN) if (existsSync(join(SRC_DIR, f))) fail(`${f} must not ship in the Tracking extension (no publishing code).`);
const hosts = [...(manifest.host_permissions || []), ...(manifest.content_scripts || []).flatMap((c) => c.matches || [])];
const strange = hosts.filter((h) => !/^https:\/\/((www|fr)\.)?linkedin\.com\/\*$|^https:\/\/(x|twitter)\.com\/\*$|^https:\/\/socialtracking\.gershon\.ai\/\*$/.test(h));
if (strange.length) fail(`unexpected host(s) in the manifest: ${strange.join(", ")}`);

/* ---------- zip (stored) ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = e.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // 1 Jan 2000 — reproducible
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ---------- build ---------- */

// Icons, written into the source folder so it loads unpacked as-is.
mkdirSync(join(SRC_DIR, "icons"), { recursive: true });
for (const size of [16, 48, 128]) writeFileSync(join(SRC_DIR, "icons", `icon${size}.png`), trackingIconPng(size));

const entries = walk(SRC_DIR)
  .map((file) => ({ name: relative(SRC_DIR, file).split(sep).join("/"), data: readFileSync(file) }))
  .filter((e) => !e.name.startsWith(".") && !e.name.endsWith(".md"));
// manifest.json first, then the rest in name order.
entries.sort((a, b) => (a.name === "manifest.json" ? -1 : b.name === "manifest.json" ? 1 : a.name.localeCompare(b.name)));

mkdirSync(PUBLIC_DIR, { recursive: true });
// Older builds of THIS extension are removed so only the current version is served.
for (const f of readdirSync(PUBLIC_DIR)) {
  if (/^socialtracking-extension-v[\d.]+\.zip$/.test(f) && f !== `socialtracking-extension-v${LATEST}.zip`) unlinkSync(join(PUBLIC_DIR, f));
}
const out = join(PUBLIC_DIR, `socialtracking-extension-v${LATEST}.zip`);
writeFileSync(out, writeZip(entries));
console.log(`extension: ${manifest.name} v${LATEST} — ${entries.length} files -> ${out}`);
