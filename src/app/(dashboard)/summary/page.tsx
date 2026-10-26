export const runtime = 'edge';
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, FileText, HelpCircle, XCircle } from "lucide-react";
import { loadBook } from "@/lib/tracking/book";
import {
  addMonths, attainment, isStale, monthFirst, monthKey, monthLast, toD, BEHIND_RATE, STALE_EVIDENCE_HOURS, type Attainment,
} from "@/lib/tracking/attainment";
import { Logo } from "@/components/tracking/dashboard-client";

export const dynamic = "force-dynamic";

/**
 * Social Tracking's own Summary — "Work completion" (v0.4.0).
 *
 * Company by company, for ONE reporting month: was the agreed posting done?
 * Expected weekdays (objective × weekdays since the campaign start), weekdays
 * verified with a post, missing, unknown (no fresh evidence — never counted as
 * missing), pending (not due yet), attainment, the last post seen, how fresh
 * the evidence is, and links to the company and its monthly report. Same rule
 * as the Dashboard (lib/tracking/attainment.ts). CAMPAIGN + INTERNAL only.
 */
const monthName = (mk: string) => toD(`${mk}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (s: string) => toD(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const tone = (p: number) => (p >= 0.9 ? "#2E7D4F" : p >= 0.6 ? "#B45309" : "#D92D20");

function ago(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const h = Math.floor((nowMs - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "under 1 h ago";
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const book = await loadBook();
  const { today } = book;
  const nowMs = Date.parse(book.generatedAt);
  const current = monthKey(today);
  const month = sp?.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= current ? sp.month : current;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, -i));

  const rows = book.companies.map((co) => {
    const a: Attainment = attainment({
      from: monthFirst(month),
      to: monthLast(month),
      today,
      start: co.campaignStart,
      perWeek: co.perWeek,
      evidenceDate: co.evidenceDate,
      posted: (d) => !!co.posted[d],
    });
    const lastInMonth = Object.keys(co.posted).filter((d) => monthKey(d) === month && d <= today).sort().pop() ?? null;
    return { co, a, lastInMonth, stale: !co.accounts.length || isStale(co.evidenceAt, nowMs) };
  });
  rows.sort((x, y) => (x.a.rate ?? 2) - (y.a.rate ?? 2) || x.co.name.localeCompare(y.co.name));

  const tot = rows.reduce(
    (s, r) => ({
      expected: s.expected + r.a.expected, due: s.due + r.a.due, verified: s.verified + r.a.verified,
      missing: s.missing + r.a.missing, unknown: s.unknown + r.a.unknown, pending: s.pending + r.a.pending,
    }),
    { expected: 0, due: 0, verified: 0, missing: 0, unknown: 0, pending: 0 },
  );
  const totRate = tot.due ? tot.verified / tot.due : null;
  const closed = month < current;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-red-700 mb-1">Social Tracking · work completion</div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-gray-900">Summary — {monthName(month)}</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">
            Was the agreed posting done? For each campaign and internal company: the weekdays expected under its objective, the
            weekdays with a post we actually saw on LinkedIn or X, and what is still missing, unknown or pending — the evidence
            behind the monthly report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/summary?month=${addMonths(month, -1)}`} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50" aria-label="Previous month"><ChevronLeft size={16} /></Link>
          <div className="inline-flex max-w-[520px] overflow-x-auto rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {months.slice(0, 6).reverse().map((m) => (
              <Link key={m} href={`/summary?month=${m}`}
                className={"px-3 h-8 inline-flex items-center whitespace-nowrap text-[13px] font-medium rounded-md " + (m === month ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-50")}>
                {toD(`${m}-01`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
              </Link>
            ))}
          </div>
          {month < current
            ? <Link href={`/summary?month=${addMonths(month, 1)}`} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50" aria-label="Next month"><ChevronRight size={16} /></Link>
            : <span className="h-8 w-8" />}
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Attainment" value={totRate === null ? "n/a" : `${Math.round(totRate * 100)}%`} color={totRate === null ? undefined : tone(totRate)}
          note={tot.unknown ? "provisional — some days unverifiable" : closed ? "month closed" : "month to date"} />
        <Tile label="Expected" value={String(tot.expected)} note="weekdays with a post, whole month" />
        <Tile label="Verified" value={String(tot.verified)} color="#2E7D4F" note={`of ${tot.due} due so far`} />
        <Tile label="Missing" value={String(tot.missing)} color={tot.missing ? "#D92D20" : undefined} note="no post, evidence fresh" />
        <Tile label="Unknown" value={String(tot.unknown)} color={tot.unknown ? "#6B7280" : undefined} note="not verifiable yet — not a miss" />
        <Tile label="Pending" value={String(tot.pending)} note="not due yet" />
      </div>

      <section className="gx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50">
                <th className="px-5 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium text-right">Expected</th>
                <th className="px-3 py-2.5 font-medium text-right">Verified</th>
                <th className="px-3 py-2.5 font-medium text-right">Missing</th>
                <th className="px-3 py-2.5 font-medium text-right">Unknown</th>
                <th className="px-3 py-2.5 font-medium text-right">Pending</th>
                <th className="px-3 py-2.5 font-medium">Attainment</th>
                <th className="px-3 py-2.5 font-medium">Last post seen</th>
                <th className="px-3 py-2.5 font-medium">Evidence (last read)</th>
                <th className="px-5 py-2.5 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-6 text-gray-500">No active campaign or internal company.</td></tr>
              )}
              {rows.map(({ co, a, lastInMonth, stale }) => (
                <tr key={co.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-5 py-3">
                    <Link href={`/clients/${co.id}`} className="flex items-center gap-2.5 group">
                      <Logo co={co} />
                      <span>
                        <span className="font-medium text-gray-900 group-hover:underline">{co.name}</span>
                        <span className="block text-[11px] text-gray-500">
                          {co.clientType === "INTERNAL" ? "Internal" : "Campaign"} · {co.perWeek}/week
                          {co.campaignStart && co.campaignStart > monthFirst(month) ? ` · started ${shortDate(co.campaignStart)}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right gx-num">{a.expected || "—"}</td>
                  <td className="px-3 py-3 text-right gx-num font-semibold text-green-800">{a.expected ? a.verified : "—"}</td>
                  <td className={"px-3 py-3 text-right gx-num " + (a.missing ? "text-red-700 font-semibold" : "text-gray-500")}>{a.expected ? a.missing : "—"}</td>
                  <td className={"px-3 py-3 text-right gx-num " + (a.unknown ? "text-gray-700 font-semibold" : "text-gray-400")}>{a.expected ? a.unknown : "—"}</td>
                  <td className="px-3 py-3 text-right gx-num text-gray-500">{a.expected ? a.pending : "—"}</td>
                  <td className="px-3 py-3">
                    {a.rate === null ? (
                      <span className="text-xs text-gray-400" title="Nothing due yet this month">n/a</span>
                    ) : (
                      <div className="w-36">
                        <div className="flex justify-between text-xs">
                          <span className="gx-num font-semibold" style={{ color: tone(a.rate) }}>{Math.round(a.rate * 100)}%{a.provisional ? "*" : ""}</span>
                          <span className="text-gray-400">{a.verified}/{a.due}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, a.rate * 100)}%`, background: tone(a.rate) }} />
                        </div>
                        {a.rate < BEHIND_RATE && <div className="text-[11px] text-red-700 mt-1">Behind objective</div>}
                        {a.provisional && <div className="text-[11px] text-gray-500 mt-1">* provisional</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {co.lastPost ? (
                      <div>
                        <span className="text-gray-900">{shortDate(co.lastPost.date)}</span>
                        <span className="text-gray-500"> · {co.lastPost.platform === "LINKEDIN" ? "LinkedIn" : "X"}</span>
                        {co.lastPost.url && (
                          <a href={co.lastPost.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-red-700 hover:underline">open <ExternalLink size={10} /></a>
                        )}
                        {lastInMonth && lastInMonth !== co.lastPost.date && <div className="text-gray-500">in {monthName(month).split(" ")[0]}: {shortDate(lastInMonth)}</div>}
                      </div>
                    ) : <span className="text-gray-400">none seen</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {co.accounts.length === 0 ? (
                      <span className="gx-pill bg-gray-100 text-gray-600"><HelpCircle size={11} /> no LinkedIn / X account</span>
                    ) : (
                      <div className="space-y-1">
                        {co.accounts.map((acc) => {
                          const st = isStale(acc.lastGood, nowMs);
                          return (
                            <div key={acc.connectionId} className="flex items-center gap-1.5" title={acc.error ? `Last error: ${acc.error}` : undefined}>
                              {st ? <XCircle size={12} className="text-red-600" /> : <CheckCircle2 size={12} className="text-green-700" />}
                              <span className={st ? "text-red-700" : "text-gray-700"}>{acc.platform === "LINKEDIN" ? "LinkedIn" : "X"} · {ago(acc.lastGood, nowMs)}</span>
                              {acc.verifierOkAt && <span className="text-gray-400" title={`Read by the Social Tracking verifier ${ago(acc.verifierOkAt, nowMs)}`}>· verifier ✓</span>}
                            </div>
                          );
                        })}
                        {stale && <div className="text-[11px] text-gray-500 flex items-center gap-1"><Clock size={10} /> stale (&gt; {STALE_EVIDENCE_HOURS} h) — <Link href="/extension" className="text-red-700 hover:underline">verify</Link></div>}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <Link href={`/clients/${co.id}`} className="text-red-700 hover:underline">Company →</Link>
                      <Link href={`/reports?clientId=${co.id}&month=${month}`} className="text-red-700 hover:underline inline-flex items-center gap-1"><FileText size={11} /> Monthly report</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed">
          A weekday counts once, whatever the number of posts, on LinkedIn or X, from the campaign start. Expected = weekdays × objective/5.
          Unknown = no post seen and no account read after that day (stale evidence): it stays in the attainment denominator but is never
          counted as missing. Pending = not due yet. Days are calendar days (UTC), the convention the collectors use.
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="gx-card p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-[26px] leading-tight font-semibold gx-num mt-1" style={{ color: color ?? "#15171C" }}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{note}</div>
    </div>
  );
}
