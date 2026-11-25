/**
 * Weekly report e-mail — v0.9.0 design (Olivier, 2026-11-23: "the design of
 * the weekly report is not good enough").
 *
 * Inline styles only (Gmail strips <style>), 680px column, tables for layout.
 * Top to bottom: grade hero (week + competition) → four numbers → campaigns
 * graded → needs attention → best posts → competition graded → internal.
 * Every piece of content carries three choices:
 *   View in Social  → the exact post / company on social.gershon.ai
 *   Original post   → the post on LinkedIn or X
 *   Suggested action→ what to do, with a button into Publish for that company
 */
import { RED, INK, MUT, RULE, GOOD, WARN } from "./gershon-design";
import {
  GRADE_COLOR, TRACKING, bestPostAction, campaignScore, companyLink, competitorAction, gradeOf, postLink, publishLink, weekVerdict,
  type Grade,
} from "./weekly-grade";
import type { WeeklyData, WeeklyModel, WeeklyPost } from "./weekly";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const clip = (s: string, n: number) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length <= n ? t : t.slice(0, n - 1) + "…"; };

function badge(g: Grade | null, size = 22): string {
  const c = g ? GRADE_COLOR[g] : MUT;
  const box = Math.round(size * 1.6);
  return `<span style="display:inline-block;width:${box}px;height:${box}px;line-height:${box}px;text-align:center;border-radius:${Math.round(box / 4)}px;background:${c};color:#fff;font-weight:800;font-size:${size}px;font-family:Georgia,'Times New Roman',serif;">${g ?? "–"}</span>`;
}

function btn(href: string | null, text: string, kind: "solid" | "ghost" = "ghost"): string {
  if (!href) return "";
  const style = kind === "solid"
    ? `background:${RED};color:#fff;border:1px solid ${RED};`
    : `background:#fff;color:${INK};border:1px solid #d1d5db;`;
  return `<a href="${esc(href)}" target="_blank" style="display:inline-block;${style}font-size:12px;font-weight:700;text-decoration:none;padding:6px 11px;border-radius:7px;margin:6px 6px 0 0;white-space:nowrap;">${esc(text)}</a>`;
}

function sectionTitle(t: string, sub?: string): string {
  return `<tr><td style="padding:26px 0 10px;"><div style="font-size:12px;font-weight:800;color:${INK};text-transform:uppercase;letter-spacing:.08em;">${esc(t)}</div>${sub ? `<div style="font-size:12px;color:${MUT};margin-top:3px;">${esc(sub)}</div>` : ""}</td></tr>`;
}

/** One piece of content with its three choices. `actionFor` is the campaign company the action is for. */
function postCard(p: WeeklyPost, opts: { action: string; actionFor: string; tag?: string; tagColor?: string }): string {
  return `<tr><td style="padding:0 0 10px;"><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid ${RULE};border-radius:10px;background:#fff;"><tr><td style="padding:12px 14px;">
    <div style="font-size:12px;color:${MUT};">${opts.tag ? `<span style="color:${opts.tagColor || RED};font-weight:800;">${esc(opts.tag)}</span> · ` : ""}<b style="color:${INK};">${esc(p.company)}</b> · ${esc(p.net)} · ${esc(p.date)} · <b style="color:${INK};">${fmt(p.eng)}</b> engagements</div>
    <div style="font-size:14px;line-height:1.5;color:${INK};margin-top:6px;">“${esc(clip(p.text, 220))}”</div>
    <div style="font-size:12.5px;line-height:1.5;color:#7a3b00;background:#fff8ec;border-left:3px solid ${WARN};padding:7px 10px;margin-top:9px;border-radius:0 6px 6px 0;"><b>Suggested action:</b> ${esc(opts.action)}</div>
    <div>${btn(postLink(p.clientId, p.id), "View in Social ›")}${btn(p.url, "Original post ↗")}${btn(publishLink(opts.actionFor), "Do it in Publish ›", "solid")}</div>
  </td></tr></table></td></tr>`;
}

export function weeklyEmailHtml(d: WeeklyData, m: WeeklyModel, build: string): string {
  const rows: string[] = [];

  // ── Hero: the two grades ────────────────────────────────────────────────────
  const compLine = m.competitionGrade
    ? `Rivals were ${m.competitionGrade === "A" || m.competitionGrade === "B" ? "strong" : m.competitionGrade === "C" ? "average" : "quiet"} this week · you vs them: <b>${m.arenaGrade ?? "–"}</b>`
    : "No competitor linked to a campaign yet (Social → company → Competitor Watch).";
  rows.push(`<tr><td style="padding:0;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
    <td style="width:50%;padding:0 6px 0 0;vertical-align:top;"><div style="border:1px solid ${RULE};border-radius:12px;padding:16px;background:#fff;">
      <table role="presentation" style="border-collapse:collapse;"><tr><td style="padding-right:12px;">${badge(m.weekGrade, 28)}</td><td>
      <div style="font-size:11px;font-weight:800;color:${MUT};letter-spacing:.08em;">WEEK GRADE</div>
      <div style="font-size:15px;font-weight:800;color:${INK};margin-top:2px;">${esc(weekVerdict(m.weekGrade))}</div>
      <div style="font-size:12px;color:${MUT};margin-top:2px;">${m.target ? `${fmt(m.delivered)} of ${fmt(m.target)} planned posts · ${m.pct}%` : "no active campaign"}</div></td></tr></table></div></td>
    <td style="width:50%;padding:0 0 0 6px;vertical-align:top;"><div style="border:1px solid ${RULE};border-radius:12px;padding:16px;background:#fff;">
      <table role="presentation" style="border-collapse:collapse;"><tr><td style="padding-right:12px;">${badge(m.competitionGrade, 28)}</td><td>
      <div style="font-size:11px;font-weight:800;color:${MUT};letter-spacing:.08em;">COMPETITION GRADE</div>
      <div style="font-size:15px;font-weight:800;color:${INK};margin-top:2px;">${(() => { const n = d.arenas.reduce((s, a) => s + a.rivals.length, 0); return `${n} rival${n === 1 ? "" : "s"} watched`; })()}</div>
      <div style="font-size:12px;color:${MUT};margin-top:2px;">${compLine}</div></td></tr></table></div></td>
  </tr></table></td></tr>`);

  // ── Four numbers ────────────────────────────────────────────────────────────
  const tile = (l: string, v: string, s: string, c = INK) => `<td style="width:25%;padding:0 4px;vertical-align:top;"><div style="border-top:3px solid ${c};background:#fff;border-radius:8px;padding:10px 10px 9px;border-left:1px solid ${RULE};border-right:1px solid ${RULE};border-bottom:1px solid ${RULE};">
    <div style="font-size:10px;font-weight:800;color:${MUT};letter-spacing:.06em;">${esc(l)}</div><div style="font-size:22px;font-weight:800;color:${c};margin-top:3px;">${esc(v)}</div><div style="font-size:11px;color:${MUT};margin-top:2px;">${esc(s)}</div></div></td>`;
  const max = Math.max(1, ...d.perDay);
  const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
  const strip = `<table role="presentation" style="width:100%;border-collapse:collapse;height:46px;"><tr>${d.perDay.map((n) => `<td valign="bottom" style="padding:0 2px;"><div style="height:${Math.max(2, Math.round((n / max) * 40))}px;background:${n ? RED : "#e7e8eb"};border-radius:2px 2px 0 0;"></div></td>`).join("")}</tr><tr>${d.perDay.map((n, i) => `<td style="text-align:center;font-size:10px;color:${MUT};padding-top:3px;">${DAYS[i]} ${n}</td>`).join("")}</tr></table>`;
  rows.push(`<tr><td style="padding:12px 0 0;"><table role="presentation" style="width:100%;border-collapse:collapse;margin:0 -4px;"><tr>
    ${tile("POSTS", fmt(m.posts), `${fmt(m.li)} LinkedIn · ${fmt(m.x)} X`)}
    ${tile("ON OBJECTIVE", `${m.onObj}/${m.campaigns.length}`, "campaigns", m.campaigns.length && m.onObj === m.campaigns.length ? GOOD : WARN)}
    ${tile("SILENT", fmt(m.silent.length), "companies, 0 posts", m.silent.length ? RED : GOOD)}
    ${tile("VS LAST WEEK", `${m.delta >= 0 ? "+" : ""}${fmt(m.delta)}`, "posts", m.delta >= 0 ? GOOD : RED)}
  </tr></table></td></tr>
  <tr><td style="padding:12px 0 0;">${strip}</td></tr>`);

  // ── Campaigns graded ────────────────────────────────────────────────────────
  if (m.campaigns.length) {
    rows.push(sectionTitle("Campaigns graded", "Posts published vs the weekly objective (Settings → Campaign posting objectives)."));
    const list = m.campaigns.slice().sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).map((c) => {
      const g = gradeOf(campaignScore(c.posts, c.perWeek!));
      const w = Math.min(100, c.pct ?? 0);
      return `<tr>
        <td style="padding:8px 8px 8px 0;border-bottom:1px solid ${RULE};width:40px;">${badge(g, 14)}</td>
        <td style="padding:8px 8px;border-bottom:1px solid ${RULE};"><a href="${esc(companyLink(c.id))}" style="color:${INK};font-weight:700;font-size:13px;text-decoration:none;">${esc(c.name)}</a>
          <div style="height:7px;background:#eef0f3;border-radius:99px;margin-top:5px;"><div style="height:7px;width:${w}%;background:${g ? GRADE_COLOR[g] : MUT};border-radius:99px;"></div></div></td>
        <td style="padding:8px 0 8px 8px;border-bottom:1px solid ${RULE};text-align:right;font-size:13px;font-weight:700;white-space:nowrap;">${c.posts} / ${c.perWeek}<div style="font-size:11px;color:${MUT};font-weight:400;">${c.pct}%</div></td>
        <td style="padding:8px 0 8px 10px;border-bottom:1px solid ${RULE};text-align:right;white-space:nowrap;">${c.posts < (c.perWeek || 0) ? `<a href="${esc(publishLink(c.id))}" style="font-size:12px;font-weight:700;color:${RED};text-decoration:none;">Fill in Publish ›</a>` : `<span style="font-size:12px;color:${GOOD};font-weight:700;">✓ Done</span>`}</td></tr>`;
    }).join("");
    rows.push(`<tr><td><table role="presentation" style="width:100%;border-collapse:collapse;">${list}</table></td></tr>`);
  }

  // ── Needs attention ─────────────────────────────────────────────────────────
  if (m.attention.length) {
    rows.push(sectionTitle("Needs attention", "What to do about each shortfall."));
    rows.push(m.attention.slice(0, 10).map(({ c, text }) => `<tr><td style="padding:0 0 8px;"><div style="border:1px solid ${RULE};border-left:4px solid ${c.posts ? WARN : RED};border-radius:8px;padding:10px 12px;background:#fff;">
      <div style="font-size:13px;line-height:1.5;color:${INK};">${esc(text)}</div>
      <div>${btn(companyLink(c.id), "View in Social ›")}${c.type === "CAMPAIGN" ? btn(publishLink(c.id), "Do it in Publish ›", "solid") : ""}</div></div></td></tr>`).join(""));
  }

  // ── Best posts ──────────────────────────────────────────────────────────────
  if (m.best.length) {
    rows.push(sectionTitle("Best posts of the week", "Our posts that worked — see them, open the original, act on them."));
    rows.push(m.best.map((p) => postCard(p, { action: bestPostAction(p.company, p.eng), actionFor: p.clientId })).join(""));
  }

  // ── Competition graded ──────────────────────────────────────────────────────
  if (d.arenas.length) {
    rows.push(sectionTitle("Competition graded", "Each rival graded on volume and engagement this week, against the campaign it is watched for."));
    for (const a of d.arenas) {
      const rivalRows = a.rivals.map((r) => `<tr>
        <td style="padding:6px 8px 6px 0;border-bottom:1px solid ${RULE};width:34px;">${badge(r.grade, 12)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${RULE};font-size:13px;"><a href="${esc(companyLink(r.id))}" style="color:${INK};text-decoration:none;font-weight:600;">${esc(r.name)}</a></td>
        <td style="padding:6px 0;border-bottom:1px solid ${RULE};text-align:right;font-size:12px;color:${MUT};white-space:nowrap;">${r.posts} posts · ${fmt(r.eng)} eng.</td></tr>`).join("");
      rows.push(`<tr><td style="padding:0 0 10px;"><div style="border:1px solid ${RULE};border-radius:12px;padding:12px 14px;background:#fafafa;">
        <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
          <td style="vertical-align:middle;"><div style="font-size:11px;font-weight:800;color:${MUT};letter-spacing:.06em;">ARENA</div><a href="${esc(companyLink(a.campaignId))}" style="font-size:15px;font-weight:800;color:${INK};text-decoration:none;">${esc(a.campaign)}</a>
            <div style="font-size:12px;color:${MUT};margin-top:2px;">You: ${a.ours.posts} posts · ${fmt(a.ours.eng)} eng. · ${a.sov ?? 0}% of the posts in your arena</div></td>
          <td style="text-align:right;vertical-align:middle;white-space:nowrap;"><div style="font-size:10px;font-weight:800;color:${MUT};letter-spacing:.06em;margin-bottom:3px;">YOU VS THEM</div>${badge(a.grade, 16)}</td></tr></table>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:8px;background:#fff;border-radius:8px;">${rivalRows}</table></div></td></tr>`);
      for (const r of a.rivals.filter((x) => x.top && x.top.eng > 0).slice(0, 2)) {
        rows.push(postCard(r.top!, { tag: `Rival of ${a.campaign} · grade ${r.grade ?? "–"}`, tagColor: r.grade ? GRADE_COLOR[r.grade] : RED, action: competitorAction(r.name, a.campaign, r.top!.text, r.top!.eng), actionFor: a.campaignId }));
      }
    }
  }

  // ── Internal companies ──────────────────────────────────────────────────────
  if (m.internal.length) {
    rows.push(sectionTitle("Internal companies"));
    rows.push(`<tr><td><table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">${m.internal.slice().sort((a, b) => b.posts - a.posts).map((c) => `<tr>
      <td style="padding:7px 0;border-bottom:1px solid ${RULE};"><a href="${esc(companyLink(c.id))}" style="color:${INK};font-weight:600;text-decoration:none;">${esc(c.name)}</a></td>
      <td style="padding:7px 0;border-bottom:1px solid ${RULE};text-align:right;color:${c.posts ? INK : RED};white-space:nowrap;">${c.posts} posts · ${c.li} LinkedIn · ${c.x} X · ${fmt(c.eng)} eng.</td></tr>`).join("")}</table></td></tr>`);
  }

  const grades = `<span style="font-size:11px;color:${MUT};">Grades: A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F below. Week = planned posts published. Competition = rival volume (5 posts = full) and engagement per post vs the campaign. You vs them = your share of posts and engagement against the strongest rival.</span>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<div style="max-width:680px;margin:0 auto;padding:20px 12px 32px;">
 <div style="background:${INK};border-radius:14px 14px 0 0;padding:18px 22px;">
  <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
   <td><div style="font-size:11px;font-weight:800;color:${RED};letter-spacing:.12em;">GERSHON.AI · SOCIAL TRACKING</div><div style="font-size:22px;font-weight:800;color:#fff;margin-top:3px;">Weekly report</div></td>
   <td style="text-align:right;"><div style="font-size:15px;font-weight:800;color:#fff;">${esc(d.win.label)}</div><div style="font-size:11px;color:#a1a1a6;">Mon – Sun · New York dates</div></td></tr></table>
 </div>
 <div style="background:#f7f7f5;border:1px solid ${RULE};border-top:none;border-radius:0 0 14px 14px;padding:18px 18px 20px;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">${rows.join("\n")}</table>
  <div style="margin-top:18px;">${btn(`${TRACKING}/dashboard`, "Open Social Tracking ›", "solid")}${btn("https://social.gershon.ai/clients", "Open Social ›")}${btn("https://publish.gershon.ai/publishing", "Open Publish ›")}</div>
  <div style="margin-top:16px;padding-top:10px;border-top:1px solid ${RULE};">${grades}<div style="font-size:10px;color:${MUT};margin-top:6px;">${esc(`Social Tracking by Gershon.AI · ${d.win.label} · ${build} · PDF attached.`)}</div></div>
 </div>
</div></body></html>`;
}
