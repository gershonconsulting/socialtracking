/**
 * The monthly one-pager (v0.6.0, Olivier 2026-10-29: "a stunning one pager
 * report of what was posted, what happened last month").
 *
 * Pure types + the pure "what happened" maths, kept apart from the database
 * loader (onepager.ts) so the page can be rendered and checked with sample data.
 */
import { addMonths, attainment, daysInMonth, isWeekday, monthFirst, monthLast, minS, type Attainment } from "@/lib/tracking/attainment";
import type { BookCompany } from "@/lib/tracking/book";

export interface OnePost {
  /** company index */
  c: number;
  platform: "LINKEDIN" | "TWITTER";
  date: string; // YYYY-MM-DD (local)
  url: string | null;
  text: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export interface OneFollowers { platform: "LINKEDIN" | "TWITTER"; start: number | null; end: number | null }

export interface OneCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  clientType: string;
  perWeek: number;
  att: Attainment;
  /** same rule for the month before, for the trend arrow */
  prevAtt: Attainment;
  posts: { li: number; x: number };
  eng: number;
  views: number;
  prev: { posts: number; eng: number };
  followers: OneFollowers[];
  /** day of month (1-based) → 1 LinkedIn, 2 X, 3 both */
  days: Record<number, number>;
  /** weekdays due that had no post (after the campaign start, up to the evidence date) */
  missingDays: number[];
}

export interface OnePagerData {
  month: string; // YYYY-MM
  today: string;
  generatedAt: string;
  includeInternal: boolean;
  companies: OneCompany[];
  posts: OnePost[];
  /** more posts in the month than were sent to the page */
  postsTruncated: number;
}

export const monthName = (mk: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
  new Date(`${mk}-01T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** The month a one-pager is about by default: last month (the report is about a finished month). */
export function defaultMonth(today: string): string {
  return addMonths(today.slice(0, 7), -1);
}

export function companyMonth(co: BookCompany, mk: string, today: string): { att: Attainment; prevAtt: Attainment; missingDays: number[] } {
  const att = (from: string, to: string) =>
    attainment({ from, to, today, start: co.campaignStart, perWeek: co.perWeek, evidenceDate: co.evidenceDate, posted: (d) => !!co.posted[d] });
  const end = minS(monthLast(mk), today);
  const pmk = addMonths(mk, -1);
  const missingDays: number[] = [];
  for (let i = 1; i <= daysInMonth(mk); i++) {
    const d = `${mk}-${String(i).padStart(2, "0")}`;
    if (d >= today || !isWeekday(d) || (co.campaignStart && d < co.campaignStart)) continue;
    if (co.posted[d]) continue;
    if (co.evidenceDate && d < co.evidenceDate) missingDays.push(i);
  }
  return { att: att(monthFirst(mk), end), prevAtt: att(monthFirst(pmk), monthLast(pmk)), missingDays };
}

export interface OneTotals {
  att: Attainment;
  prevRate: number | null;
  posts: number;
  li: number;
  x: number;
  prevPosts: number;
  eng: number;
  prevEng: number;
  views: number;
  /** followers gained over the month, summed per company per network where both ends are known */
  followersGained: number | null;
  activeDays: number;
}

export function totals(d: OnePagerData): OneTotals {
  const cs = d.companies;
  const sum = (f: (c: OneCompany) => number) => cs.reduce((s, c) => s + f(c), 0);
  const a = cs.reduce(
    (s, c) => ({
      expected: s.expected + c.att.expected, due: s.due + c.att.due, verified: s.verified + c.att.verified,
      missing: s.missing + c.att.missing, unknown: s.unknown + c.att.unknown, pending: s.pending + c.att.pending,
    }),
    { expected: 0, due: 0, verified: 0, missing: 0, unknown: 0, pending: 0 },
  );
  const p = cs.reduce((s, c) => ({ due: s.due + c.prevAtt.due, v: s.v + c.prevAtt.verified }), { due: 0, v: 0 });
  let gained = 0, known = false;
  for (const c of cs) for (const f of c.followers) if (f.start !== null && f.end !== null) { gained += f.end - f.start; known = true; }
  const days = new Set(d.posts.map((x) => x.date));
  return {
    att: { ...a, rate: a.due ? a.verified / a.due : null, provisional: a.unknown > 0 },
    prevRate: p.due ? p.v / p.due : null,
    posts: sum((c) => c.posts.li + c.posts.x),
    li: sum((c) => c.posts.li),
    x: sum((c) => c.posts.x),
    prevPosts: sum((c) => c.prev.posts),
    eng: sum((c) => c.eng),
    prevEng: sum((c) => c.prev.eng),
    views: sum((c) => c.views),
    followersGained: known ? gained : null,
    activeDays: days.size,
  };
}

const pc = (r: number | null) => (r === null ? "n/a" : `${Math.round(r * 100)}%`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "What happened" — 3 to 6 plain sentences, built only from the numbers on the page. */
export function highlights(d: OnePagerData, t = totals(d)): Array<{ tone: "good" | "bad" | "info"; text: string }> {
  const out: Array<{ tone: "good" | "bad" | "info"; text: string }> = [];
  const cs = d.companies;
  if (!cs.length) return [{ tone: "info", text: "No company in scope for this month." }];
  if (t.att.rate !== null) {
    const trend = t.prevRate === null ? "" : t.att.rate >= t.prevRate ? ` (up from ${pc(t.prevRate)})` : ` (down from ${pc(t.prevRate)})`;
    out.push({
      tone: t.att.rate >= 1 ? "good" : t.att.rate >= 0.8 ? "info" : "bad",
      text: `${pc(t.att.rate)} of the agreed posting days were delivered — ${t.att.verified} of ${t.att.due} weekdays${trend}.`,
    });
  }
  const onTarget = cs.filter((c) => c.att.rate !== null && c.att.rate >= 1);
  if (onTarget.length) out.push({ tone: "good", text: `${plural(onTarget.length, "company")} hit 100% of objective: ${onTarget.map((c) => c.name).join(", ")}.` });
  const behind = cs.filter((c) => c.att.rate !== null && c.att.rate < 0.5).sort((a, b) => (a.att.rate ?? 0) - (b.att.rate ?? 0));
  if (behind.length) out.push({ tone: "bad", text: `Under 50%: ${behind.map((c) => `${c.name} (${pc(c.att.rate)})`).join(", ")}.` });
  if (t.posts) {
    const diff = t.prevPosts ? Math.round(((t.posts - t.prevPosts) / t.prevPosts) * 100) : null;
    out.push({
      tone: "info",
      text: `${plural(t.posts, "post")} published (${t.li} LinkedIn · ${t.x} X)${diff === null ? "" : `, ${diff >= 0 ? "+" : ""}${diff}% vs the month before`}.`,
    });
  }
  const best = cs.filter((c) => c.posts.li + c.posts.x > 0).map((c) => ({ c, epp: c.eng / (c.posts.li + c.posts.x) })).sort((a, b) => b.epp - a.epp)[0];
  if (best && best.epp > 0) out.push({ tone: "good", text: `Best engagement per post: ${best.c.name}, ${best.epp.toFixed(1)} likes + comments + reposts per post.` });
  const top = [...d.posts].sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares))[0];
  if (top && top.likes + top.comments + top.shares > 0) {
    out.push({ tone: "good", text: `Top post: ${cs[top.c]?.name ?? "—"} on ${top.platform === "LINKEDIN" ? "LinkedIn" : "X"}, ${top.likes + top.comments + top.shares} engagements.` });
  }
  if (t.att.unknown) out.push({ tone: "info", text: `${plural(t.att.unknown, "weekday")} could not be verified yet (evidence not fresh) — counted apart, never as a miss.` });
  return out.slice(0, 6);
}
