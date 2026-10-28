"use client";

/**
 * Social Tracking — Dashboard, "Campaign command center" (v0.4.0).
 *
 * Port of Social's v4.59 dashboard (answer cards + (1) weekdays with a post vs
 * weekdays due since campaign start, objective 5/week, LinkedIn and X
 * separately, (2) content stock rest-of-month + next month, (3) post success,
 * (4) efficiency month by month), re-scoped to Tracking:
 *   - CAMPAIGN + INTERNAL companies only;
 *   - every weekday is verified / missing / unknown / pending
 *     (lib/tracking/attainment.ts). A day the accounts were not read after is
 *     UNKNOWN — grey, counted apart, never shown as a miss or as zero; a rate
 *     with unknown days is labelled "provisional";
 *   - a "Needs attention" list: behind objective, no post in N weekdays,
 *     stale evidence — each with a link.
 * Followers are per company, never summed across companies.
 * Hand-drawn SVG/CSS only — no charting library on this edge-rendered page.
 */

import { ClientFrames } from "@/components/ui/client-frames";
import { useMemo, useState } from "react";
import { matchesCategory, useViewFilters } from "@/lib/view-filters";
import Link from "next/link";
import {
  CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, Clock,
  Heart, MessageCircle, Repeat2, Eye, ExternalLink, HelpCircle,
} from "lucide-react";
import type { TrackingDashData } from "./dashboard-data";
import type { BookCompany } from "@/lib/tracking/book";
import {
  addDays, addMonths, attainment, daysInMonth, isStale, isWeekday, maxS, minS, monthKey, monthLast,
  weekdays, weekdaysSince, toD, BEHIND_RATE, QUIET_WEEKDAYS_ALERT, STALE_EVIDENCE_HOURS, type Attainment,
} from "@/lib/tracking/attainment";

type W = "lw" | "lm" | "tm" | "ty" | "all";
const WINDOWS: { key: W; label: string }[] = [
  { key: "lw", label: "Last week" },
  { key: "lm", label: "Last month" },
  { key: "tm", label: "This month" },
  { key: "ty", label: "This year" },
  { key: "all", label: "All time" },
];

const C_LI = "#0A66C2";
const C_X = "#15171C";
const C_TARGET = "#D92D20";
const C_UNKNOWN = "#D4D0C7";
const PUBLISH = "https://publish.gershon.ai";

const diffDays = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 86400000);

interface Range {
  monthly: boolean;
  from: string; to: string;          // days (YYYY-MM-DD) or months (YYYY-MM), inclusive
  prevFrom?: string; prevTo?: string;
  prevLabel: string;
}

function rangeFor(w: W, today: string, firstMonth: string | null): Range {
  const mk = monthKey(today);
  const dom = Number(today.slice(8, 10));
  if (w === "lw") {
    const from = addDays(today, -6);
    return { monthly: false, from, to: today, prevFrom: addDays(from, -7), prevTo: addDays(from, -1), prevLabel: "previous 7 days" };
  }
  if (w === "tm") {
    const pm = addMonths(mk, -1);
    const pd = Math.min(dom, daysInMonth(pm));
    return { monthly: false, from: `${mk}-01`, to: today, prevFrom: `${pm}-01`, prevTo: `${pm}-${String(pd).padStart(2, "0")}`, prevLabel: "same days last month" };
  }
  if (w === "lm") {
    const lm = addMonths(mk, -1);
    const pm = addMonths(mk, -2);
    return { monthly: false, from: `${lm}-01`, to: monthLast(lm), prevFrom: `${pm}-01`, prevTo: monthLast(pm), prevLabel: "the month before" };
  }
  if (w === "ty") {
    const y = Number(today.slice(0, 4));
    return { monthly: true, from: `${y}-01`, to: mk, prevFrom: `${y - 1}-01`, prevTo: `${y - 1}-${mk.slice(5)}`, prevLabel: "same period last year" };
  }
  return { monthly: true, from: firstMonth ?? mk, to: mk, prevLabel: "" };
}

/** A range as inclusive days, capped at today. */
function dayBounds(r: { monthly: boolean; from: string; to: string }, today: string): [string, string] {
  const f = r.monthly ? `${r.from}-01` : r.from;
  const t = r.monthly ? monthLast(r.to) : r.to;
  return [f, minS(t, today)];
}

/* ───────── formatting ───────── */
const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
function relTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}
const shortDate = (s: string) => toD(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (mk: string, long = false) =>
  toD(`${mk}-01`).toLocaleDateString("en-US", { month: long ? "long" : "short", year: long ? undefined : "2-digit", timeZone: "UTC" });
const pctTone = (p: number) => (p >= 0.9 ? "#2E7D4F" : p >= 0.6 ? "#F59E0B" : "#D92D20");
const pct = (p: number | null) => (p === null ? "n/a" : `${Math.round(p * 100)}%`);

type DayState = "verified" | "missing" | "unknown" | "pending" | "off";

function dayState(co: BookCompany, d: string, today: string): DayState {
  if (!isWeekday(d) || (co.campaignStart && d < co.campaignStart)) return "off";
  if (d <= today && co.posted[d]) return "verified";
  if (d >= today) return "pending";
  if (!co.evidenceDate || d >= co.evidenceDate) return "unknown";
  return "missing";
}

function att(co: BookCompany, from: string, to: string, today: string): Attainment {
  return attainment({
    from, to, today, start: co.campaignStart, perWeek: co.perWeek, evidenceDate: co.evidenceDate,
    posted: (d) => !!co.posted[d],
  });
}

const sumAtt = (a: Attainment[]) => {
  const s = a.reduce((x, y) => ({
    expected: x.expected + y.expected, due: x.due + y.due, verified: x.verified + y.verified,
    missing: x.missing + y.missing, unknown: x.unknown + y.unknown, pending: x.pending + y.pending,
  }), { expected: 0, due: 0, verified: 0, missing: 0, unknown: 0, pending: 0 });
  return { ...s, rate: s.due ? s.verified / s.due : null, provisional: s.unknown > 0 } as Attainment;
};

/**
 * v0.5.1 (Olivier, 2026-10-28): the dashboard is about our CURRENT CAMPAIGNS.
 * Internal companies only appear when the user ticks "Internal" in the
 * left-menu filter (default selection = Campaign). Rows are re-indexed so
 * every section below only sees the selected companies.
 */
export function TrackingDashboardClient({ data }: { data: TrackingDashData }) {
  const { categories, ready } = useViewFilters();
  const view = useMemo(() => {
    const keep = data.companies
      .map((co, i) => ({ co, i }))
      .filter(({ co }) => (ready ? matchesCategory(co.clientType, categories) : co.clientType === "CAMPAIGN"));
    const remap = new Map(keep.map(({ i }, j) => [i, j]));
    const re = <T extends unknown[]>(rows: T[]) =>
      rows.filter((r) => remap.has(r[0] as number)).map((r) => { const c = [...r] as T; c[0] = remap.get(r[0] as number); return c; });
    return {
      ...data,
      companies: keep.map(({ co }) => co),
      followers: keep.map(({ i }) => data.followers[i]),
      runway: keep.map(({ i }) => data.runway[i]),
      days: re(data.days),
      months: re(data.months),
      stock: re(data.stock),
      top: data.top.filter((t) => remap.has(t.c)).map((t) => ({ ...t, c: remap.get(t.c)! })),
    } as TrackingDashData;
  }, [data, categories, ready]);
  const key = view.companies.map((c) => c.id).join(",");
  return <TrackingDashboardView key={key} data={view} />;
}

function TrackingDashboardView({ data }: { data: TrackingDashData }) {
  const [w, setW] = useState<W>("tm");
  const { companies, today } = data;
  const mk = monthKey(today);
  const nextMk = addMonths(mk, 1);
  const nowMs = useMemo(() => Date.parse(data.generatedAt), [data.generatedAt]);

  const firstMonth = useMemo(() => {
    const starts = companies.map((c) => c.campaignStart).filter((s): s is string => !!s).sort();
    return starts.length ? monthKey(starts[0]) : null;
  }, [companies]);
  const range = useMemo(() => rangeFor(w, today, firstMonth), [w, today, firstMonth]);

  /* ── 1. Weekdays with a post: verified / missing / unknown / pending ── */
  const coverage = useMemo(() => {
    const [f, t] = dayBounds(range, today);
    const cur = companies.map((co) => att(co, f, t, today));
    let prev: Attainment[] | null = null;
    if (range.prevFrom && range.prevTo) {
      const [pf, pt] = dayBounds({ monthly: range.monthly, from: range.prevFrom, to: range.prevTo }, today);
      prev = companies.map((co) => att(co, pf, pt, today));
    }
    // LinkedIn / X separately: weekdays in the window with a post on that network.
    const nets = companies.map((co) => {
      let li = 0, x = 0;
      const from = co.campaignStart ? maxS(f, co.campaignStart) : f;
      for (const [d, flags] of Object.entries(co.posted)) {
        if (d < from || d > t) continue;
        if (flags & 1) li++;
        if (flags & 2) x++;
      }
      return { li, x };
    });
    // Last 13 weeks, Monday-based.
    const dow = (toD(today).getUTCDay() + 6) % 7;
    const week0 = addDays(today, -dow - 7 * 12);
    const weeks = Array.from({ length: 13 }, (_, i) => addDays(week0, i * 7));
    const weekAtt = weeks.map((wk) => sumAtt(companies.map((co) => att(co, wk, addDays(wk, 4), today))));
    return { cur, prev, tot: sumAtt(cur), totPrev: prev ? sumAtt(prev) : null, nets, weeks, weekAtt };
  }, [companies, range, today]);

  /* ── 2. Stock: approved/scheduled content per weekday, rest of month + next month ── */
  const stock = useMemo(() => {
    const tomorrow = addDays(today, 1);
    const restDue = weekdays(tomorrow, monthLast(mk));
    const nextDue = weekdays(`${nextMk}-01`, monthLast(nextMk));
    const READY = new Set(["APPROVED", "SCHEDULED"]);
    const rows = companies.map(() => ({ restReady: new Set<string>(), nextReady: new Set<string>(), nextReview: 0, nextDrafts: 0, undated: 0 }));
    for (const [c, status, d] of data.stock) {
      const r = rows[c];
      if (!d) { if (status === "APPROVED") r.undated++; continue; }
      const inNext = monthKey(d) === nextMk;
      const inRest = d >= tomorrow && monthKey(d) === mk;
      if (READY.has(status)) {
        if (inNext && isWeekday(d)) r.nextReady.add(d);
        if (inRest && isWeekday(d)) r.restReady.add(d);
      } else if (inNext) {
        if (status === "DRAFT") r.nextDrafts++; else r.nextReview++;
      }
    }
    const out = rows.map((r) => ({ rest: r.restReady.size, next: r.nextReady.size, nextReview: r.nextReview, nextDrafts: r.nextDrafts, undated: r.undated }));
    const nextReadyTot = out.reduce((s, r) => s + r.next, 0);
    return {
      restDue, nextDue, rows: out, nextReadyTot,
      nextPct: nextDue && companies.length ? nextReadyTot / (nextDue * companies.length) : 0,
      nextReviewTot: out.reduce((s, r) => s + r.nextReview, 0),
      nextDraftsTot: out.reduce((s, r) => s + r.nextDrafts, 0),
      undatedTot: out.reduce((s, r) => s + r.undated, 0),
    };
  }, [data.stock, companies, today, mk, nextMk]);

  /* ── 3. Post success in the window ── */
  const perf = useMemo(() => {
    const cur = companies.map(() => ({ posts: 0, eng: 0, views: 0 }));
    const prev = companies.map(() => ({ posts: 0, eng: 0, views: 0 }));
    const rows = range.monthly ? data.months : data.days;
    for (const [c, , k, n, e, v] of rows) {
      const tgt = k >= range.from && k <= range.to ? cur : range.prevFrom && k >= range.prevFrom && k <= range.prevTo! ? prev : null;
      if (tgt) { tgt[c].posts += n; tgt[c].eng += e; tgt[c].views += v; }
    }
    const sum = (a: typeof cur) => a.reduce((s, x) => ({ posts: s.posts + x.posts, eng: s.eng + x.eng, views: s.views + x.views }), { posts: 0, eng: 0, views: 0 });
    return { cur, prev, tot: sum(cur), totPrev: sum(prev) };
  }, [data.days, data.months, companies, range]);

  /* ── 4. Efficiency month by month since each campaign started ── */
  const eff = useMemo(() => {
    const byKey = new Map<string, { n: number; e: number }>();
    for (const [c, , k, n, e] of data.months) {
      const r = byKey.get(`${c}|${k}`) ?? { n: 0, e: 0 };
      r.n += n; r.e += e; byKey.set(`${c}|${k}`, r);
    }
    const perCo = companies.map((co, ci) => {
      if (!co.campaignStart) return null;
      const months: { mk: string; cov: number | null; epp: number | null; full: boolean }[] = [];
      for (let m = monthKey(co.campaignStart); m <= mk; m = addMonths(m, 1)) {
        const a = att(co, `${m}-01`, minS(monthLast(m), today), today);
        const pe = byKey.get(`${ci}|${m}`);
        months.push({ mk: m, cov: a.rate, epp: pe && pe.n ? pe.e / pe.n : null, full: m < mk });
      }
      const full = months.filter((x) => x.full);
      const avg = (a: typeof months, f: (x: (typeof months)[0]) => number | null) => {
        const v = a.map(f).filter((x): x is number => x !== null);
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
      };
      const first = full.slice(0, 3), last = full.slice(-3);
      const enough = full.length >= 4;
      return {
        months: months.slice(-12), age: months.length,
        covStart: enough ? avg(first, (x) => x.cov) : null, covNow: enough ? avg(last, (x) => x.cov) : null,
        eppStart: enough ? avg(first, (x) => x.epp) : null, eppNow: enough ? avg(last, (x) => x.epp) : null,
      };
    });
    const cal: { mk: string; cov: number | null; epp: number | null }[] = [];
    for (let i = 11; i >= 0; i--) {
      const m = addMonths(mk, -i);
      const a = sumAtt(companies.filter((co) => co.campaignStart && monthKey(co.campaignStart) <= m).map((co) => att(co, `${m}-01`, minS(monthLast(m), today), today)));
      let n = 0, e = 0;
      companies.forEach((_, ci) => { const pe = byKey.get(`${ci}|${m}`); if (pe) { n += pe.n; e += pe.e; } });
      if (a.due) cal.push({ mk: m, cov: a.rate, epp: n ? e / n : null });
    }
    const valid = perCo.filter((p): p is NonNullable<typeof p> => !!p && p.eppStart !== null && p.eppNow !== null);
    const eppChange = valid.length ? valid.reduce((s, p) => s + (p.eppStart ? (p.eppNow! - p.eppStart) / p.eppStart : 0), 0) / valid.length : null;
    const covValid = perCo.filter((p): p is NonNullable<typeof p> => !!p && p.covStart !== null && p.covNow !== null);
    const covChange = covValid.length ? covValid.reduce((s, p) => s + (p.covNow! - p.covStart!), 0) / covValid.length : null;
    return { perCo, cal, eppChange, covChange, measured: valid.length };
  }, [data.months, companies, mk, today]);

  /* ── Needs attention ── */
  const attention = useMemo(() => {
    type Item = { co: BookCompany; kind: "behind" | "quiet" | "stale"; text: string; href: string; link: string; sev: number };
    const out: Item[] = [];
    companies.forEach((co, i) => {
      const a = coverage.cur[i];
      if (a.rate !== null && a.rate < BEHIND_RATE) {
        out.push({
          co, kind: "behind", sev: 3 - a.rate,
          text: `${pct(a.rate)} of objective ${WINDOWS.find((x) => x.key === w)!.label.toLowerCase()} — ${a.verified} of ${a.due} verified, ${a.missing} missing${a.unknown ? `, ${a.unknown} unknown` : ""}`,
          href: `/clients/${co.id}`, link: "Open company",
        });
      }
      const quiet = weekdaysSince(co.lastPost?.date ?? null, today, co.campaignStart);
      if (quiet !== null && quiet >= QUIET_WEEKDAYS_ALERT) {
        out.push({
          co, kind: "quiet", sev: 2 + quiet / 100,
          text: co.lastPost ? `No post in ${quiet} weekdays (last ${shortDate(co.lastPost.date)})` : `No post seen since the campaign started (${quiet} weekdays)`,
          href: `/clients/${co.id}`, link: "Open company",
        });
      }
      if (!co.accounts.length) {
        out.push({ co, kind: "stale", sev: 1.5, text: "No LinkedIn or X account to verify — nothing can be checked", href: `/clients/${co.id}`, link: "Add accounts" });
      } else if (isStale(co.evidenceAt, nowMs)) {
        const worst = co.accounts.filter((a) => isStale(a.lastGood, nowMs)).map((a) => `${a.platform === "LINKEDIN" ? "LinkedIn" : "X"} ${a.lastGood ? `read ${relTime(a.lastGood)}` : "never read"}`);
        out.push({ co, kind: "stale", sev: 1, text: `Evidence stale (> ${STALE_EVIDENCE_HOURS} h): ${worst.join(", ")}`, href: "/extension", link: "Verify now" });
      }
    });
    return out.sort((a, b) => b.sev - a.sev);
  }, [companies, coverage, today, nowMs, w]);

  const order = companies
    .map((co, i) => ({ co, i, r: coverage.cur[i].rate ?? 2 }))
    .sort((a, b) => a.r - b.r);

  const tot = coverage.tot;
  const totPct = tot.rate ?? 0;
  const prevPct = coverage.totPrev?.rate ?? null;
  const epp = perf.tot.posts ? perf.tot.eng / perf.tot.posts : 0;
  const eppPrev = perf.totPrev.posts ? perf.totPrev.eng / perf.totPrev.posts : 0;
  const hasPrev = !!range.prevFrom;
  const windowLabel = WINDOWS.find((x) => x.key === w)!.label;
  const nCampaign = companies.filter((c) => c.clientType === "CAMPAIGN").length;
  const staleCount = companies.filter((c) => !c.accounts.length || isStale(c.evidenceAt, nowMs)).length;
  const lastRead = companies.flatMap((c) => c.accounts.map((a) => a.lastGood)).filter((x): x is string => !!x).sort().pop() ?? null;
  const [bf, bt] = dayBounds(range, today);

  const top = useMemo(() => {
    const inWin = (d: string) => (range.monthly ? monthKey(d) >= range.from && monthKey(d) <= range.to : d >= range.from && d <= range.to);
    const seen = new Set<string>();
    return data.top
      .filter((t) => inWin(t.date))
      .filter((t) => { const k = `${t.c}|${t.date}|${t.text.slice(0, 40)}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares))
      .slice(0, 5);
  }, [data.top, range]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-red-700 mb-1">Social Tracking · campaign command center · was the agreed work done?</div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1 flex flex-wrap items-center gap-x-1.5">
            <span>{nCampaign} campaign{companies.length - nCampaign ? ` + ${companies.length - nCampaign} internal` : ""} companies · {shortDate(bf)} – {shortDate(bt)}</span>
            <span>·</span>
            <span className={staleCount ? "text-red-700 font-medium" : ""}>
              evidence: last read {relTime(lastRead)}{staleCount ? ` · ${staleCount} stale` : " · all fresh"}
            </span>
          </p>
        </div>
        <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          {WINDOWS.map((o) => (
            <button key={o.key} type="button" onClick={() => setW(o.key)}
              className={"px-3 h-8 whitespace-nowrap text-[13px] font-medium rounded-md transition-colors " +
                (w === o.key ? "bg-red-600 text-white" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {companies.length === 0 && (
        <div className="gx-card p-6 text-sm text-gray-600">No active company in the selected categories — nothing to track.</div>
      )}

      {/* v0.5.0 — one framed card per client: Green ≥ 100% of objective, Orange 50–99%, Red < 50% */}
      <ClientFrames
        title="Clients — posting objective"
        subtitle={`${windowLabel}: verified posting days vs days due. Green = on target · Orange = 50–99% · Red = under 50%`}
        items={companies.map((co, i) => {
          const a = coverage.cur[i];
          return {
            id: co.id, name: co.name, logoUrl: co.logoUrl, href: `/clients/${co.id}`,
            ratio: a.rate,
            tag: co.clientType === "CAMPAIGN" ? "Campaign" : "Internal",
            detail: a.due ? `${a.verified} of ${a.due} days verified${a.unknown ? ` · ${a.unknown} unknown` : ""}` : "nothing due yet",
          };
        })}
      />

      {/* The four answers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Answer
          n={1}
          q="Was the agreed posting done?"
          value={tot.rate === null ? "n/a" : `${Math.round(totPct * 100)}%`}
          tone={tot.rate === null ? undefined : pctTone(totPct)}
          meter={tot.rate === null ? undefined : totPct}
          unit={tot.provisional ? "provisional" : undefined}
          line={<>{tot.verified} of {tot.due} weekdays due were verified · <b>{tot.missing} missing</b>{tot.unknown ? <> · <span className="text-gray-500">{tot.unknown} unknown</span></> : null}</>}
          sub={tot.pending ? `${tot.pending} still pending in this period` : undefined}
          delta={prevPct !== null && tot.rate !== null ? <Delta cur={totPct} prev={prevPct} /> : null}
          deltaLabel={range.prevLabel}
        />
        <Answer
          n={2}
          q={`Stock for ${monthLabel(nextMk, true)}`}
          value={`${Math.round(stock.nextPct * 100)}%`}
          tone={pctTone(stock.nextPct)}
          meter={stock.nextPct}
          line={<>{stock.nextReadyTot} of {stock.nextDue * companies.length} weekdays have approved content</>}
          sub={`${stock.nextReviewTot} with client · ${stock.nextDraftsTot} drafts${stock.undatedTot ? ` · ${stock.undatedTot} approved, no date` : ""}`}
        />
        <Answer
          n={3}
          q="How successful are the posts?"
          value={perf.tot.posts ? epp.toFixed(1) : "—"}
          unit="engagements / post"
          line={<>{fmt(perf.tot.posts)} posts · {fmt(perf.tot.eng)} engagements{perf.tot.views ? ` · ${fmt(perf.tot.views)} views` : ""}</>}
          delta={hasPrev && perf.tot.posts ? <Delta cur={epp} prev={eppPrev} /> : null}
          deltaLabel={range.prevLabel}
        />
        <Answer
          n={4}
          q="Getting more efficient?"
          value={eff.eppChange === null ? "—" : `${eff.eppChange >= 0 ? "+" : ""}${Math.round(eff.eppChange * 100)}%`}
          tone={eff.eppChange === null ? undefined : eff.eppChange >= 0 ? "#2E7D4F" : "#D92D20"}
          unit="engagement / post since start"
          line={eff.measured
            ? <>Last 3 months vs first 3 months of each campaign ({eff.measured} of {companies.length} companies)</>
            : <>Needs 4 full campaign months per company</>}
          sub={eff.covChange !== null ? `Weekdays verified: ${eff.covChange >= 0 ? "+" : ""}${Math.round(eff.covChange * 100)} pts since start` : undefined}
        />
      </div>

      {/* Needs attention */}
      <section className="gx-card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className={attention.length ? "text-red-600" : "text-green-700"} />
            <h2 className="text-base font-semibold text-gray-900">Needs attention</h2>
            <span className="text-xs text-gray-500">behind objective (&lt; {Math.round(BEHIND_RATE * 100)}%) · no post in {QUIET_WEEKDAYS_ALERT}+ weekdays · evidence older than {STALE_EVIDENCE_HOURS} h</span>
          </div>
          <span className={"gx-pill " + (attention.length ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800")}>{attention.length || "Nothing"}</span>
        </div>
        {attention.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-600 flex items-center gap-2"><CheckCircle2 size={15} className="text-green-700" /> Every company is on objective, posting, and freshly verified.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {attention.map((a, k) => (
              <li key={k} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className={"gx-pill shrink-0 w-[92px] justify-center " + (a.kind === "behind" ? "bg-red-50 text-red-700" : a.kind === "quiet" ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-700")}>
                  {a.kind === "behind" ? "Behind" : a.kind === "quiet" ? "Quiet" : "Evidence"}
                </span>
                <Logo co={a.co} />
                <span className="font-medium text-gray-900 shrink-0">{a.co.name}</span>
                <span className="text-gray-600 truncate flex-1 min-w-0">{a.text}</span>
                <Link href={a.href} className="shrink-0 text-xs font-medium text-red-700 hover:underline">{a.link} →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 1 — Objective tracker */}
      <section className="gx-card overflow-hidden">
        <SectionHead n={1} title="Posting objective — weekdays with a post vs weekdays due"
          sub={`${windowLabel} · since each campaign start · furthest from 100% first · a day counts once, LinkedIn or X · grey = not verifiable yet (evidence not fresh)`} />
        <div className="grid lg:grid-cols-5">
          <div className="lg:col-span-3 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <th className="px-5 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Verified / due</th>
                  <th className="px-3 py-2.5 font-medium">LinkedIn</th>
                  <th className="px-3 py-2.5 font-medium">X</th>
                  <th className="px-3 py-2.5 font-medium">Last 13 weeks</th>
                </tr>
              </thead>
              <tbody>
                {order.map(({ co, i }) => {
                  const c = coverage.cur[i];
                  const p = coverage.prev?.[i];
                  const n = coverage.nets[i];
                  return (
                    <tr key={co.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link href={`/clients/${co.id}`} className="flex items-center gap-2.5 group">
                          <Logo co={co} />
                          <span>
                            <span className="font-medium text-gray-900 group-hover:underline">{co.name}</span>
                            <span className="block text-[11px] text-gray-500">{co.clientType === "INTERNAL" ? "Internal" : "Campaign"} · {co.perWeek}/week</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Meter num={c.verified} den={c.due} provisional={c.provisional} />
                        <div className="text-[11px] text-gray-500 mt-1">
                          {c.missing} missing{c.unknown ? <> · <span title="No fresh evidence after these days">{c.unknown} unknown</span></> : null}
                          {c.pending ? ` · ${c.pending} pending` : ""}
                          {p && p.rate !== null && c.rate !== null ? <> · <Delta cur={c.rate} prev={p.rate} small /></> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 gx-num text-xs"><Frac a={n.li} b={c.due} /></td>
                      <td className="px-3 py-3 gx-num text-xs"><Frac a={n.x} b={c.due} /></td>
                      <td className="px-3 py-3"><WeekDots co={co} weeks={coverage.weeks} today={today} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-900">All companies, week by week</div>
            <div className="text-xs text-gray-500">Weekdays verified ÷ weekdays due · dashed line = 100% · hatched = includes unknown days</div>
            <PctChart
              labels={coverage.weeks.map((wk, i) => (i === coverage.weeks.length - 1 ? "This wk" : shortDate(wk)))}
              values={coverage.weekAtt.map((a) => a.rate)}
              provisional={coverage.weekAtt.map((a) => a.provisional)}
              every={3}
            />
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-500">
              <Legend c="#2E7D4F" t="verified" /><Legend c="#F6BBB3" t="missing" /><Legend c={C_UNKNOWN} t="unknown" /><Legend c="#F3F1EC" t="pending / before start" />
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Stock */}
      <section className="gx-card overflow-hidden">
        <SectionHead n={2} title="Content in stock" sub={`Approved or scheduled posts on a weekday · ${stock.restDue} weekdays left in ${monthLabel(mk, true)}, ${stock.nextDue} in ${monthLabel(nextMk, true)} · read-only, from Publish`}
          action={<a href={`${PUBLISH}/publishing`} className="text-xs font-medium text-red-700 hover:underline">Open Publish</a>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50">
                <th className="px-5 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium">Rest of {monthLabel(mk, true)}</th>
                <th className="px-3 py-2.5 font-medium">{monthLabel(nextMk, true)} ready</th>
                <th className="px-3 py-2.5 font-medium">{monthLabel(nextMk, true)} in progress</th>
                <th className="px-3 py-2.5 font-medium">Approved, no date</th>
                <th className="px-5 py-2.5 font-medium">Still to produce for {monthLabel(nextMk, true)}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((co, i) => ({ co, i, s: stock.rows[i] }))
                .sort((a, b) => a.s.next - b.s.next)
                .map(({ co, s }) => {
                  const toMake = Math.max(0, stock.nextDue - s.next - s.nextReview - s.nextDrafts - s.undated);
                  return (
                    <tr key={co.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3"><div className="flex items-center gap-2.5"><Logo co={co} /><span className="font-medium text-gray-900">{co.name}</span></div></td>
                      <td className="px-3 py-3"><Meter num={s.rest} den={stock.restDue} /></td>
                      <td className="px-3 py-3"><Meter num={s.next} den={stock.nextDue} /></td>
                      <td className="px-3 py-3 text-xs text-gray-700">{s.nextReview} with client · {s.nextDrafts} drafts</td>
                      <td className="px-3 py-3 gx-num text-gray-700">{s.undated || "—"}</td>
                      <td className="px-5 py-3">
                        {toMake === 0
                          ? <span className="gx-pill bg-green-50 text-green-800"><CheckCircle2 size={11} /> Covered</span>
                          : <span className="gx-pill bg-red-50 text-red-700">{toMake} posts</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3 — Performance */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="gx-card overflow-hidden lg:col-span-3">
          <SectionHead n={3} title="How successful the posts are" sub={`${windowLabel} · engagement = likes + comments + reposts · followers are per company, change over 30 days`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <th className="px-5 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium text-right">Posts</th>
                  <th className="px-3 py-2.5 font-medium text-right">Engagement</th>
                  <th className="px-3 py-2.5 font-medium text-right">Per post</th>
                  <th className="px-3 py-2.5 font-medium">Followers</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((co, i) => ({ co, i, p: perf.cur[i], q: perf.prev[i] }))
                  .sort((a, b) => (b.p.posts ? b.p.eng / b.p.posts : 0) - (a.p.posts ? a.p.eng / a.p.posts : 0))
                  .map(({ co, i, p, q }) => {
                    // A company never read (or not read lately) shows "—", not a zero.
                    const unread = !co.accounts.length || !co.evidenceAt;
                    return (
                      <tr key={co.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-5 py-3"><div className="flex items-center gap-2.5"><Logo co={co} /><span className="font-medium text-gray-900">{co.name}</span>
                          {isStale(co.evidenceAt, nowMs) && <span className="gx-pill bg-gray-100 text-gray-600" title="Evidence not fresh: numbers may be incomplete"><Clock size={10} /> stale</span>}</div></td>
                        <td className="px-3 py-3 text-right gx-num">{unread && !p.posts ? "—" : p.posts}</td>
                        <td className="px-3 py-3 text-right gx-num">{unread && !p.posts ? "—" : fmt(p.eng)}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="gx-num font-semibold text-gray-900">{p.posts ? (p.eng / p.posts).toFixed(1) : "—"}</div>
                          {hasPrev && p.posts > 0 && q.posts > 0 && <Delta cur={p.eng / p.posts} prev={q.eng / q.posts} small />}
                        </td>
                        <td className="px-3 py-3">
                          {data.followers[i].length === 0 ? <span className="text-gray-400">—</span> : (
                            <div className="space-y-0.5">
                              {[...data.followers[i]].sort((a, b) => a.platform.localeCompare(b.platform)).map((f) => {
                                const d = f.then !== null ? f.now - f.then : null;
                                return (
                                  <div key={f.platform} className="flex items-center gap-1.5 text-xs">
                                    <Dot c={f.platform === "LINKEDIN" ? C_LI : C_X} />
                                    <span className="gx-num text-gray-900">{fmt(f.now)}</span>
                                    {d !== null && d !== 0 && <span className={"gx-num " + (d > 0 ? "text-green-700" : "text-red-700")}>{d > 0 ? "+" : ""}{fmt(d)}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="gx-card p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900">Top posts</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-2">Most engagement · {windowLabel.toLowerCase()}</p>
          {top.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">No posts seen in this period.</div>
          ) : (
            <ol className="divide-y divide-gray-100">
              {top.map((t, k) => (
                <li key={k} className="py-2.5 flex gap-3">
                  <div className="w-5 shrink-0 gx-num font-semibold text-gray-300">{k + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Dot c={t.platform === "LINKEDIN" ? C_LI : C_X} />
                      <span className="font-medium text-gray-900 truncate">{companies[t.c]?.name}</span>
                      <span className="shrink-0">· {shortDate(t.date)}</span>
                      {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 text-red-700 hover:underline inline-flex items-center gap-1">Open <ExternalLink size={11} /></a>}
                    </div>
                    <p className="text-[13px] text-gray-700 mt-0.5 line-clamp-2">{t.text || "(no text)"}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500 gx-num">
                      <span className="flex items-center gap-1"><Heart size={11} />{fmt(t.likes)}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={11} />{fmt(t.comments)}</span>
                      <span className="flex items-center gap-1"><Repeat2 size={11} />{fmt(t.shares)}</span>
                      {t.views > 0 && <span className="flex items-center gap-1"><Eye size={11} />{fmt(t.views)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* 4 — Efficiency over the campaign */}
      <section className="gx-card overflow-hidden">
        <SectionHead n={4} title="Efficiency over the campaign" sub="Month by month since each campaign started · start = first 3 full months, now = last 3 full months" />
        <div className="grid lg:grid-cols-5">
          <div className="lg:col-span-3 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <th className="px-5 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Weekdays verified / month</th>
                  <th className="px-3 py-2.5 font-medium">Engagement / post</th>
                  <th className="px-3 py-2.5 font-medium">Start → now</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((co, i) => {
                  const e = eff.perCo[i];
                  return (
                    <tr key={co.id} className="border-t border-gray-100 hover:bg-gray-50 align-middle">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5"><Logo co={co} />
                          <div>
                            <div className="font-medium text-gray-900">{co.name}</div>
                            <div className="text-[11px] text-gray-500">{e ? `Month ${e.age} · since ${monthLabel(monthKey(co.campaignStart!))}` : "No start date"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">{e ? <PctBars values={e.months.map((m) => m.cov)} labels={e.months.map((m) => monthLabel(m.mk))} /> : "—"}</td>
                      <td className="px-3 py-3">{e && e.months.some((m) => m.epp !== null) ? <Spark values={e.months.map((m) => m.epp ?? 0)} /> : "—"}</td>
                      <td className="px-3 py-3 text-xs">
                        {e && e.eppStart !== null && e.eppNow !== null && e.covStart !== null && e.covNow !== null ? (
                          <div className="space-y-0.5 gx-num">
                            <div>Days <span className="text-gray-500">{Math.round(e.covStart * 100)}%</span> → <b style={{ color: pctTone(e.covNow) }}>{Math.round(e.covNow * 100)}%</b></div>
                            <div>Eng/post <span className="text-gray-500">{e.eppStart.toFixed(1)}</span> → <b className="text-gray-900">{e.eppNow.toFixed(1)}</b> <Delta cur={e.eppNow} prev={e.eppStart} small /></div>
                          </div>
                        ) : <span className="text-gray-400">Too early ({e ? e.age : 0} months)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-gray-100 p-5 space-y-5">
            <div>
              <div className="text-sm font-semibold text-gray-900">Weekdays verified, all companies</div>
              <div className="text-xs text-gray-500">Last 12 months · dashed line = 100%</div>
              <PctChart labels={eff.cal.map((c) => monthLabel(c.mk))} values={eff.cal.map((c) => c.cov)} every={2} h={150} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Engagement per post, all companies</div>
              <LineChart labels={eff.cal.map((c) => monthLabel(c.mk))} values={eff.cal.map((c) => c.epp)} />
            </div>
          </div>
        </div>
      </section>

      {/* Operations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="gx-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Publishing pipeline</h2>
            <a href={`${PUBLISH}/publishing`} className="text-xs font-medium text-red-700 hover:underline">Open Publish</a>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Read-only. Tracking never publishes — a delivery receipt is not proof of a live post.</p>
          <Pipeline p={data.pipeline} />
        </section>
        <section className="gx-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Evidence freshness</h2>
            <Link href="/extension" className="text-xs font-medium text-red-700 hover:underline">Verify now</Link>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Last good read of each account by any collector · ✓ = Social Tracking&apos;s own verifier read it · stale after {STALE_EVIDENCE_HOURS} h</p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {companies.map((co) => (
              <li key={co.id} className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-700 truncate">{co.name}</span>
                <span className="flex gap-1 shrink-0">
                  {co.accounts.length === 0 && <span className="gx-pill bg-gray-100 text-gray-500"><HelpCircle size={11} /> no account</span>}
                  {co.accounts.map((a) => {
                    const stale = isStale(a.lastGood, nowMs);
                    const net = a.platform === "LINKEDIN" ? "LinkedIn" : "X";
                    return (
                      <span key={a.connectionId}
                        title={`${net}: last good read ${relTime(a.lastGood)}${a.verifierAt ? ` · verifier ${relTime(a.verifierAt)}` : " · never read by the verifier"}${a.error ? ` · last error: ${a.error}` : ""}`}
                        className={"gx-pill " + (stale ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800")}>
                        {stale ? <XCircle size={11} /> : <CheckCircle2 size={11} />} {net} · {relTime(a.lastGood)}{a.verifierOkAt ? " ✓" : ""}
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ───────── pieces ───────── */

function SectionHead({ n, title, sub, action }: { n: number; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
      <div className="flex gap-3">
        <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function Answer({
  n, q, value, unit, tone, meter, line, sub, delta, deltaLabel,
}: {
  n: number; q: string; value: string; unit?: string; tone?: string; meter?: number;
  line: React.ReactNode; sub?: string; delta?: React.ReactNode; deltaLabel?: string;
}) {
  return (
    <div className="gx-card p-5 flex flex-col">
      <div className="flex items-center gap-2 text-[13px] font-medium text-gray-600">
        <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center">{n}</span>{q}
      </div>
      <div className="flex items-baseline gap-2 mt-3">
        <div className="text-[34px] leading-none font-semibold gx-num whitespace-nowrap" style={{ color: tone ?? "#15171C" }}>{value}</div>
        {unit && <div className="text-xs text-gray-500">{unit}</div>}
      </div>
      {meter !== undefined && (
        <div className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden relative">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, meter * 100)}%`, background: tone }} />
        </div>
      )}
      <div className="text-xs text-gray-600 mt-3">{line}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      {delta && <div className="mt-auto pt-3 text-xs text-gray-500 flex items-center gap-1.5">{delta} vs {deltaLabel}</div>}
    </div>
  );
}

function Meter({ num, den, provisional }: { num: number; den: number; provisional?: boolean }) {
  if (!den) return <span className="text-xs text-gray-400" title="Nothing due yet in this period">n/a</span>;
  const p = num / den;
  const c = pctTone(p);
  return (
    <div className="w-44">
      <div className="flex justify-between text-xs">
        <span className="gx-num font-semibold text-gray-900">{num}<span className="text-gray-400 font-normal"> / {den}</span></span>
        <span className="gx-num font-medium" style={{ color: c }} title={provisional ? "Provisional: some days are not verifiable yet" : undefined}>
          {Math.round(p * 100)}%{provisional ? "*" : ""}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, p * 100)}%`, background: c }} />
      </div>
    </div>
  );
}

function Frac({ a, b }: { a: number; b: number }) {
  if (!b) return <span className="text-gray-400">—</span>;
  return <span style={{ color: pctTone(Math.min(1, a / b)) }}>{a}<span className="text-gray-400">/{b}</span></span>;
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{t}</span>;
}

/** 13 weeks × 5 weekdays, one square per day, coloured by its verification state. */
function WeekDots({ co, weeks, today }: { co: BookCompany; weeks: string[]; today: string }) {
  const fill: Record<DayState, string> = { verified: "#2E7D4F", missing: "#F6BBB3", unknown: C_UNKNOWN, pending: "#F3F1EC", off: "#F3F1EC" };
  const title: string[] = [];
  return (
    <svg width={13 * 8} height={5 * 6} aria-hidden className="block">
      {weeks.map((wk, i) =>
        [0, 1, 2, 3, 4].map((d) => {
          const day = addDays(wk, d);
          const s = dayState(co, day, today);
          if (s !== "off" && s !== "pending") title.push(`${day} ${s}`);
          return <rect key={`${i}-${d}`} x={i * 8} y={d * 6} width={6} height={4} rx={1} fill={fill[s]} />;
        }),
      )}
      <title>{title.slice(-10).join("  ")}</title>
    </svg>
  );
}

function PctBars({ values, labels }: { values: (number | null)[]; labels: string[] }) {
  const H = 28;
  return (
    <svg width={12 * 9} height={H} aria-hidden className="block">
      {values.map((v, i) => {
        const h = v === null ? 2 : Math.max(1, v * H);
        return (
          <rect key={i} x={i * 9} y={H - h} width={7} height={h} rx={1} fill={v === null ? C_UNKNOWN : pctTone(v)}>
            <title>{`${labels[i]}: ${v === null ? "n/a" : `${Math.round(v * 100)}%`}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function PctChart({ labels, values, provisional, every = 2, h = 190 }: { labels: string[]; values: (number | null)[]; provisional?: boolean[]; every?: number; h?: number }) {
  const W = 460, H = h, L = 34, B = 22, T = 8;
  const y = (v: number) => T + (H - T - B) * (1 - v);
  const slot = (W - L) / Math.max(1, values.length);
  const bw = Math.min(26, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-3" role="img">
      <defs>
        <pattern id="trk-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="4" fill="#ffffff" opacity="0.55" />
        </pattern>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke={t === 1 ? C_TARGET : "#E6E3DC"} strokeDasharray={t === 1 ? "5 4" : undefined} strokeWidth={t === 1 ? 1.5 : 1} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#9A9DA5">{t * 100}%</text>
        </g>
      ))}
      {values.map((v, i) => {
        const cx = L + slot * i + slot / 2;
        const val = v === null ? null : Math.min(1, v);
        return (
          <g key={i}>
            <title>{`${labels[i]}: ${v === null ? "nothing due" : `${Math.round(v * 100)}%`}${provisional?.[i] ? " (provisional)" : ""}`}</title>
            {val !== null && (
              <>
                <rect x={cx - bw / 2} y={y(val)} width={bw} height={Math.max(0, y(0) - y(val))} rx={2} fill={pctTone(val)} />
                {provisional?.[i] && <rect x={cx - bw / 2} y={y(val)} width={bw} height={Math.max(0, y(0) - y(val))} rx={2} fill="url(#trk-hatch)" />}
                <text x={cx} y={y(val) - 3} textAnchor="middle" fontSize="9" fill="#50545D">{Math.round(val * 100)}</text>
              </>
            )}
            {(i % every === 0 || i === values.length - 1) && <text x={cx} y={H - 5} textAnchor="middle" fontSize="10" fill="#9A9DA5">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ labels, values }: { labels: string[]; values: (number | null)[] }) {
  const W = 460, H = 140, L = 34, B = 22, T = 14;
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return <div className="text-xs text-gray-500 mt-3">No posts yet.</div>;
  const max = Math.max(...nums) * 1.15 || 1;
  const slot = (W - L) / Math.max(1, values.length);
  const x = (i: number) => L + slot * i + slot / 2;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const pts = values.map((v, i) => (v === null ? null : ([x(i), y(v)] as const)));
  const d = pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-3" role="img">
      {[0, max / 2, max].map((t, k) => (
        <g key={k}>
          <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#E6E3DC" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#9A9DA5">{t.toFixed(0)}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={C_TARGET} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => p && (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={3} fill="#fff" stroke={C_TARGET} strokeWidth={1.5}><title>{`${labels[i]}: ${values[i]!.toFixed(1)}`}</title></circle>
          {(i % 2 === 0 || i === values.length - 1) && <text x={p[0]} y={H - 5} textAnchor="middle" fontSize="10" fill="#9A9DA5">{labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: c }} />;
}

export function Logo({ co }: { co: { name: string; logoUrl: string | null } }) {
  if (co.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={co.logoUrl} alt="" className="w-7 h-7 rounded-md object-contain bg-white border border-gray-200 shrink-0" />;
  }
  return (
    <span className="w-7 h-7 rounded-md bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
      {co.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Delta({ cur, prev, small }: { cur: number; prev: number; small?: boolean }) {
  if (!prev && !cur) return <span className="text-xs text-gray-400">—</span>;
  if (!prev) return <span className={"text-green-700 " + (small ? "text-[11px]" : "text-xs")}>new</span>;
  const p = Math.round(((cur - prev) / prev) * 100);
  const Icon = p > 0 ? ArrowUpRight : p < 0 ? ArrowDownRight : Minus;
  const tone = p > 0 ? "text-green-700" : p < 0 ? "text-red-700" : "text-gray-500";
  return (
    <span className={"inline-flex items-center gap-0.5 font-medium gx-num " + tone + (small ? " text-[11px]" : " text-xs")}>
      <Icon size={small ? 11 : 13} />{p > 0 ? "+" : ""}{p}%
    </span>
  );
}

function Spark({ values }: { values: number[] }) {
  const W = 96, H = 34;
  const max = Math.max(1, ...values);
  if (values.length < 2) return <span className="text-gray-400">—</span>;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 4)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <svg width={W} height={H} className="block shrink-0" aria-hidden>
      <path d={`${d}L${W},${H}L0,${H}Z`} fill="#D92D20" opacity={0.08} />
      <path d={d} fill="none" stroke="#D92D20" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}

function Pipeline({ p }: { p: TrackingDashData["pipeline"] }) {
  const stages = [
    { label: "Drafts", n: p.drafts, c: "#D4D0C7" },
    { label: "With client", n: p.review, c: "#E65A4B" },
    { label: "Changes asked", n: p.changes, c: "#F59E0B" },
    { label: "Approved", n: p.approved, c: "#86C79A" },
    { label: "Scheduled", n: p.scheduled, c: "#2E7D4F" },
    { label: "Published 30d", n: p.published30, c: "#15171C" },
  ];
  const max = Math.max(1, ...stages.map((s) => s.n));
  return (
    <div className="mt-4 space-y-2">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-xs">
          <div className="w-24 text-gray-600 shrink-0">{s.label}</div>
          <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(s.n / max) * 100}%`, background: s.c, minWidth: s.n ? 4 : 0 }} />
          </div>
          <div className="w-8 text-right gx-num font-medium text-gray-900">{s.n}</div>
        </div>
      ))}
      {p.failed > 0 && <div className="text-xs font-medium text-red-700 pt-1">{p.failed} failed / missed delivery attempts in the last 30 days (diagnostic — not counted as misses)</div>}
    </div>
  );
}
