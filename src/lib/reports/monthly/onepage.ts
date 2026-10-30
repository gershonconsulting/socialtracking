/**
 * Monthly report — v0.7.0 design (Olivier, 2026-10-29: "Monthly Report is also
 * to redesign"), the same look as the in-app one-pager: red header band with the
 * headline number, 4 tiles, what went well + best posts side by side, and a
 * day-by-day posting calendar per company.
 *
 * The CONTENT rules stay in model.ts (one page, positives only, campaigns
 * measured against their posting objective, no followers). So the calendar
 * here shows the days WITH a post; a day without one is plain grey, never red.
 *
 * Two outputs from one view: email HTML (tables + inline styles only — Gmail /
 * Outlook safe) and a ONE-page Letter PDF (pdf-writer.ts, every string clipped).
 */
import { MrPdf, strWidth as W, type RGB } from "./pdf-writer";
import type { CategoryModel, CompanyModel, CompanyMonth, MonthWindow, ReportPost, Tile } from "./model";
import { clipText } from "./model";
import { siteUrl } from "@/lib/site";

export const RED = "#CC3333", RED_DARK = "#a8281f", TINT = "#fdf2f2", INK = "#1d1d1f", MUT = "#6b7280",
  RULE = "#e5e7eb", GOOD = "#16a34a", LI = "#0A66C2", X = "#15171C", EMPTY = "#eef0f3", OFF = "#f7f7f8";

export interface CalRow {
  name: string;
  sub: string;
  value: string; // right-hand figure, e.g. "100%" or "12 posts"
  good: boolean; // value shown green (objective reached)
  /** per day of month: 0 none, 1 LinkedIn, 2 X, 3 both */
  days: number[];
}

export interface OnePageView {
  eyebrow: string;
  title: string; // month, e.g. "September 2026"
  who: string; // "Campaigns" or the company name
  headline: string;
  lead: string;
  big: { value: string; label: string } | null;
  tiles: Tile[];
  wins: Array<[string, string]>;
  top: ReportPost[];
  calendar: { title: string; rows: CalRow[]; year: number; month: number; dim: number };
  extra?: { title: string; items: Array<[string, string]> };
  /** v0.8.0 client one-pager: every post of the month */
  posts?: ReportPost[];
  footer: string;
  cta?: { label: string; href: string };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const flagsOf = (c: CompanyMonth, dim: number) =>
  Array.from({ length: dim }, (_, i) => {
    const li = (c.perDayLi[i] || 0) > 0;
    const x = (c.perDay[i] || 0) - (c.perDayLi[i] || 0) > 0;
    return (li ? 1 : 0) | (x ? 2 : 0);
  });
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function categoryView(win: MonthWindow, m: CategoryModel, companies: CompanyMonth[], build: string): OnePageView {
  const byName = new Map(companies.map((c) => [c.name, c]));
  const rows: CalRow[] = m.rows.map((r) => {
    const c = byName.get(r.name);
    return {
      name: r.name,
      sub: r.target ? `${r.posts} of ${r.target} posts · ${r.perWeek}/week` : `${r.posts} posts · ${fmt(r.eng)} engagements`,
      value: r.pct != null ? `${r.pct}%` : `${fmt(r.eng)}`,
      good: (r.pct ?? 0) >= 100,
      days: c ? flagsOf(c, win.dim) : Array(win.dim).fill(0),
    };
  });
  const objTile = m.tiles.find((t) => t.label === "OBJECTIVE REACHED");
  return {
    eyebrow: "GC · Social Tracking · Monthly report",
    title: `${win.name} ${win.y}`,
    who: m.title,
    headline: m.head,
    lead: m.lead,
    big: objTile ? { value: objTile.value, label: "of objective" } : { value: fmt(m.totals.posts), label: "posts" },
    tiles: m.tiles.slice(0, 4),
    wins: m.highlights.map(([k, who, what]) => [`${titleCase(k)}: ${who}`, what]),
    top: m.top.slice(0, 3),
    calendar: { title: "Company by company — days with a post", rows, year: win.y, month: win.m, dim: win.dim },
    extra: m.delivered?.length ? { title: "Client one-pagers sent", items: [[m.delivered.join(", "), "each received its own one-pager"]] } : undefined,
    footer: `Social Tracking by Gershon.AI · ${build}`,
    cta: { label: `Open the ${win.name} client one-pagers`, href: `${siteUrl()}/onepager?month=${win.key}` },
  };
}

export function companyView(win: MonthWindow, m: CompanyModel, c: CompanyMonth | null): OnePageView {
  const posts = c ? c.li + c.x : 0;
  return {
    eyebrow: "Gershon Consulting · Monthly report",
    title: `${win.name} ${win.y}`,
    who: m.name,
    headline: m.head,
    lead: m.lead,
    big: m.pct != null ? { value: `${m.pct}%`, label: "of objective" } : { value: String(posts), label: "posts" },
    tiles: m.tiles.slice(0, 4),
    wins: m.momentum,
    top: m.top.slice(0, 3),
    calendar: {
      title: "Your posting days",
      rows: c ? [{ name: m.name, sub: `${c.li} LinkedIn · ${c.x} X`, value: `${c.days.length} days`, good: false, days: flagsOf(c, win.dim) }] : [],
      year: win.y, month: win.m, dim: win.dim,
    },
    extra: m.ideas.length ? { title: `Ideas for ${win.nextName}`, items: m.ideas } : undefined,
    posts: c?.all ?? [],
    footer: "Gershon Consulting · US market entry · gershonconsulting.com",
  };
}

const weekend = (v: OnePageView, day: number) => {
  const d = new Date(Date.UTC(v.calendar.year, v.calendar.month, day)).getUTCDay();
  return d === 0 || d === 6;
};
const cellColor = (v: OnePageView, f: number, day: number) =>
  f === 1 ? LI : f === 2 ? X : f === 3 ? LI : weekend(v, day) ? OFF : EMPTY;

// ── Email HTML ───────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const F = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TC = (t: Tile) => (t.color === "good" ? GOOD : t.color === "red" ? RED : INK);
const h2 = (t: string) => `<div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${INK};margin:0 0 10px;"><span style="display:inline-block;width:4px;height:12px;background:${RED};border-radius:2px;vertical-align:-1px;margin-right:7px;"></span>${esc(t)}</div>`;

export function onePageHtml(v: OnePageView, subject: string, note?: string): string {
  const tiles = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${v.tiles.map((t, i) => `
    <td valign="top" width="25%" style="padding:16px 14px;${i ? `border-left:1px solid ${RULE};` : ""}">
      <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:${MUT};">${esc(t.label)}</div>
      <div style="font-size:24px;font-weight:800;color:${TC(t)};margin-top:5px;line-height:1.1;">${esc(t.value)}</div>
      <div style="font-size:11px;color:${MUT};margin-top:4px;line-height:1.35;">${esc(t.sub)}</div></td>`).join("")}</tr></table>`;

  const wins = v.wins.map(([a, b]) => `<tr><td valign="top" style="padding:0 8px 9px 0;width:18px;"><div style="width:16px;height:16px;border-radius:8px;background:${GOOD};color:#fff;font-size:11px;line-height:16px;text-align:center;font-weight:700;">✓</div></td>
    <td style="padding:0 0 9px;font-size:13px;line-height:1.4;color:${INK};"><b>${esc(a)}</b><br><span style="color:${MUT};font-size:12px;">${esc(b)}</span></td></tr>`).join("");

  const top = v.top.map((p, i) => `<tr><td style="padding:0 0 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${i === 0 ? "#f3c9c5" : RULE};background:${i === 0 ? TINT : "#fff"};border-radius:10px;"><tr>
    <td valign="top" style="padding:10px 0 10px 12px;width:26px;"><div style="width:22px;height:22px;border-radius:11px;background:${i === 0 ? RED : INK};color:#fff;font-size:11px;font-weight:800;line-height:22px;text-align:center;">${i + 1}</div></td>
    <td style="padding:10px 12px;"><div style="font-size:12px;color:${INK};line-height:1.4;">${p.url ? `<a href="${esc(p.url)}" style="color:${INK};text-decoration:none;">${esc(clipText(p.text, 120) || "Image or video post")}</a>` : esc(clipText(p.text, 120) || "Image or video post")}</div>
      <div style="font-size:11px;color:${MUT};margin-top:4px;"><b style="color:${INK};">${fmt(p.eng)}</b> engagements · ${esc(p.company)} · ${esc(p.net)} · ${esc(p.date)}</div></td></tr></table></td></tr>`).join("");

  const dim = v.calendar.dim;
  const head = Array.from({ length: dim }, (_, i) => `<td align="center" style="font-size:8px;color:${weekend(v, i + 1) ? "#c0c4cc" : MUT};padding:0 0 3px;">${i + 1}</td>`).join("");
  const calRows = v.calendar.rows.map((r) => `<tr>
    <td style="padding:5px 8px 5px 0;border-top:1px solid #f0f0f0;width:150px;"><div style="font-size:12px;font-weight:700;color:${INK};">${esc(clipText(r.name, 24))}</div><div style="font-size:10px;color:${MUT};">${esc(r.sub)}</div></td>
    ${r.days.map((f, i) => `<td style="padding:5px 1px;border-top:1px solid #f0f0f0;"><div style="height:13px;background:${cellColor(v, f, i + 1)};border-radius:3px;${f === 3 ? `border-bottom:4px solid ${X};height:9px;` : ""}"></div></td>`).join("")}
    <td align="right" style="padding:5px 0 5px 8px;border-top:1px solid #f0f0f0;font-size:13px;font-weight:800;color:${r.good ? GOOD : INK};white-space:nowrap;">${esc(r.value)}</td></tr>`).join("");
  const legend = `<span style="display:inline-block;width:9px;height:9px;background:${LI};border-radius:2px;"></span> LinkedIn &nbsp; <span style="display:inline-block;width:9px;height:9px;background:${X};border-radius:2px;"></span> X &nbsp; <span style="display:inline-block;width:9px;height:5px;background:${LI};border-bottom:4px solid ${X};border-radius:2px;"></span> both`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f2ee;${F};color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(v.lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2ee;"><tr><td align="center" style="padding:24px 12px 36px;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background:#fff;border:1px solid ${RULE};border-radius:16px;overflow:hidden;">
 <tr><td style="background:${RED};background-image:linear-gradient(120deg,${RED} 0%,${RED_DARK} 65%,#6f1a14 100%);padding:26px 28px;color:#fff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
   <td valign="middle">
    <div style="font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#f6d3cf;">${esc(v.eyebrow)} · ${esc(v.who)}</div>
    <div style="font-size:32px;font-weight:800;line-height:1.1;margin-top:6px;color:#fff;">${esc(v.title)}</div>
    <div style="font-size:15px;font-weight:700;margin-top:10px;color:#fff;">${esc(v.headline)}</div>
    <div style="font-size:13px;margin-top:4px;color:#f9e3e1;line-height:1.45;">${esc(v.lead)}</div></td>
   ${v.big ? `<td valign="middle" align="right" style="width:130px;padding-left:16px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" style="width:116px;height:116px;border:8px solid #ffffff;border-radius:66px;color:#fff;">
     <div style="font-size:30px;font-weight:800;line-height:1;">${esc(v.big.value)}</div><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f6d3cf;margin-top:4px;">${esc(v.big.label)}</div></td></tr></table></td>` : ""}
  </tr></table></td></tr>
 <tr><td style="border-bottom:1px solid ${RULE};">${tiles}</td></tr>
 <tr><td style="padding:22px 28px 6px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
   <td valign="top" width="46%" style="padding-right:18px;">${h2("What went well")}<table role="presentation" cellpadding="0" cellspacing="0">${wins}</table></td>
   <td valign="top" width="54%">${v.top.length ? `${h2("Best posts")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top}</table>` : ""}</td>
  </tr></table></td></tr>
 ${v.calendar.rows.length ? `<tr><td style="padding:16px 28px 8px;">${h2(v.calendar.title)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;"><tr><td style="width:150px;"></td>${head}<td style="width:56px;"></td></tr>${calRows}</table>
  <div style="font-size:10px;color:${MUT};margin-top:8px;">${legend}</div></td></tr>` : ""}
 ${v.posts && v.posts.length ? `<tr><td style="padding:16px 28px 0;">${h2(`Everything published (${v.posts.length})`)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${v.posts.slice(0, 40).map((p) => `<tr>
   <td style="padding:5px 8px 5px 0;border-top:1px solid #f0f0f0;font-size:11px;color:${MUT};white-space:nowrap;width:44px;">${esc(p.date)}</td>
   <td style="padding:5px 8px 5px 0;border-top:1px solid #f0f0f0;width:18px;"><span style="display:inline-block;min-width:14px;height:14px;line-height:14px;text-align:center;border-radius:3px;background:${p.net === "LinkedIn" ? LI : X};color:#fff;font-size:8px;font-weight:800;">${p.net === "LinkedIn" ? "in" : "X"}</span></td>
   <td style="padding:5px 8px 5px 0;border-top:1px solid #f0f0f0;font-size:12px;color:${INK};">${p.url ? `<a href="${esc(p.url)}" style="color:${INK};text-decoration:none;">${esc(clipText(p.text, 90) || "Image or video post")}</a>` : esc(clipText(p.text, 90) || "Image or video post")}</td>
   <td align="right" style="padding:5px 0;border-top:1px solid #f0f0f0;font-size:12px;font-weight:700;color:${INK};white-space:nowrap;">${p.eng ? fmt(p.eng) : ""}</td></tr>`).join("")}</table>
  ${v.posts.length > 40 ? `<div style="font-size:11px;color:${MUT};margin-top:6px;">+ ${v.posts.length - 40} more</div>` : ""}</td></tr>` : ""}
 ${v.extra ? `<tr><td style="padding:16px 28px 0;">${h2(v.extra.title)}${v.extra.items.map(([a, b]) => `<div style="border-left:3px solid ${RED};padding:2px 0 2px 12px;margin:0 0 10px;"><div style="font-size:13px;font-weight:700;">${esc(a)}</div><div style="font-size:12px;color:${MUT};margin-top:2px;">${esc(b)}</div></div>`).join("")}</td></tr>` : ""}
 ${v.cta ? `<tr><td style="padding:14px 28px 0;"><a href="${esc(v.cta.href)}" style="display:inline-block;background:${RED};color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:11px 18px;border-radius:8px;">${esc(v.cta.label)}</a></td></tr>` : ""}
 <tr><td style="padding:22px 28px 20px;"><div style="border-top:1px solid ${RULE};padding-top:10px;font-size:10px;color:${MUT};">${esc(v.footer)}${note ? ` · ${esc(note)}` : ""}</div></td></tr>
</table></td></tr></table></body></html>`;
}

// ── One-page PDF (US Letter portrait) ────────────────────────────────────────
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const P = {
  RED: hex(RED), DARK: hex(RED_DARK), DEEP: hex("#6f1a14"), INK: hex(INK), MUT: hex(MUT), RULE: hex(RULE), TINT: hex(TINT),
  GOOD: hex(GOOD), LI: hex(LI), X: hex(X), EMPTY: hex(EMPTY), OFF: hex(OFF), WHITE: [1, 1, 1] as RGB, PINK: hex("#f6d3cf"), BG: hex("#fafafa"),
};
const PW = 612, PH = 792, M = 36, CW = PW - 2 * M;

function clip(s: string, size: number, bold: boolean, max: number): string {
  s = String(s ?? "");
  if (W(s, bold, size) <= max) return s;
  while (s.length && W(s + "…", bold, size) > max) s = s.slice(0, -1);
  return s + "…";
}
function wrap(s: string, size: number, bold: boolean, max: number, maxLines: number): string[] {
  const words = String(s ?? "").split(/\s+/).filter(Boolean), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (W(t, bold, size) <= max) cur = t;
    else { if (cur) lines.push(cur); cur = w; if (lines.length >= maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines) lines[maxLines - 1] = clip(lines[maxLines - 1], size, bold, max);
  return lines;
}
function pdfH2(p: MrPdf, x: number, y: number, t: string) {
  p.rect(x, y - 1, 3, 9, P.RED);
  p.text(x + 8, y, t.toUpperCase(), 7.6, true, P.INK);
}

export function onePagePdf(v: OnePageView): MrPdf {
  const p = new MrPdf(PW, PH);
  // header band (full bleed), stepped to suggest the gradient
  const HB = 132, top = PH - HB;
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = t < 0.65 ? P.RED.map((c, k) => c + (P.DARK[k] - c) * (t / 0.65)) : P.DARK.map((c, k) => c + (P.DEEP[k] - c) * ((t - 0.65) / 0.35));
    p.rect((PW / steps) * i, top, PW / steps + 0.5, HB, a as RGB);
  }
  const bigW = v.big ? 120 : 0;
  p.text(M, PH - 34, clip(`${v.eyebrow} · ${v.who}`.toUpperCase(), 7, true, CW - bigW - 10), 7, true, P.PINK);
  p.text(M, PH - 64, clip(v.title, 26, true, CW - bigW - 10), 26, true, P.WHITE);
  p.text(M, PH - 86, clip(v.headline, 11.5, true, CW - bigW - 10), 11.5, true, P.WHITE);
  wrap(v.lead, 8.6, false, CW - bigW - 10, 2).forEach((l, i) => p.text(M, PH - 101 - i * 11, l, 8.6, false, P.PINK));
  if (v.big) {
    const cx = PW - M - 52, cy = top + HB / 2;
    // a white square "badge" (the writer has no circles)
    p.rect(cx - 50, cy - 40, 100, 80, [1, 1, 1]);
    p.rect(cx - 46, cy - 36, 92, 72, P.DARK);
    p.ctext(cx, cy - 2, clip(v.big.value, 26, true, 88), 26, true, P.WHITE);
    p.ctext(cx, cy - 22, v.big.label.toUpperCase(), 6.5, true, P.PINK);
  }

  // tiles
  let y = top - 66;
  const tw = CW / 4;
  v.tiles.slice(0, 4).forEach((t, i) => {
    const x = M + i * tw;
    if (i) p.rect(x, y + 6, 0.6, 50, P.RULE);
    const col = t.color === "good" ? P.GOOD : t.color === "red" ? P.RED : P.INK;
    p.text(x + (i ? 12 : 0), y + 46, clip(t.label, 6.4, true, tw - 18), 6.4, true, P.MUT);
    p.text(x + (i ? 12 : 0), y + 23, clip(t.value, 20, true, tw - 18), 20, true, col);
    p.text(x + (i ? 12 : 0), y + 10, clip(t.sub, 6.6, false, tw - 18), 6.6, false, P.MUT);
  });
  p.line(M, y - 2, PW - M, P.RULE, 0.6);

  // what went well (left) + best posts (right)
  y -= 22;
  const LW = CW * 0.44, RX = M + LW + 18, RW = CW - LW - 18;
  pdfH2(p, M, y, "What went well");
  if (v.top.length) pdfH2(p, RX, y, "Best posts");
  let ly = y - 18;
  for (const [a, b] of v.wins.slice(0, 4)) {
    p.rect(M, ly - 1, 8, 8, P.GOOD);
    p.text(M + 14, ly, clip(a, 8.4, true, LW - 14), 8.4, true, P.INK);
    const ls = wrap(b, 7.4, false, LW - 14, 2);
    ls.forEach((l, i) => p.text(M + 14, ly - 10 - i * 9, l, 7.4, false, P.MUT));
    ly -= 16 + ls.length * 9;
  }
  let ry = y - 12;
  v.top.slice(0, 3).forEach((t, i) => {
    const h = 44;
    p.rect(RX, ry - h, RW, h, i === 0 ? P.TINT : P.WHITE);
    p.line(RX, ry - h, RX + RW, P.RULE, 0.5); p.line(RX, ry, RX + RW, P.RULE, 0.5);
    p.rect(RX, ry - h, 0.5, h, P.RULE); p.rect(RX + RW - 0.5, ry - h, 0.5, h, P.RULE);
    p.rect(RX + 8, ry - 20, 14, 14, i === 0 ? P.RED : P.INK);
    p.ctext(RX + 15, ry - 16, String(i + 1), 8, true, P.WHITE);
    wrap(t.text || "Image or video post", 7.6, false, RW - 40, 2).forEach((l, k) => p.text(RX + 30, ry - 13 - k * 9.5, l, 7.6, false, P.INK));
    p.text(RX + 30, ry - h + 7, clip(`${fmt(t.eng)} engagements · ${t.company} · ${t.net} · ${t.date}`, 6.8, true, RW - 40), 6.8, true, P.MUT);
    ry -= h + 6;
  });
  y = Math.min(ly, ry) - 10;

  // calendar
  const rows = v.calendar.rows;
  if (rows.length) {
    p.line(M, y + 4, PW - M, P.RULE, 0.6);
    y -= 14;
    pdfH2(p, M, y, v.calendar.title);
    const NW = 150, VW = 44, dim = v.calendar.dim, gw = (CW - NW - VW) / dim;
    y -= 14;
    for (let d = 1; d <= dim; d++) p.ctext(M + NW + (d - 0.5) * gw, y, String(d), 5.6, false, weekend(v, d) ? P.RULE : P.MUT);
    const footRoom = M + 44 + (v.extra ? 18 + 24 * Math.min(2, v.extra.items.length) : 0);
    const rh = Math.max(13, Math.min(24, (y - 8 - footRoom) / Math.max(1, rows.length)));
    let shown = 0;
    for (const r of rows) {
      if (y - rh < footRoom) break;
      y -= rh;
      p.line(M, y + rh - 1, PW - M, hex("#f0f0f0"), 0.4);
      p.text(M, y + rh / 2 + 0.5, clip(r.name, 8, true, NW - 8), 8, true, P.INK);
      if (rh >= 17) p.text(M, y + rh / 2 - 8, clip(r.sub, 6.2, false, NW - 8), 6.2, false, P.MUT);
      r.days.forEach((f, i) => {
        const x = M + NW + i * gw + 0.8, w = gw - 1.6, ch = Math.min(10, rh - 5), cy = y + (rh - ch) / 2;
        const col = f === 1 ? P.LI : f === 2 ? P.X : f === 3 ? P.LI : weekend(v, i + 1) ? P.OFF : P.EMPTY;
        p.rect(x, cy, w, ch, col);
        if (f === 3) p.rect(x, cy, w, ch * 0.4, P.X);
      });
      p.rtext(PW - M, y + rh / 2 - 2, clip(r.value, 9, true, VW - 4), 9, true, r.good ? P.GOOD : P.INK);
      shown++;
    }
    y -= 12;
    if (shown < rows.length) { p.text(M, y, `+ ${rows.length - shown} more companies in the email report`, 6.6, false, P.MUT); y -= 10; }
    const lg = [[P.LI, "LinkedIn"], [P.X, "X"]] as const;
    let lx = M;
    for (const [c, t] of lg) { p.rect(lx, y, 7, 7, c); p.text(lx + 10, y + 1, t, 6.6, false, P.MUT); lx += 16 + W(t, false, 6.6) + 10; }
    p.rect(lx, y, 7, 7, P.LI); p.rect(lx, y, 7, 2.8, P.X); p.text(lx + 10, y + 1, "both", 6.6, false, P.MUT);
    y -= 8;
  }

  // v0.8.0 — every post of the month, two columns, as many as fit above the ideas
  if (v.posts && v.posts.length && y > M + 120) {
    const reserve = v.extra ? 26 + 24 * Math.min(3, v.extra.items.length) : 0;
    y -= 16;
    pdfH2(p, M, y, `Everything published (${v.posts.length})`);
    y -= 13;
    const colW = (CW - 16) / 2, lh = 10.5;
    const perCol = Math.max(0, Math.floor((y - (M + 24 + reserve)) / lh));
    const shown = v.posts.slice(0, perCol * 2);
    shown.forEach((t, i) => {
      const col = i < perCol ? 0 : 1, row = i % perCol;
      const x = M + col * (colW + 16), yy = y - row * lh;
      p.text(x, yy, t.date, 6.6, false, P.MUT);
      p.rect(x + 30, yy - 1.5, 9, 8, t.net === "LinkedIn" ? P.LI : P.X);
      p.ctext(x + 34.5, yy + 0.3, t.net === "LinkedIn" ? "in" : "X", 5, true, P.WHITE);
      p.text(x + 44, yy, clip(t.text || "Image or video post", 7, false, colW - 44 - 26), 7, false, P.INK);
      if (t.eng) p.rtext(x + colW, yy, fmt(t.eng), 7, true, P.INK);
    });
    y -= Math.min(perCol, shown.length) * lh + 2;
    if (shown.length < v.posts.length) { p.text(M, y, `+ ${v.posts.length - shown.length} more in the email`, 6.6, false, P.MUT); y -= 8; }
  }

  // extra (ideas / company reports sent)
  if (v.extra && y > M + 50) {
    y -= 16;
    pdfH2(p, M, y, v.extra.title);
    for (const [a, b] of v.extra.items.slice(0, 3)) {
      if (y < M + 40) break;
      y -= 14;
      p.rect(M, y - 9, 2.5, 19, P.RED);
      p.text(M + 9, y, clip(a, 8.2, true, CW - 12), 8.2, true, P.INK);
      p.text(M + 9, y - 9, clip(b, 7.2, false, CW - 12), 7.2, false, P.MUT);
      y -= 10;
    }
  }

  // footer
  p.line(M, M + 8, PW - M, P.RULE, 0.5);
  p.text(M, M - 2, clip(v.footer, 6.6, false, 400), 6.6, false, P.MUT);
  p.rtext(PW - M, M - 2, `Generated ${new Date().toISOString().slice(0, 10)}`, 6.6, false, P.MUT);
  return p;
}
