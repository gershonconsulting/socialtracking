/**
 * Weekly work report — Olivier, 2026-10-26: "make sure there are weekly
 * reports sent to social@".
 *
 * Internal check (not client-facing), so shortfalls ARE shown: for the last
 * full week (Monday–Sunday, local post dates) and for CAMPAIGN + INTERNAL
 * companies only (Social Tracking's scope):
 *   • each active campaign company's posts vs its weekly posting objective
 *     (Settings → Campaign posting objectives, 5/week by default),
 *   • internal companies' activity,
 *   • who is behind or silent, and the best posts of the week.
 *
 * Same design as every Gershon report (lib/reports/gershon-design.ts): body +
 * one-page PDF attached. Idempotent per week in settings.weekly_report_sent.
 */
import prisma from "@/lib/db";
import { objectivesFor } from "@/lib/campaigns/objectives";
import { primaryOrgId } from "@/lib/reports/monthly/data";
import { designHtml, designPdf, bandColor, GOOD, INK, RED, WARN, type DReport } from "@/lib/reports/gershon-design";
import { withAuditBcc } from "@/lib/mail-bcc";
import { PRODUCT_NAME, PRODUCT_VERSION } from "@/lib/product";

export const WEEKLY_SENT_KEY = "weekly_report_sent";
export const WEEKLY_TO = ["social@gershonconsulting.com"];
const FROM = `GC ${PRODUCT_NAME} <reports@gershon.ai>`;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const plural = (n: number, one: string, many = one + "s") => `${fmt(n)} ${n === 1 ? one : many}`;
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const label = (d: string) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
const clip = (s: string, n: number) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length <= n ? t : t.slice(0, n - 1) + "…"; };

export interface WeekWindow { key: string; first: string; last: string; days: string[]; label: string }

/** Today's date in New York (posts are dated in local time). */
function nyToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // YYYY-MM-DD
}

/** The last full Monday–Sunday week before `now`, or the week starting at `monday` (YYYY-MM-DD). */
export function weekWindow(monday?: string | null, now = new Date()): WeekWindow {
  let start: Date;
  if (monday && /^\d{4}-\d{2}-\d{2}$/.test(monday)) {
    start = new Date(`${monday}T00:00:00Z`);
    const dow = (start.getUTCDay() + 6) % 7; // 0 = Monday
    start.setUTCDate(start.getUTCDate() - dow);
  } else {
    const today = new Date(`${nyToday(now)}T00:00:00Z`);
    const dow = (today.getUTCDay() + 6) % 7;
    start = new Date(today);
    start.setUTCDate(today.getUTCDate() - dow - 7);
  }
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return iso(d); });
  return { key: days[0], first: days[0], last: days[6], days, label: `${label(days[0])} – ${label(days[6])}` };
}

type Row = { clientId: string; platform: string; publishedDateLocal: string; likeCount: number; commentCount: number; shareCount: number; postTextSnippet: string | null; postUrl: string | null };

export interface WeeklyCompany {
  id: string; name: string; type: "CAMPAIGN" | "INTERNAL"; active: boolean;
  posts: number; li: number; x: number; eng: number; days: number;
  perWeek: number | null; pct: number | null;
  top: { date: string; net: string; text: string; eng: number } | null;
}
export interface WeeklyData { win: WeekWindow; companies: WeeklyCompany[]; perDay: number[]; prevPosts: number }

export async function loadWeekly(monday?: string | null, now = new Date()): Promise<WeeklyData> {
  const win = weekWindow(monday, now);
  const orgId = await primaryOrgId();
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId, status: { not: "ARCHIVED" }, clientType: { in: ["CAMPAIGN", "INTERNAL"] } },
    select: { id: true, name: true, clientType: true, status: true },
  });
  const ids = clients.map((c) => c.id);
  const prevStart = new Date(`${win.first}T00:00:00Z`); prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(`${win.first}T00:00:00Z`); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const select = { clientId: true, platform: true, publishedDateLocal: true, likeCount: true, commentCount: true, shareCount: true, postTextSnippet: true, postUrl: true } as const;
  const rows = ids.length ? ((await prisma.socialPost.findMany({ where: { clientId: { in: ids }, publishedDateLocal: { gte: win.first, lte: win.last } }, select })) as Row[]) : [];
  const prevPosts = ids.length ? await prisma.socialPost.count({ where: { clientId: { in: ids }, publishedDateLocal: { gte: iso(prevStart), lte: iso(prevEnd) } } }) : 0;
  const obj = await objectivesFor(orgId, clients.filter((c) => c.clientType === "CAMPAIGN"));

  const eng = (r: Row) => (r.likeCount || 0) + (r.commentCount || 0) + (r.shareCount || 0);
  const perDay = win.days.map((d) => rows.filter((r) => r.publishedDateLocal === d).length);
  const companies: WeeklyCompany[] = clients.map((c) => {
    const mine = rows.filter((r) => r.clientId === c.id);
    const posts = mine.length;
    const active = c.status === "ACTIVE";
    const perWeek = c.clientType === "CAMPAIGN" && active ? obj.perWeek(c.id) : null;
    const best = mine.filter((r) => (r.postTextSnippet || "").trim()).sort((a, b) => eng(b) - eng(a))[0];
    return {
      id: c.id, name: c.name, type: c.clientType as "CAMPAIGN" | "INTERNAL", active,
      posts, li: mine.filter((r) => r.platform === "LINKEDIN").length, x: mine.filter((r) => r.platform !== "LINKEDIN").length,
      eng: mine.reduce((s, r) => s + eng(r), 0), days: new Set(mine.map((r) => r.publishedDateLocal)).size,
      perWeek, pct: perWeek ? pctOf(posts, perWeek) : null,
      top: best ? { date: label(best.publishedDateLocal), net: best.platform === "LINKEDIN" ? "LinkedIn" : "X", text: best.postTextSnippet || "", eng: eng(best) } : null,
    };
  });
  return { win, companies, perDay, prevPosts };
}

export function weeklyReport(d: WeeklyData, build: string): { subject: string; report: DReport; pct: number | null } {
  const camp = d.companies.filter((c) => c.perWeek);
  const internal = d.companies.filter((c) => c.type === "INTERNAL");
  const tracked = [...camp, ...internal.filter((c) => c.active)];
  const posts = d.companies.reduce((s, c) => s + c.posts, 0);
  const li = d.companies.reduce((s, c) => s + c.li, 0), x = posts - li;
  const target = camp.reduce((s, c) => s + (c.perWeek || 0), 0);
  const delivered = camp.reduce((s, c) => s + Math.min(c.posts, c.perWeek || 0), 0); // capped per company
  const pct = target ? pctOf(delivered, target) : null;
  const onObj = camp.filter((c) => c.posts >= (c.perWeek || 0));
  const behind = camp.filter((c) => c.posts > 0 && c.posts < (c.perWeek || 0)).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const silent = tracked.filter((c) => c.posts === 0);
  const delta = posts - d.prevPosts;

  const attention: string[] = [];
  for (const c of silent) attention.push(`${c.name} (${c.type === "CAMPAIGN" ? "campaign" : "internal"}): no post this week${c.perWeek ? ` — objective ${c.perWeek}` : ""}.`);
  for (const c of behind) attention.push(`${c.name}: ${c.posts} of ${c.perWeek} posts (${c.pct}%) — ${c.perWeek! - c.posts} short.`);

  const best = d.companies.filter((c) => c.top && c.top.eng > 0).sort((a, b) => b.top!.eng - a.top!.eng).slice(0, 4)
    .map((c) => `${c.name} · ${c.top!.net} · ${c.top!.date} — ${fmt(c.top!.eng)} engagements: "${clip(c.top!.text, 90)}"`);

  const sections: DReport["sections"] = [];
  if (camp.length) {
    sections.push({
      title: "Campaigns — posts vs weekly objective",
      bars: camp.slice().sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).map((c) => ({ label: c.name, value: `${c.posts} / ${c.perWeek} · ${c.pct}%`, pct: c.pct ?? 0, color: bandColor(c.pct) })),
    });
  }
  sections.push({ title: "Needs attention", lines: attention.length ? attention.slice(0, 10) : ["Every campaign reached its weekly objective and every company posted."] });
  if (internal.length) {
    sections.push({
      title: "Internal companies",
      table: {
        head: ["#", "Company", "Posts", "LinkedIn", "X", "Engagement"],
        rows: internal.slice().sort((a, b) => b.posts - a.posts).map((c, i) => [String(i + 1), c.name, fmt(c.posts), fmt(c.li), fmt(c.x), fmt(c.eng)]),
        align: ["l", "l", "r", "r", "r", "r"],
      },
    });
  }
  if (best.length) sections.push({ title: "Best posts of the week", lines: best });

  const headline = pct != null
    ? `Campaigns at ${pct}% of their weekly posting objective`
    : `${plural(posts, "post")} published this week`;
  const subline = `${plural(posts, "post")} (${fmt(li)} LinkedIn · ${fmt(x)} X) · ${onObj.length} of ${camp.length} campaigns on objective · ${plural(silent.length, "silent company", "silent companies")}` +
    (d.prevPosts ? ` · ${delta >= 0 ? "+" : ""}${fmt(delta)} vs previous week` : "");

  const report: DReport = {
    eyebrow: `GC · ${PRODUCT_NAME} · Weekly report`,
    title: "Was the work done this week?",
    period: `Week of ${label(d.win.first)}`,
    headline,
    subline,
    tiles: [
      { label: "OBJECTIVE REACHED", value: pct == null ? "—" : `${pct}%`, sub: target ? `${fmt(delivered)} of ${fmt(target)} campaign posts` : "no active campaign", color: bandColor(pct) },
      { label: "POSTS PUBLISHED", value: fmt(posts), sub: `${fmt(li)} LinkedIn · ${fmt(x)} X`, color: INK },
      { label: "CAMPAIGNS ON OBJECTIVE", value: `${onObj.length} / ${camp.length}`, sub: "reached their weekly posts", color: camp.length && onObj.length === camp.length ? GOOD : WARN },
      { label: "SILENT COMPANIES", value: fmt(silent.length), sub: "campaign + internal, 0 posts", color: silent.length ? RED : GOOD },
    ],
    daily: d.win.days.map((date, i) => ({ date, posts: d.perDay[i] })),
    dailyCaption: `Posts per day · ${DAYS.join(" ")}`,
    sections,
    footer: `${PRODUCT_NAME} by Gershon.AI · ${d.win.label} · campaign + internal companies · ${build}`,
    attachmentNote: "PDF attached.",
  };
  const subject = `GC ${PRODUCT_NAME} — Week of ${label(d.win.first)} — ${pct != null ? `${pct}% of posting objective · ` : ""}${plural(posts, "post")}`;
  return { subject, report, pct };
}

export function weeklyBuildLabel(): string {
  const sha = (process.env.NEXT_PUBLIC_APP_VERSION || "").slice(0, 7);
  return [`${PRODUCT_NAME} v${PRODUCT_VERSION}`, sha].filter(Boolean).join(" · ");
}

export async function renderWeekly(monday?: string | null) {
  const d = await loadWeekly(monday);
  const { subject, report, pct } = weeklyReport(d, weeklyBuildLabel());
  const pdf = designPdf(report);
  return { win: d.win, subject, pct, html: designHtml(report, subject), pdf, filename: `GC-Social-Tracking-week-${d.win.key}.pdf`, data: d };
}

type Sent = Record<string, string>;
async function readSent(): Promise<Sent> {
  const row = await prisma.setting.findUnique({ where: { key: WEEKLY_SENT_KEY } });
  try { const v = JSON.parse(row?.value || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
async function markSent(week: string, note: string) {
  const s = await readSent();
  s[week] = `${new Date().toISOString()} ${note}`;
  const keys = Object.keys(s).sort();
  while (keys.length > 26) delete s[keys.shift() as string];
  const value = JSON.stringify(s);
  await prisma.setting.upsert({ where: { key: WEEKLY_SENT_KEY }, update: { value }, create: { key: WEEKLY_SENT_KEY, value } });
}

export async function runWeeklyReport(opts: { week?: string | null; force?: boolean; dry?: boolean; to?: string[] } = {}) {
  const r = await renderWeekly(opts.week);
  const to = opts.to?.length ? opts.to : WEEKLY_TO;
  if (!opts.force && !opts.to?.length) {
    const sent = (await readSent())[r.win.key];
    if (sent) return { week: r.win.key, skipped: `already sent ${sent}`, subject: r.subject };
  }
  if (opts.dry) return { week: r.win.key, dry: true, to, subject: r.subject };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { week: r.win.key, ok: false, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(withAuditBcc({ from: FROM, to, subject: r.subject, html: r.html, attachments: [{ filename: r.filename, content: r.pdf.base64() }] })),
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) return { week: r.win.key, ok: false, status: res.status, error: body.slice(0, 300) };
  if (!opts.to?.length) await markSent(r.win.key, to.join(","));
  return { week: r.win.key, ok: true, to, subject: r.subject, id: (body.match(/"id"\s*:\s*"([^"]+)"/) || [])[1] };
}
