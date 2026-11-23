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
import { designPdf, bandColor, GOOD, INK, RED, WARN, type DReport } from "@/lib/reports/gershon-design";
import { GRADE_COLOR, arenaScore, campaignScore, competitorScore, gradeOf, shareOfVoice, shortfallAction, sourceLink, weekVerdict, type Grade } from "@/lib/reports/weekly-grade";
import { weeklyEmailHtml } from "@/lib/reports/weekly-email";
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

/**
 * The most recent Monday–Sunday week that ends on or before today (New York),
 * or the week starting at `monday` (YYYY-MM-DD).
 * v0.9.0: on a Sunday this is the week ending today. The Cloudflare cron
 * "30 12 * * 1" fires on SUNDAY (Cloudflare counts 1 = Sunday), so the 2026-11-22
 * send covered Nov 9–15 instead of Nov 16–22. Cron is now "MON", and either day
 * now gives the week that just ended.
 */
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
    start.setUTCDate(today.getUTCDate() - dow - (dow === 6 ? 0 : 7));
  }
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return iso(d); });
  return { key: days[0], first: days[0], last: days[6], days, label: `${label(days[0])} – ${label(days[6])}` };
}

type Row = { id: string; clientId: string; platform: string; publishedDateLocal: string; likeCount: number; commentCount: number; shareCount: number; postTextSnippet: string | null; postUrl: string | null };

export interface WeeklyPost { id: string; clientId: string; company: string; date: string; net: string; text: string; eng: number; url: string | null }

export interface WeeklyCompany {
  id: string; name: string; type: "CAMPAIGN" | "INTERNAL"; active: boolean;
  posts: number; li: number; x: number; eng: number; days: number;
  perWeek: number | null; pct: number | null;
  top: WeeklyPost | null;
}

export interface WeeklyRival { id: string; name: string; posts: number; eng: number; score: number; grade: Grade | null; top: WeeklyPost | null }
export interface WeeklyArena {
  campaignId: string; campaign: string; ours: { posts: number; eng: number };
  rivals: WeeklyRival[]; sov: number | null; score: number | null; grade: Grade | null;
}
export interface WeeklyData { win: WeekWindow; companies: WeeklyCompany[]; perDay: number[]; prevPosts: number; arenas: WeeklyArena[] }

const engOf = (r: Row) => (r.likeCount || 0) + (r.commentCount || 0) + (r.shareCount || 0);
const toPost = (r: Row, company: string): WeeklyPost => ({
  id: r.id, clientId: r.clientId, company, date: label(r.publishedDateLocal), net: r.platform === "LINKEDIN" ? "LinkedIn" : "X",
  text: r.postTextSnippet || "", eng: engOf(r), url: sourceLink(r.postUrl),
});
const bestOf = (rows: Row[]) => rows.filter((r) => (r.postTextSnippet || "").trim()).sort((a, b) => engOf(b) - engOf(a))[0];

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
  const select = { id: true, clientId: true, platform: true, publishedDateLocal: true, likeCount: true, commentCount: true, shareCount: true, postTextSnippet: true, postUrl: true } as const;
  const rows = ids.length ? ((await prisma.socialPost.findMany({ where: { clientId: { in: ids }, publishedDateLocal: { gte: win.first, lte: win.last } }, select })) as Row[]) : [];
  const prevPosts = ids.length ? await prisma.socialPost.count({ where: { clientId: { in: ids }, publishedDateLocal: { gte: iso(prevStart), lte: iso(prevEnd) } } }) : 0;
  const obj = await objectivesFor(orgId, clients.filter((c) => c.clientType === "CAMPAIGN"));

  const perDay = win.days.map((d) => rows.filter((r) => r.publishedDateLocal === d).length);
  const companies: WeeklyCompany[] = clients.map((c) => {
    const mine = rows.filter((r) => r.clientId === c.id);
    const posts = mine.length;
    const active = c.status === "ACTIVE";
    const perWeek = c.clientType === "CAMPAIGN" && active ? obj.perWeek(c.id) : null;
    const best = bestOf(mine);
    return {
      id: c.id, name: c.name, type: c.clientType as "CAMPAIGN" | "INTERNAL", active,
      posts, li: mine.filter((r) => r.platform === "LINKEDIN").length, x: mine.filter((r) => r.platform !== "LINKEDIN").length,
      eng: mine.reduce((s, r) => s + engOf(r), 0), days: new Set(mine.map((r) => r.publishedDateLocal)).size,
      perWeek, pct: perWeek ? pctOf(posts, perWeek) : null,
      top: best ? toPost(best, c.name) : null,
    };
  });

  // Competition — Competitor Watch links (OrgSetting competitors:<campaignId> = [competitorId, …]).
  const arenas: WeeklyArena[] = [];
  const campaigns = companies.filter((c) => c.type === "CAMPAIGN" && c.active);
  if (campaigns.length) {
    const links = await prisma.orgSetting.findMany({
      where: { organizationId: orgId, key: { in: campaigns.map((c) => `competitors:${c.id}`) } },
      select: { key: true, value: true },
    });
    const rivalsOf = new Map<string, string[]>();
    for (const l of links) {
      try {
        const v = JSON.parse(l.value);
        if (Array.isArray(v)) rivalsOf.set(l.key.slice("competitors:".length), v.filter((x): x is string => typeof x === "string").slice(0, 12));
      } catch { /* malformed list — skip */ }
    }
    const rivalIds = [...new Set([...rivalsOf.values()].flat())];
    const [rivalClients, rivalRows] = rivalIds.length
      ? await Promise.all([
          prisma.client.findMany({ where: { id: { in: rivalIds }, status: { not: "ARCHIVED" } }, select: { id: true, name: true } }),
          prisma.socialPost.findMany({ where: { clientId: { in: rivalIds }, publishedDateLocal: { gte: win.first, lte: win.last } }, select, take: 4000 }) as Promise<Row[]>,
        ])
      : [[], [] as Row[]];
    const rivalName = new Map(rivalClients.map((c) => [c.id, c.name]));
    for (const c of campaigns) {
      const list = (rivalsOf.get(c.id) || []).filter((id) => rivalName.has(id));
      if (!list.length) continue;
      const ourPerPost = c.posts ? c.eng / c.posts : 0;
      const rivals: WeeklyRival[] = list.map((id) => {
        const mine = rivalRows.filter((r) => r.clientId === id);
        const eng = mine.reduce((s, r) => s + engOf(r), 0);
        const score = competitorScore(mine.length, eng, ourPerPost);
        const best = bestOf(mine);
        return { id, name: rivalName.get(id)!, posts: mine.length, eng, score, grade: gradeOf(score), top: best ? toPost(best, rivalName.get(id)!) : null };
      }).sort((a, b) => b.score - a.score);
      const score = arenaScore({ posts: c.posts, eng: c.eng }, rivals);
      arenas.push({
        campaignId: c.id, campaign: c.name, ours: { posts: c.posts, eng: c.eng }, rivals,
        sov: shareOfVoice(c.posts, rivals.map((r) => r.posts)), score, grade: gradeOf(score),
      });
    }
  }
  return { win, companies, perDay, prevPosts, arenas };
}

export interface WeeklyModel {
  subject: string; report: DReport; pct: number | null;
  weekGrade: Grade | null; competitionGrade: Grade | null; arenaGrade: Grade | null;
  campaigns: WeeklyCompany[]; internal: WeeklyCompany[]; attention: Array<{ c: WeeklyCompany; text: string }>;
  best: WeeklyPost[]; posts: number; li: number; x: number; delivered: number; target: number; onObj: number; silent: WeeklyCompany[]; delta: number;
}

export function weeklyModel(d: WeeklyData, build: string): WeeklyModel {
  const camp = d.companies.filter((c) => c.perWeek);
  const internal = d.companies.filter((c) => c.type === "INTERNAL");
  const tracked = [...camp, ...internal.filter((c) => c.active)];
  const posts = d.companies.reduce((s, c) => s + c.posts, 0);
  const li = d.companies.reduce((s, c) => s + c.li, 0), x = posts - li;
  const target = camp.reduce((s, c) => s + (c.perWeek || 0), 0);
  const delivered = camp.reduce((s, c) => s + Math.min(c.posts, c.perWeek || 0), 0); // capped per company
  const pct = target ? pctOf(delivered, target) : null;
  const weekGrade = gradeOf(pct);
  const onObj = camp.filter((c) => c.posts >= (c.perWeek || 0)).length;
  const behind = camp.filter((c) => c.posts > 0 && c.posts < (c.perWeek || 0)).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const silent = tracked.filter((c) => c.posts === 0);
  const delta = posts - d.prevPosts;

  // Competition: how strong the rivals were (average of their grades' scores), and how we stood against them.
  const allRivals = d.arenas.flatMap((a) => a.rivals);
  const competitionScore = allRivals.length ? allRivals.reduce((s, r) => s + r.score, 0) / allRivals.length : null;
  const competitionGrade = gradeOf(competitionScore);
  const scored = d.arenas.filter((a) => a.score != null);
  const arenaGrade = gradeOf(scored.length ? scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length : null);

  const attention: Array<{ c: WeeklyCompany; text: string }> = [];
  for (const c of silent) attention.push({ c, text: c.perWeek ? shortfallAction(c.name, 0, c.perWeek) : `${c.name} (internal) published nothing this week — plan at least one post.` });
  for (const c of behind) attention.push({ c, text: shortfallAction(c.name, c.posts, c.perWeek!) });

  const best = d.companies.filter((c) => c.top && c.top.eng > 0).map((c) => c.top!).sort((a, b) => b.eng - a.eng).slice(0, 4);

  // PDF / fallback model (one page) — same design as every Gershon report.
  const sections: DReport["sections"] = [];
  if (camp.length) {
    sections.push({
      title: "Campaigns — grade · posts vs weekly objective",
      bars: camp.slice().sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).map((c) => ({ label: `${gradeOf(campaignScore(c.posts, c.perWeek!))} · ${c.name}`, value: `${c.posts} / ${c.perWeek} · ${c.pct}%`, pct: c.pct ?? 0, color: bandColor(c.pct) })),
    });
  }
  sections.push({ title: "Needs attention", lines: attention.length ? attention.slice(0, 8).map((a) => a.text) : ["Every campaign reached its weekly objective and every company posted."] });
  if (d.arenas.length) {
    sections.push({
      title: "Competition — grade of each rival this week",
      lines: d.arenas.slice(0, 6).map((a) => `${a.campaign} (you: ${a.grade ?? "—"}, ${a.sov ?? 0}% of posts) vs ${a.rivals.slice(0, 3).map((r) => `${r.name} ${r.grade ?? "—"} (${r.posts} posts, ${fmt(r.eng)} eng.)`).join(" · ")}`),
    });
  }
  if (best.length) sections.push({ title: "Best posts of the week", lines: best.map((b) => `${b.company} · ${b.net} · ${b.date} — ${fmt(b.eng)} engagements: "${clip(b.text, 80)}"`) });

  const headline = `Week grade ${weekGrade ?? "—"}${competitionGrade ? ` · Competition grade ${competitionGrade}` : ""} — ${weekVerdict(weekGrade)}`;
  const subline = `${pct != null ? `${pct}% of the posting objective · ` : ""}${plural(posts, "post")} (${fmt(li)} LinkedIn · ${fmt(x)} X) · ${onObj} of ${camp.length} campaigns on objective` +
    (d.prevPosts ? ` · ${delta >= 0 ? "+" : ""}${fmt(delta)} vs previous week` : "");

  const report: DReport = {
    eyebrow: `GC · ${PRODUCT_NAME} · Weekly report`,
    title: "Was the work done this week?",
    period: d.win.label,
    headline,
    subline,
    tiles: [
      { label: "WEEK GRADE", value: weekGrade ?? "—", sub: target ? `${fmt(delivered)} of ${fmt(target)} campaign posts` : "no active campaign", color: weekGrade ? GRADE_COLOR[weekGrade] : INK },
      { label: "COMPETITION GRADE", value: competitionGrade ?? "—", sub: allRivals.length ? `${allRivals.length} rivals · you vs them ${arenaGrade ?? "—"}` : "no rival linked", color: competitionGrade ? GRADE_COLOR[competitionGrade] : INK },
      { label: "POSTS PUBLISHED", value: fmt(posts), sub: `${fmt(li)} LinkedIn · ${fmt(x)} X`, color: INK },
      { label: "CAMPAIGNS ON OBJECTIVE", value: `${onObj} / ${camp.length}`, sub: `${plural(silent.length, "silent company", "silent companies")}`, color: camp.length && onObj === camp.length ? GOOD : silent.length ? RED : WARN },
    ],
    daily: d.win.days.map((date, i) => ({ date, posts: d.perDay[i] })),
    dailyCaption: `Posts per day · ${DAYS.join(" ")}`,
    sections,
    footer: `${PRODUCT_NAME} by Gershon.AI · ${d.win.label} · campaign + internal companies · ${build}`,
    attachmentNote: "PDF attached.",
  };
  const subject = `GC ${PRODUCT_NAME} — Week ${d.win.label} — Grade ${weekGrade ?? "—"}${competitionGrade ? ` · Competition ${competitionGrade}` : ""} · ${pct != null ? `${pct}% of objective · ` : ""}${plural(posts, "post")}`;
  return { subject, report, pct, weekGrade, competitionGrade, arenaGrade, campaigns: camp, internal, attention, best, posts, li, x, delivered, target, onObj, silent, delta };
}

/** Back-compatible name (v0.8.x). */
export function weeklyReport(d: WeeklyData, build: string) {
  const m = weeklyModel(d, build);
  return { subject: m.subject, report: m.report, pct: m.pct };
}

export function weeklyBuildLabel(): string {
  const sha = (process.env.NEXT_PUBLIC_APP_VERSION || "").slice(0, 7);
  return [`${PRODUCT_NAME} v${PRODUCT_VERSION}`, sha].filter(Boolean).join(" · ");
}

export async function renderWeekly(monday?: string | null) {
  const d = await loadWeekly(monday);
  const build = weeklyBuildLabel();
  const m = weeklyModel(d, build);
  const pdf = designPdf(m.report);
  return { win: d.win, subject: m.subject, pct: m.pct, weekGrade: m.weekGrade, competitionGrade: m.competitionGrade, html: weeklyEmailHtml(d, m, build), pdf, filename: `GC-Social-Tracking-week-${d.win.key}.pdf`, data: d };
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
