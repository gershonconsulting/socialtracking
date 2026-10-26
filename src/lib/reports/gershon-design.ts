/**
 * Gershon report design — the same look as client.gershoncrm.com's monthly
 * reports (client repo src/v3-reports.ts), ported 1:1 so every Gershon report
 * reads the same: red left rule + title + month on the right, a tinted banner
 * with the headline, up to four tiles, an optional per-day bar strip, then
 * sections (bars, tables or bullet lines) and a footer.
 *
 * Email HTML uses inline styles only (Gmail strips <style>). The PDF is ONE
 * Letter page, drawn with the shared zero-dependency writer; every string is
 * clipped to its box so real data can never push it past one sheet.
 *
 * Olivier, 2026-10-26: "Use the same design for the reports as
 * client.gershoncrm.com for the monthly reports".
 */
import { MrPdf, strWidth as W, type RGB } from "./monthly/pdf-writer";

export const RED = "#FE1B04", INK = "#1d1d1f", MUT = "#6e6e73", RULE = "#e5e7eb", TINT = "#fafafa", GOOD = "#057642", WARN = "#b76b00";

export interface DTile { label: string; value: string; sub: string; color?: string }
export interface DBar { label: string; value: string; pct: number; color?: string }
export interface DSection {
  title: string;
  bars?: DBar[];
  lines?: string[];
  table?: { head: string[]; rows: string[][]; align?: ("l" | "r")[] };
}
export interface DReport {
  eyebrow: string;  // small line above the title
  title: string;    // big heading
  period: string;   // "September 2026" or "Week of Oct 19"
  headline: string; // banner title
  subline: string;  // banner line
  tiles: DTile[];
  daily?: { date: string; posts: number }[]; // date = YYYY-MM-DD
  dailyCaption?: string;
  sections: DSection[];
  footer: string;
  attachmentNote?: string; // appended to the email footer
}

/** Colour for a % of target: green at 100%+, amber from 60%, red below. */
export function bandColor(p: number | null | undefined): string {
  if (p == null) return MUT;
  return p >= 100 ? GOOD : p >= 60 ? WARN : RED;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Email HTML (inline styles) ───────────────────────────────────────────────
export function designHtml(m: DReport, subject: string): string {
  const tile = (t: DTile) => `<td valign="top" style="width:25%;padding:0 5px 0 0;"><div style="border:1px solid ${RULE};border-top:3px solid ${t.color || INK};border-radius:10px;padding:12px 12px 10px;background:#fff;">
    <div style="font-size:10px;font-weight:700;color:${MUT};letter-spacing:.06em;">${esc(t.label)}</div>
    <div style="font-size:24px;font-weight:800;color:${t.color || INK};margin-top:4px;line-height:1.1;">${esc(t.value)}</div>
    <div style="font-size:11px;color:${MUT};margin-top:4px;">${esc(t.sub)}</div></div></td>`;
  const sec = (s: DSection) => {
    let body = "";
    if (s.bars) body += s.bars.map((b) => `<table style="width:100%;border-collapse:collapse;margin:0 0 8px;"><tr>
        <td style="width:34%;font-size:12px;font-weight:600;padding-right:8px;">${esc(b.label)}</td>
        <td><div style="height:10px;background:#eef0f3;border-radius:99px;overflow:hidden;"><div style="height:10px;width:${Math.max(2, Math.min(100, b.pct))}%;background:${b.color || bandColor(b.pct)};border-radius:99px;"></div></div></td>
        <td style="width:24%;text-align:right;font-size:12px;font-weight:700;color:${b.color || bandColor(b.pct)};padding-left:8px;white-space:nowrap;">${esc(b.value)}</td></tr></table>`).join("");
    if (s.table) {
      const t = s.table;
      body += `<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr>${t.head.map((h, i) => `<th style="text-align:${t.align?.[i] === "r" ? "right" : "left"};font-size:10px;color:${MUT};text-transform:uppercase;letter-spacing:.05em;padding:7px 8px;border-bottom:1px solid ${RULE};background:${TINT};">${esc(h)}</th>`).join("")}</tr>
        ${t.rows.map((r) => `<tr>${r.map((v, i) => `<td style="padding:8px;border-bottom:1px solid ${RULE};text-align:${t.align?.[i] === "r" ? "right" : "left"};${i === 0 ? `color:${RED};font-weight:800;` : ""}${i === 1 ? "font-weight:600;" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}
      </table>`;
    }
    if (s.lines) body += `<ul style="margin:0;padding:0 0 0 18px;">${s.lines.map((l) => `<li style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${INK};">${esc(l)}</li>`).join("")}</ul>`;
    return `<div style="margin:22px 0 0;"><div style="font-size:11px;font-weight:800;color:${MUT};text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid ${RULE};padding-bottom:6px;margin-bottom:10px;">${esc(s.title)}</div>${body}</div>`;
  };
  const daily = m.daily && m.daily.length ? (() => {
    const d = m.daily!;
    const max = Math.max(1, ...d.map((x) => x.posts));
    return `<div style="margin:22px 0 0;"><div style="font-size:11px;font-weight:800;color:${MUT};text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">${esc(m.dailyCaption || "")}</div>
      <table style="width:100%;border-collapse:collapse;height:70px;"><tr>${d.map((x) => `<td valign="bottom" style="padding:0 1px;"><div style="height:${Math.max(2, Math.round((x.posts / max) * 64))}px;background:${x.posts ? RED : "#e7e8eb"};border-radius:2px 2px 0 0;"></div></td>`).join("")}</tr></table>
      <table style="width:100%;font-size:10px;color:${MUT};"><tr><td>${esc(d[0].date.slice(5))}</td><td style="text-align:right;">${esc(d[d.length - 1].date.slice(5))}</td></tr></table></div>`;
  })() : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<div style="max-width:720px;margin:0 auto;padding:22px 14px 34px;">
 <div style="background:#fff;border:1px solid ${RULE};border-radius:14px;padding:24px 24px 20px;">
  <table style="width:100%;border-collapse:collapse;"><tr>
   <td style="border-left:4px solid ${RED};padding-left:12px;"><div style="font-size:11px;font-weight:700;color:${MUT};letter-spacing:.04em;">${esc(m.eyebrow)}</div>
     <div style="font-size:22px;font-weight:800;margin-top:2px;">${esc(m.title)}</div></td>
   <td style="text-align:right;vertical-align:top;"><div style="font-size:18px;font-weight:800;color:${RED};">${esc(m.period)}</div><div style="font-size:10px;font-weight:800;color:${RED};letter-spacing:.12em;">GERSHON.AI</div></td>
  </tr></table>
  <div style="margin:18px 0 16px;padding:14px 16px;background:#fff5f5;border-left:4px solid ${RED};border-radius:8px;">
   <div style="font-size:16px;font-weight:800;">${esc(m.headline)}</div><div style="font-size:13px;color:${INK};margin-top:4px;">${esc(m.subline)}</div></div>
  ${m.tiles.length ? `<table style="width:100%;border-collapse:collapse;"><tr>${m.tiles.slice(0, 4).map(tile).join("")}</tr></table>` : ""}
  ${daily}
  ${m.sections.map(sec).join("")}
  <div style="margin-top:22px;padding-top:10px;border-top:1px solid ${RULE};font-size:10px;color:${MUT};">${esc(m.footer)}${m.attachmentNote ? ` · ${esc(m.attachmentNote)}` : ""}</div>
 </div>
</div></body></html>`;
}

// ── One-page PDF ─────────────────────────────────────────────────────────────
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const C = { RED: hex(RED), INK: hex("#111317"), MUT: hex(MUT), RULE: hex("#E4E2DC"), TINT: hex("#FFF5F5"), WHITE: [1, 1, 1] as RGB, BG: hex("#F5F4F0"), ZERO: hex("#E7E8EB") };
const PW = 612, PH = 792, M = 40, CW = PW - 2 * M;

function clip(s: string, size: number, bold: boolean, max: number): string {
  s = String(s ?? "");
  if (W(s, bold, size) <= max) return s;
  while (s.length && W(s + "…", bold, size) > max) s = s.slice(0, -1);
  return s + "…";
}
function wrap(s: string, size: number, bold: boolean, max: number, maxLines: number): string[] {
  const words = String(s).split(/\s+/), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (W(t, bold, size) <= max) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) lines[maxLines - 1] = clip(lines[maxLines - 1], size, bold, max);
  return lines;
}

export function designPdf(m: DReport): MrPdf {
  const p = new MrPdf(PW, PH);
  let y = PH - M;
  // head
  p.rect(M, y - 6, 4, 36, C.RED);
  p.text(M + 14, y + 16, clip(m.title, 18, true, 330), 18, true, C.INK);
  p.text(M + 14, y + 2, clip(m.eyebrow, 8.5, false, 330), 8.5, false, C.MUT);
  p.rtext(PW - M, y + 16, clip(m.period, 15, true, 180), 15, true, C.RED);
  p.rtext(PW - M, y + 3, "GERSHON.AI", 8, true, C.RED);
  y -= 22;
  p.line(M, y, PW - M, C.INK, 1.2);
  // banner
  y -= 50;
  p.rect(M, y, CW, 42, C.TINT); p.rect(M, y, 3, 42, C.RED);
  p.text(M + 14, y + 25, clip(m.headline, 12.5, true, CW - 26), 12.5, true, C.INK);
  p.text(M + 14, y + 10, clip(m.subline, 8.4, false, CW - 26), 8.4, false, C.INK);
  // tiles
  const tiles = m.tiles.slice(0, 4);
  if (tiles.length) {
    const n = tiles.length, gap = 9, tw = (CW - (n - 1) * gap) / n, h = 60;
    y -= h + 12;
    tiles.forEach((t, i) => {
      const x = M + i * (tw + gap), col = t.color ? hex(t.color) : C.INK;
      p.rect(x, y, tw, h, C.WHITE);
      p.line(x, y, x + tw, C.RULE, 0.6); p.line(x, y + h, x + tw, C.RULE, 0.6);
      p.rect(x, y, 0.6, h, C.RULE); p.rect(x + tw - 0.6, y, 0.6, h, C.RULE);
      p.rect(x, y + h - 3, tw, 3, col);
      p.text(x + 10, y + h - 17, clip(t.label, 6.6, true, tw - 16), 6.6, true, C.MUT);
      p.text(x + 10, y + h - 39, clip(t.value, 20, true, tw - 16), 20, true, col);
      p.text(x + 10, y + 9, clip(t.sub, 6.6, false, tw - 16), 6.6, false, C.MUT);
    });
  }
  // daily bars
  if (m.daily && m.daily.length) {
    y -= 22;
    const L = (m.dailyCaption || "").toUpperCase();
    p.text(M, y, L, 7.5, true, C.MUT); p.line(M + W(L, true, 7.5) + 8, y + 2.5, PW - M, C.RULE, 0.5);
    const h = 64, base = y - 10 - h, n = m.daily.length, bw = CW / n;
    const max = Math.max(1, ...m.daily.map((d) => d.posts));
    m.daily.forEach((d, i) => {
      const bh = d.posts ? Math.max(2, (d.posts / max) * h) : 1.5;
      p.rect(M + i * bw + 1, base, Math.max(1, bw - 2), bh, d.posts ? C.RED : C.ZERO);
    });
    p.text(M, base - 10, m.daily[0].date.slice(5), 6.5, false, C.MUT);
    p.rtext(PW - M, base - 10, m.daily[n - 1].date.slice(5), 6.5, false, C.MUT);
    p.rtext(PW - M, base + h + 2, `max ${max}/day`, 6.5, false, C.MUT);
    y = base - 12;
  }
  // sections
  for (const s of m.sections) {
    if (y < M + 70) break;
    y -= 22;
    const L = s.title.toUpperCase();
    p.text(M, y, clip(L, 7.5, true, CW - 20), 7.5, true, C.MUT);
    if (W(L, true, 7.5) + 8 < CW) p.line(M + W(L, true, 7.5) + 8, y + 2.5, PW - M, C.RULE, 0.5);
    y -= 6;
    if (s.bars) {
      for (const b of s.bars) {
        if (y < M + 40) break;
        y -= 15;
        const col = hex(b.color || bandColor(b.pct)), bx = M + 175, bw = CW - 175 - 110;
        p.text(M, y, clip(b.label, 8, true, 168), 8, true, C.INK);
        p.rect(bx, y - 1, bw, 7, C.ZERO);
        p.rect(bx, y - 1, Math.max(2, (Math.min(100, b.pct) / 100) * bw), 7, col);
        p.rtext(PW - M, y, clip(b.value, 8, true, 104), 8, true, col);
      }
    }
    if (s.table) {
      const t = s.table;
      const cols = t.head.length;
      const widths = t.head.map((_, i) => (i === 0 ? 34 : i === 1 ? 150 : (CW - 184) / Math.max(1, cols - 2)));
      const xs: number[] = []; let acc = M; widths.forEach((w) => { xs.push(acc); acc += w; });
      const row = (vals: string[], bold: boolean, size: number, color: RGB, bg?: RGB) => {
        y -= 15;
        if (bg) p.rect(M, y - 4, CW, 15, bg);
        vals.forEach((v, i) => {
          const right = t.align?.[i] === "r";
          const txt = clip(v, size, bold || i <= 1, widths[i] - 6);
          const col = i === 0 && !bg ? C.RED : color;
          if (right) p.rtext(xs[i] + widths[i] - 4, y, txt, size, bold || i <= 1, col);
          else p.text(xs[i] + 2, y, txt, size, bold || i <= 1, col);
        });
        p.line(M, y - 4, PW - M, C.RULE, 0.4);
      };
      row(t.head.map((h) => h.toUpperCase()), true, 6.6, C.MUT, C.BG);
      for (const r of t.rows) { if (y < M + 40) break; row(r, false, 7.8, C.INK); }
    }
    if (s.lines) {
      for (const l of s.lines) {
        const ls = wrap(l, 8.4, false, CW - 14, 2);
        if (y - ls.length * 11 < M + 24) break;
        y -= 13;
        p.rect(M + 2, y + 2.2, 3.2, 3.2, C.RED);
        ls.forEach((t, i) => { if (i) y -= 11; p.text(M + 12, y, t, 8.4, false, C.INK); });
      }
    }
  }
  // footer
  p.line(M, M + 6, PW - M, C.RULE, 0.5);
  p.text(M, M - 4, clip(m.footer, 6.6, false, 420), 6.6, false, C.MUT);
  p.rtext(PW - M, M - 4, `Generated ${new Date().toISOString().slice(0, 10)}`, 6.6, false, C.MUT);
  return p;
}
