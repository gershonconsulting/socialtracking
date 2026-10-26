/**
 * Expected-versus-verified posting, Social Tracking's core rule (v0.4.0).
 *
 * Shared by /dashboard and /summary so both pages always give the same
 * answer. Pure functions, no I/O — unit-tested in tests/attainment.test.mts.
 *
 * THE OBJECTIVE (Olivier, 2026-10-21): "5/5 is my objective" — one post on
 * LinkedIn or X every weekday, from the campaign start. A company with a
 * lower agreed frequency (WALLIX: 3 a week, Settings → Campaign posting
 * objectives) is expected on perWeek/5 of the weekdays. Ten posts on one day
 * still count as ONE day (spec §16.4).
 *
 * EVERY WEEKDAY IN THE PERIOD IS EXACTLY ONE OF (spec §7):
 *   verified — a post was observed that day
 *   pending  — the day is not over yet (today) or still to come
 *   unknown  — no post seen, but no fresh evidence covers that day either
 *              (the accounts were not read since): NOT counted as missed,
 *              and never shown as zero
 *   missing  — no post, and evidence read after that day says so
 *
 *   attainment = verified / (verified + missing + unknown)
 * Unknown stays in the denominator (it is not success) but is shown on its
 * own, and the rate is flagged "provisional" while any unknown remains.
 * Pending is outside the denominator. Dates are UTC calendar days, the same
 * convention the collectors use for SocialPost.publishedDateLocal.
 */

export const DAY_MS = 86_400_000;
/** Evidence older than this is stale: absence after it cannot be concluded. */
export const STALE_EVIDENCE_HOURS = 48;
/** "No post in N weekdays" alert threshold on the dashboard. */
export const QUIET_WEEKDAYS_ALERT = 3;
/** Below this attainment a company is "behind objective". */
export const BEHIND_RATE = 0.8;
export const DEFAULT_PER_WEEK = 5;

export const toD = (s: string) => new Date(s + "T00:00:00Z");
export const toS = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => toS(new Date(toD(s).getTime() + n * DAY_MS));
export const monthKey = (s: string) => s.slice(0, 7);
export function addMonths(mk: string, n: number): string {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function daysInMonth(mk: string): number {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const monthFirst = (mk: string) => `${mk}-01`;
export const monthLast = (mk: string) => `${mk}-${String(daysInMonth(mk)).padStart(2, "0")}`;
export const isWeekday = (s: string) => {
  const d = toD(s).getUTCDay();
  return d !== 0 && d !== 6;
};
export const maxS = (a: string, b: string) => (a > b ? a : b);
export const minS = (a: string, b: string) => (a < b ? a : b);
export function weekdays(from: string, to: string): number {
  if (to < from) return 0;
  let n = 0;
  for (let k = from; k <= to; k = addDays(k, 1)) if (isWeekday(k)) n++;
  return n;
}

export interface Attainment {
  /** Units expected over the whole period (incl. days still to come). */
  expected: number;
  /** Units whose day has passed (verified + missing + unknown). */
  due: number;
  verified: number;
  missing: number;
  unknown: number;
  pending: number;
  /** verified / due; null when nothing was due yet ("not applicable"). */
  rate: number | null;
  /** True while unknown > 0: the rate may still go up once evidence arrives. */
  provisional: boolean;
}

export interface AttainmentInput {
  from: string; // inclusive YYYY-MM-DD
  to: string; // inclusive YYYY-MM-DD
  today: string;
  /** Campaign start (inclusive); null = the whole period counts. */
  start: string | null;
  /** Did the company post on this (weekday) date? */
  posted: (day: string) => boolean;
  /** Last day covered by fresh evidence (date of the last good read); null = never read. */
  evidenceDate: string | null;
  perWeek?: number;
}

export function attainment(i: AttainmentInput): Attainment {
  const f = i.start ? maxS(i.from, i.start) : i.from;
  const t = i.to;
  let vD = 0, mD = 0, uD = 0, pD = 0, all = 0;
  if (t >= f) {
    for (let d = f; d <= t; d = addDays(d, 1)) {
      if (!isWeekday(d)) continue;
      all++;
      if (d <= i.today && i.posted(d)) vD++;
      else if (d >= i.today) pD++;
      // Covered only when an account read happened AFTER that day (a read during
      // the day could miss a later post), so the read's own day is still unknown.
      else if (i.evidenceDate === null || d >= i.evidenceDate) uD++;
      else mD++;
    }
  }
  const factor = Math.min(1, Math.max(0, (i.perWeek ?? DEFAULT_PER_WEEK) / 5));
  const expected = Math.round(all * factor);
  const due = Math.round((vD + mD + uD) * factor);
  const verified = Math.min(vD, due);
  const unknown = Math.min(uD, due - verified);
  const missing = due - verified - unknown;
  const pending = Math.max(0, expected - due);
  return {
    expected,
    due,
    verified,
    missing,
    unknown,
    pending,
    rate: due ? verified / due : null,
    provisional: unknown > 0,
  };
}

/** Weekdays (Mon–Fri) since the last post, up to and excluding today. */
export function weekdaysSince(lastPost: string | null, today: string, start: string | null): number | null {
  const from = lastPost ? addDays(lastPost, 1) : start;
  if (!from) return null;
  return weekdays(from, addDays(today, -1));
}

/**
 * The evidence date of a company: the OLDEST "last good read" among its
 * tracked accounts — a weekday with no post is only known to be empty when
 * every account was read after it. Null when an account was never read.
 */
export function companyEvidence(lastGoodByAccount: Array<string | null>): { at: string | null; date: string | null } {
  if (!lastGoodByAccount.length) return { at: null, date: null };
  if (lastGoodByAccount.some((x) => !x)) return { at: null, date: null };
  const oldest = (lastGoodByAccount as string[]).reduce((a, b) => (a < b ? a : b));
  return { at: oldest, date: oldest.slice(0, 10) };
}

export function isStale(iso: string | null, nowMs: number, hours = STALE_EVIDENCE_HOURS): boolean {
  if (!iso) return true;
  return nowMs - Date.parse(iso) > hours * 3_600_000;
}
