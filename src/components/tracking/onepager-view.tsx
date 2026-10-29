"use client";

/**
 * The monthly one-pager (v0.6.0) — what was posted and what happened last
 * month, on one landscape A4 page. Pure view: everything comes from
 * OnePagerData (lib/tracking/onepager.ts), every sentence from the numbers
 * on the page (onepager-model.ts). "Print / Save as PDF" uses the browser.
 *
 * Gershon.ai design: red #CC3333 / dark #a8281f / tint #fdf2f2, #1d1d1f text,
 * #e5e7eb borders, 12px cards. Hand-drawn SVG, no chart library.
 */
import Link from "next/link";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, CheckCircle2, ExternalLink, Info, Printer, XCircle } from "lucide-react";
import { daysInMonth, isWeekday } from "@/lib/tracking/attainment";
import { highlights, monthName, totals, type OneCompany, type OnePagerData, type OnePost } from "@/lib/tracking/onepager-model";
import { frameTone, FRAME_STYLE } from "@/lib/frame-tone";

const RED = "#CC3333";
const RED_DARK = "#a8281f";
const TINT = "#fdf2f2";
const INK = "#1d1d1f";
const LI = "#0A66C2";
const X = "#15171C";

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString("en-US"));
const pc = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
const toneColor = (r: number | null) => FRAME_STYLE[frameTone(r)].border;

export function OnePagerView({ data, months, interactive = true }: { data: OnePagerData; months: string[]; interactive?: boolean }) {
  const t = totals(data);
  const notes = highlights(data, t);
  const n = daysInMonth(data.month);
  const top = [...data.posts]
    .sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares) || b.views - a.views)
    .slice(0, 3);
  const order = [...data.companies.keys()].sort((a, b) => (data.companies[b].att.rate ?? -1) - (data.companies[a].att.rate ?? -1));
  const nCampaign = data.companies.filter((c) => c.clientType === "CAMPAIGN").length;
  const nInternal = data.companies.length - nCampaign;
  const LIST_MAX = 45;
  const PRINT_MAX = 24; // keeps the printed page to ONE landscape A4
  const list = data.posts.slice(0, LIST_MAX);
  const more = data.posts.length - list.length + data.postsTruncated;
  const q = (m: string, internal = data.includeInternal) => `/onepager?month=${m}${internal ? "&internal=1" : ""}`;

  return (
    <div className="onepager min-h-screen bg-[#F3F2EE] print:bg-white" style={{ color: INK }}>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          .onepager-sheet { box-shadow: none !important; margin: 0 !important; border: 0 !important; width: 100% !important; max-width: none !important; }
          .onepager { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .onepager-sheet { zoom: 0.57; }
          .onepager { min-height: 0 !important; }
        }
      `}</style>

      {/* Toolbar — never printed */}
      {interactive && (
        <div className="no-print sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#e5e7eb]">
          <div className="max-w-[1180px] mx-auto px-6 h-14 flex items-center gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <span className="text-gray-300">|</span>
            <span className="text-sm font-semibold">Monthly one-pager</span>
            <div className="flex-1" />
            <select
              aria-label="Month"
              value={data.month}
              onChange={(e) => { window.location.href = q(e.target.value); }}
              className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-sm font-medium"
            >
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
            <a href={q(data.month, !data.includeInternal)}
              className="h-9 inline-flex items-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-medium hover:bg-gray-50">
              {data.includeInternal ? "Campaigns only" : "+ Internal"}
            </a>
            <button onClick={() => window.print()}
              className="h-9 inline-flex items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-white" style={{ background: RED }}>
              <Printer size={15} /> Print / Save as PDF
            </button>
          </div>
        </div>
      )}

      <div className="onepager-sheet max-w-[1180px] mx-auto my-6 bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-[#e5e7eb] overflow-hidden">
        {/* ── Header band ───────────────────────────────────────────── */}
        <header className="relative px-9 pt-8 pb-7 text-white" style={{ background: `linear-gradient(120deg, ${RED} 0%, ${RED_DARK} 62%, #6f1a14 100%)` }}>
          <svg className="absolute right-0 top-0 h-full opacity-[0.10]" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={400} cy={100} r={30 + i * 34} fill="none" stroke="#fff" strokeWidth="1.5" />)}
          </svg>
          <div className="relative flex items-center gap-8">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Social Tracking by Gershon.AI · Monthly one-pager</div>
              <h1 className="mt-1.5 text-[40px] leading-none font-bold tracking-tight">{monthName(data.month)}</h1>
              <p className="mt-2.5 text-[14px] text-white/85 max-w-[640px]">
                What was posted and what happened for our {nCampaign} campaign compan{nCampaign === 1 ? "y" : "ies"}
                {nInternal ? ` and ${nInternal} internal` : ""} — every post seen on LinkedIn and X, checked against the agreed posting objective.
              </p>
            </div>
            <Ring rate={t.att.rate} provisional={t.att.provisional} />
          </div>
        </header>

        {/* ── KPI strip ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-5 border-b border-[#e5e7eb]">
          <Kpi label="Posts published" value={fmt(t.posts)} delta={delta(t.posts, t.prevPosts)}>
            <SplitBar li={t.li} x={t.x} />
          </Kpi>
          <Kpi label="Engagements" value={fmt(t.eng)} delta={delta(t.eng, t.prevEng)} sub="likes + comments + reposts" />
          <Kpi label="Engagement / post" value={t.posts ? (t.eng / t.posts).toFixed(1) : "—"}
            delta={t.posts && t.prevPosts ? delta(t.eng / t.posts, t.prevEng / t.prevPosts) : null} sub="average across companies" />
          <Kpi label="Views" value={t.views ? fmt(t.views) : "—"} sub={t.views ? "where the network reports them" : "not reported by the networks"} />
          <Kpi label="Followers gained" value={t.followersGained === null ? "—" : `${t.followersGained >= 0 ? "+" : ""}${fmt(t.followersGained)}`}
            sub={`LinkedIn + X · posting on ${t.activeDays} of ${n} days`} last />
        </section>

        {/* ── What happened + Top posts ─────────────────────────────── */}
        <section className="grid grid-cols-[1fr_1.35fr] gap-0 border-b border-[#e5e7eb]">
          <div className="px-8 py-6 border-r border-[#e5e7eb]">
            <H2>What happened</H2>
            <ul className="mt-3 space-y-2.5">
              {notes.map((x, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug">
                  {x.tone === "good" ? <CheckCircle2 size={17} className="shrink-0 mt-px text-[#16A34A]" />
                    : x.tone === "bad" ? <XCircle size={17} className="shrink-0 mt-px" style={{ color: RED }} />
                    : <Info size={17} className="shrink-0 mt-px text-gray-400" />}
                  <span>{x.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="px-8 py-6">
            <H2>Top posts of the month</H2>
            {top.length === 0 ? <p className="mt-3 text-sm text-gray-500">No post seen this month.</p> : (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {top.map((p, i) => <TopCard key={i} p={p} co={data.companies[p.c]} rank={i + 1} />)}
              </div>
            )}
          </div>
        </section>

        {/* ── Scoreboard + posting calendar ─────────────────────────── */}
        <section className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-end justify-between gap-4">
            <H2>Company by company — objective and posting calendar</H2>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <Legend c={LI} t="LinkedIn" /><Legend c={X} t="X" /><Legend c={`linear-gradient(135deg, ${LI} 50%, ${X} 50%)`} t="Both" />
              <Legend c={TINT} border={RED} t="Weekday with no post" /><Legend c="#F3F4F6" t="Weekend / not due" />
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-gray-500">
                  <th className="text-left font-semibold py-1.5 pr-3 w-[200px]">Company</th>
                  <th className="text-left font-semibold py-1.5 pr-3 w-[150px]">Objective</th>
                  <th className="text-right font-semibold py-1.5 pr-3">Posts</th>
                  <th className="text-right font-semibold py-1.5 pr-3">Eng.</th>
                  <th className="text-right font-semibold py-1.5 pr-4">Followers</th>
                  <th className="py-1.5">
                    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                      {Array.from({ length: n }, (_, i) => (
                        <span key={i} className={"text-center font-medium normal-case " + (isWeekday(`${data.month}-${String(i + 1).padStart(2, "0")}`) ? "text-gray-500" : "text-gray-300")}>{i + 1}</span>
                      ))}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.map((ci) => <CompanyRow key={ci} co={data.companies[ci]} month={data.month} n={n} today={data.today} />)}
                {data.companies.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-sm text-gray-500">No company in scope.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Everything that was posted ────────────────────────────── */}
        <section className="px-8 py-6">
          <div className="flex items-end justify-between">
            <H2>Everything that was posted</H2>
            <span className="text-[11px] text-gray-500">{data.posts.length + data.postsTruncated} posts · newest last{more > 0 ? ` · ${more} more in the monthly report` : ""}</span>
          </div>
          {list.length === 0 ? <p className="mt-3 text-sm text-gray-500">No post seen this month.</p> : (
            <ol className="mt-3 columns-3 gap-x-6 [&>li]:mb-1.5 [&>li]:break-inside-avoid">
              {list.map((p, i) => <PostLine key={i} p={p} co={data.companies[p.c]} printHide={i >= PRINT_MAX} />)}
            </ol>
          )}
        </section>

        <footer className="px-8 py-3 bg-[#FAFAF8] border-t border-[#e5e7eb] text-[10.5px] text-gray-500 flex justify-between">
          <span>Objective = weekdays with a verified post ÷ weekdays due since the campaign start, at each company&apos;s agreed posts per week. Days not verifiable yet are counted apart, never as a miss.</span>
          <span className="shrink-0 ml-6">socialtracking.gershon.ai · generated {new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })}</span>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return (cur - prev) / prev;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] flex items-center gap-2">
      <span className="h-3.5 w-1 rounded-full" style={{ background: RED }} />{children}
    </h2>
  );
}

function Ring({ rate, provisional }: { rate: number | null; provisional: boolean }) {
  const r = 52, c = 2 * Math.PI * r;
  const v = rate === null ? 0 : Math.min(1, rate);
  return (
    <div className="relative shrink-0 w-[168px] h-[168px]">
      <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
        <circle cx="65" cy="65" r={r} fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[34px] font-bold leading-none tabular-nums">{pc(rate)}</div>
        <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/80">of objective</div>
        {provisional && <div className="text-[9.5px] text-white/70">provisional</div>}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, delta: d, children, last }: { label: string; value: string; sub?: string; delta?: number | null; children?: React.ReactNode; last?: boolean }) {
  return (
    <div className={"px-6 py-5 " + (last ? "" : "border-r border-[#e5e7eb]")}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gray-500">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none tabular-nums tracking-tight">{value}</span>
        {d !== null && d !== undefined && Number.isFinite(d) && (
          <span className={"inline-flex items-center text-[11.5px] font-semibold " + (d >= 0 ? "text-[#16A34A]" : "")} style={d < 0 ? { color: RED } : undefined}>
            {d >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(Math.round(d * 100))}%
          </span>
        )}
      </div>
      {children}
      {sub && <div className="mt-1.5 text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

function SplitBar({ li, x }: { li: number; x: number }) {
  const tot = li + x;
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
        {tot > 0 && <span style={{ width: `${(li / tot) * 100}%`, background: LI }} />}
        {tot > 0 && <span style={{ width: `${(x / tot) * 100}%`, background: X }} />}
      </div>
      <div className="mt-1 text-[11px] text-gray-500"><b style={{ color: LI }}>{li}</b> LinkedIn · <b style={{ color: X }}>{x}</b> X</div>
    </div>
  );
}

function Legend({ c, t, border }: { c: string; t: string; border?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c, border: border ? `1px solid ${border}` : undefined }} />{t}
    </span>
  );
}

export function CoLogo({ co, size = 26 }: { co: { name: string; logoUrl: string | null }; size?: number }) {
  return co.logoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={co.logoUrl} alt="" className="rounded-md object-contain bg-white border border-[#e5e7eb] shrink-0" style={{ width: size, height: size }} />
    : <span className="rounded-md text-white font-bold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.4, background: INK }}>{co.name.slice(0, 2).toUpperCase()}</span>;
}

function CompanyRow({ co, month, n, today }: { co: OneCompany; month: string; n: number; today: string }) {
  const r = co.att.rate;
  const tone = toneColor(r);
  const posts = co.posts.li + co.posts.x;
  const fol = co.followers.filter((f) => f.start !== null && f.end !== null);
  const gained = fol.length ? fol.reduce((s, f) => s + (f.end! - f.start!), 0) : null;
  const now = co.followers.reduce((s, f) => s + (f.end ?? 0), 0);
  const missing = new Set(co.missingDays);
  return (
    <tr className="border-t border-[#f0f0f0] align-middle">
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CoLogo co={co} />
          <div className="min-w-0">
            <div className="font-semibold truncate max-w-[150px]">{co.name}</div>
            <div className="text-[10.5px] text-gray-500">{co.clientType === "INTERNAL" ? "Internal" : "Campaign"} · {co.perWeek}/week</div>
          </div>
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r ?? 0) * 100)}%`, background: tone }} />
          </div>
          <span className="w-10 text-right font-bold tabular-nums" style={{ color: FRAME_STYLE[frameTone(r)].text }}>{pc(r)}</span>
        </div>
        <div className="text-[10.5px] text-gray-500 mt-0.5">
          {co.att.due ? `${co.att.verified}/${co.att.due} days${co.att.unknown ? ` · ${co.att.unknown} unverified` : ""}` : "nothing due"}
        </div>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        <div className="font-semibold">{posts}</div>
        <div className="text-[10.5px] text-gray-500"><span style={{ color: LI }}>{co.posts.li}</span> · <span>{co.posts.x}</span></div>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        <div className="font-semibold">{fmt(co.eng)}</div>
        <div className="text-[10.5px] text-gray-500">{posts ? `${(co.eng / posts).toFixed(1)}/post` : "—"}</div>
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        <div className="font-semibold">{now ? fmt(now) : "—"}</div>
        <div className={"text-[10.5px] " + (gained === null ? "text-gray-400" : gained >= 0 ? "text-[#16A34A]" : "")} style={gained !== null && gained < 0 ? { color: RED } : undefined}>
          {gained === null ? "no history" : `${gained >= 0 ? "+" : ""}${fmt(gained)}`}
        </div>
      </td>
      <td className="py-2">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {Array.from({ length: n }, (_, i) => {
            const day = i + 1;
            const d = `${month}-${String(day).padStart(2, "0")}`;
            const f = co.days[day] ?? 0;
            const future = d >= today;
            let bg = "#F3F4F6", border = "transparent";
            if (f === 1) bg = LI;
            else if (f === 2) bg = X;
            else if (f === 3) bg = `linear-gradient(135deg, ${LI} 50%, ${X} 50%)`;
            else if (missing.has(day)) { bg = TINT; border = RED; }
            else if (isWeekday(d) && !future) bg = "#E9E7E1";
            return (
              <span key={day} title={`${d}${f ? ` · posted on ${f === 3 ? "LinkedIn and X" : f === 1 ? "LinkedIn" : "X"}` : missing.has(day) ? " · no post" : ""}`}
                className="block aspect-square rounded-[3px]" style={{ background: bg, border: `1px solid ${border}`, opacity: future && !f ? 0.45 : 1 }} />
            );
          })}
        </div>
      </td>
    </tr>
  );
}

function NetBadge({ platform }: { platform: OnePost["platform"] }) {
  return (
    <span className="inline-flex items-center justify-center h-[15px] min-w-[15px] px-[3px] rounded-[3px] text-[9px] font-bold text-white shrink-0"
      style={{ background: platform === "LINKEDIN" ? LI : X }}>
      {platform === "LINKEDIN" ? "in" : "X"}
    </span>
  );
}

const day = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function TopCard({ p, co, rank }: { p: OnePost; co: OneCompany | undefined; rank: number }) {
  const eng = p.likes + p.comments + p.shares;
  return (
    <div className="rounded-xl border border-[#e5e7eb] p-3.5 flex flex-col relative" style={rank === 1 ? { background: TINT, borderColor: "#f3c9c5" } : undefined}>
      <span className="absolute -top-2 -left-2 h-6 w-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center shadow" style={{ background: rank === 1 ? RED : INK }}>{rank}</span>
      <div className="flex items-center gap-2 min-w-0">
        {co && <CoLogo co={co} size={20} />}
        <span className="text-[12px] font-semibold truncate">{co?.name ?? "—"}</span>
        <span className="flex-1" />
        <NetBadge platform={p.platform} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-gray-700 line-clamp-4 flex-1">{p.text || <i className="text-gray-400">No text (image or video post)</i>}</p>
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="font-bold text-[15px] tabular-nums" style={{ color: INK }}>{fmt(eng)}</span> engagements
        <span className="flex-1" />
        <span className="whitespace-nowrap">{day(p.date)}</span>
        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="no-print text-gray-400 hover:text-gray-700"><ExternalLink size={12} /></a>}
      </div>
    </div>
  );
}

function PostLine({ p, co, printHide }: { p: OnePost; co: OneCompany | undefined; printHide?: boolean }) {
  const eng = p.likes + p.comments + p.shares;
  const body = (
    <>
      <span className="w-[42px] shrink-0 text-gray-500 tabular-nums">{day(p.date)}</span>
      <NetBadge platform={p.platform} />
      <span className="font-semibold shrink-0 max-w-[92px] truncate">{co?.name ?? "—"}</span>
      <span className="truncate text-gray-600 flex-1 min-w-0">{p.text || "—"}</span>
      <span className="shrink-0 tabular-nums font-semibold text-gray-700">{eng || ""}</span>
    </>
  );
  return (
    <li className={"text-[11.5px] leading-[1.35]" + (printHide ? " print:hidden" : "")}>
      {p.url
        ? <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 min-w-0 hover:bg-gray-50 rounded">{body}</a>
        : <div className="flex items-center gap-1.5 min-w-0">{body}</div>}
    </li>
  );
}
