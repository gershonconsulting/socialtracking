"use client";

/**
 * Client one-pager (v0.8.0) — ONE campaign company, ONE month: the page we send
 * the client as its monthly report. Same view model (lib/reports/monthly/
 * onepage.ts OnePageView) as the email and the PDF, so all three say the same
 * thing. Client rules from model.ts: positives only, no followers, a day with no
 * post is plain grey.
 */
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, FileDown, Printer } from "lucide-react";
import type { OnePageView } from "@/lib/reports/monthly/onepage";
import type { ReportPost } from "@/lib/reports/monthly/model";

const RED = "#CC3333", RED_DARK = "#a8281f", TINT = "#fdf2f2", INK = "#1d1d1f", LI = "#0A66C2", X = "#15171C", GOOD = "#16a34a";
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export interface ClientPick { id: string; name: string; logoUrl: string | null; pct: number | null; posts: number; sub: string }

export function ClientOnePager({ view, month, months, companyId, companies, logoUrl, pdfHref, recipients, inProgress }: {
  view: OnePageView; month: string; months: Array<{ key: string; label: string }>; companyId: string;
  companies: Array<{ id: string; name: string }>; logoUrl: string | null; pdfHref: string; recipients: string[]; inProgress: boolean;
}) {
  const q = (m: string, c = companyId) => `/onepager?company=${c}&month=${m}`;
  const weekend = (d: number) => { const w = new Date(Date.UTC(view.calendar.year, view.calendar.month, d)).getUTCDay(); return w === 0 || w === 6; };
  const row = view.calendar.rows[0];
  const posts = view.posts ?? [];
  return (
    <div className="onepager min-h-screen bg-[#F3F2EE] print:bg-white" style={{ color: INK }}>
      <style>{`
        @page { size: letter portrait; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          .onepager { min-height: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .onepager-sheet { box-shadow: none !important; margin: 0 !important; border: 0 !important; max-width: none !important; zoom: 0.7; }
          .post-more { display: none !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#e5e7eb]">
        <div className="max-w-[1000px] mx-auto px-6 h-14 flex items-center gap-3">
          <Link href={`/onepager?month=${month}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
            <ArrowLeft size={16} /> All clients
          </Link>
          <span className="text-gray-300">|</span>
          <select aria-label="Client" value={companyId} onChange={(e) => { window.location.href = q(month, e.target.value); }}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-sm font-semibold max-w-[220px]">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Month" value={month} onChange={(e) => { window.location.href = q(e.target.value); }}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-sm font-medium">
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <div className="flex-1" />
          <span className="hidden lg:inline text-xs text-gray-500 truncate max-w-[220px]" title={recipients.join(", ")}>
            {recipients.length ? `Sent to ${recipients.join(", ")}` : "No report email on file"}
          </span>
          <a href={pdfHref} className="h-9 inline-flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-medium hover:bg-gray-50">
            <FileDown size={15} /> PDF
          </a>
          <button onClick={() => window.print()} className="h-9 inline-flex items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-white" style={{ background: RED }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="onepager-sheet max-w-[1000px] mx-auto my-6 bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-[#e5e7eb] overflow-hidden">
        {/* Header */}
        <header className="relative px-9 pt-8 pb-7 text-white" style={{ background: `linear-gradient(120deg, ${RED} 0%, ${RED_DARK} 62%, #6f1a14 100%)` }}>
          <svg className="absolute right-0 top-0 h-full opacity-[0.10]" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={400} cy={100} r={30 + i * 34} fill="none" stroke="#fff" strokeWidth="1.5" />)}
          </svg>
          <div className="relative flex items-center gap-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="" className="w-16 h-16 rounded-xl bg-white object-contain p-1.5 shrink-0" />
              : <span className="w-16 h-16 rounded-xl bg-white/15 ring-1 ring-white/30 flex items-center justify-center text-xl font-bold shrink-0">{view.who.slice(0, 2).toUpperCase()}</span>}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">{view.eyebrow} · {view.who}</div>
              <h1 className="mt-1 text-[38px] leading-none font-bold tracking-tight">{view.title}{inProgress ? <span className="text-white/70 text-xl font-semibold"> · to date</span> : null}</h1>
              <p className="mt-3 text-[16px] font-semibold">{view.headline}</p>
              <p className="mt-1 text-[13.5px] text-white/85 max-w-[620px]">{view.lead}</p>
            </div>
            {view.big && <Ring value={view.big.value} label={view.big.label} />}
          </div>
        </header>

        {/* Tiles */}
        <section className="grid grid-cols-4 border-b border-[#e5e7eb]">
          {view.tiles.map((t, i) => (
            <div key={i} className={"px-6 py-5 " + (i < 3 ? "border-r border-[#e5e7eb]" : "")}>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gray-500">{t.label}</div>
              <div className="mt-1.5 text-[28px] font-bold leading-none tabular-nums" style={{ color: t.color === "good" ? GOOD : t.color === "red" ? RED : INK }}>{t.value}</div>
              <div className="mt-1.5 text-[11.5px] text-gray-500">{t.sub}</div>
            </div>
          ))}
        </section>

        {/* Calendar */}
        {row && (
          <section className="px-8 py-6 border-b border-[#e5e7eb]">
            <div className="flex items-end justify-between">
              <H2>{view.calendar.title}</H2>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <Lg c={LI} t="LinkedIn" /><Lg c={X} t="X" /><Lg c={`linear-gradient(180deg, ${LI} 58%, ${X} 58%)`} t="Both" />
                <span className="font-semibold text-gray-700">{row.value} · {row.sub}</span>
              </div>
            </div>
            <div className="mt-3 grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${view.calendar.dim}, minmax(0, 1fr))` }}>
              {row.days.map((f, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="block w-full aspect-square rounded-[5px]" title={`${i + 1}`}
                    style={{ background: f === 1 ? LI : f === 2 ? X : f === 3 ? `linear-gradient(180deg, ${LI} 58%, ${X} 58%)` : weekend(i + 1) ? "#f7f7f8" : "#eef0f3" }} />
                  <span className={"text-[10px] tabular-nums " + (weekend(i + 1) ? "text-gray-300" : "text-gray-500")}>{i + 1}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* What went well + best posts */}
        <section className="grid grid-cols-[1fr_1.25fr] border-b border-[#e5e7eb]">
          <div className="px-8 py-6 border-r border-[#e5e7eb]">
            <H2>What went well</H2>
            <ul className="mt-3 space-y-3">
              {view.wins.map(([a, b], i) => (
                <li key={i} className="flex gap-2.5">
                  <CheckCircle2 size={17} className="shrink-0 mt-px" style={{ color: GOOD }} />
                  <div><div className="text-[13.5px] font-semibold leading-snug">{a}</div><div className="text-[12.5px] text-gray-500 mt-0.5">{b}</div></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="px-8 py-6">
            <H2>Best posts</H2>
            {view.top.length === 0 ? <p className="mt-3 text-sm text-gray-500">No post this month.</p> : (
              <div className="mt-3 space-y-2.5">{view.top.map((p, i) => <Top key={i} p={p} rank={i + 1} />)}</div>
            )}
          </div>
        </section>

        {/* Everything published */}
        {posts.length > 0 && (
          <section className="px-8 py-6 border-b border-[#e5e7eb]">
            <div className="flex items-end justify-between">
              <H2>Everything published</H2>
              <span className="text-[11px] text-gray-500">{posts.length} posts · engagements = likes + comments + reposts</span>
            </div>
            <ol className="mt-3 columns-2 gap-x-8">
              {posts.map((p, i) => (
                <li key={i} className={"break-inside-avoid mb-1.5 text-[12px] " + (i >= 30 ? "post-more" : "")}>
                  <a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 hover:bg-gray-50 rounded">
                    <span className="w-[44px] shrink-0 text-gray-500 tabular-nums">{p.date}</span>
                    <Net net={p.net} />
                    <span className="truncate flex-1 min-w-0 text-gray-700">{p.text || "Image or video post"}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{p.eng || ""}</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Ideas */}
        {view.extra && (
          <section className="px-8 py-6">
            <H2>{view.extra.title}</H2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {view.extra.items.map(([a, b], i) => (
                <div key={i} className="rounded-xl border border-[#e5e7eb] p-4" style={i === 0 ? { background: TINT, borderColor: "#f3c9c5" } : undefined}>
                  <div className="text-[13px] font-semibold leading-snug">{a}</div>
                  <div className="text-[12px] text-gray-500 mt-1">{b}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="px-8 py-3 bg-[#FAFAF8] border-t border-[#e5e7eb] text-[10.5px] text-gray-500 flex justify-between">
          <span>{view.footer} · measured daily from the public LinkedIn and X pages</span>
          <span>Gershon.AI</span>
        </footer>
      </div>
    </div>
  );
}

/** /onepager without ?company= — pick the client. */
export function ClientPicker({ month, months, clients }: { month: string; months: Array<{ key: string; label: string }>; clients: ClientPick[] }) {
  const label = months.find((m) => m.key === month)?.label ?? month;
  return (
    <div className="min-h-screen bg-[#F3F2EE]" style={{ color: INK }}>
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[#e5e7eb]">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft size={16} /> Dashboard</Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold">Client one-pagers</span>
          <div className="flex-1" />
          <select aria-label="Month" value={month} onChange={(e) => { window.location.href = `/onepager?month=${e.target.value}`; }}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-sm font-medium">
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="rounded-2xl text-white px-8 py-7 relative overflow-hidden" style={{ background: `linear-gradient(120deg, ${RED} 0%, ${RED_DARK} 62%, #6f1a14 100%)` }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Monthly one-pager · one per campaign client</div>
          <h1 className="mt-1 text-[34px] font-bold leading-tight">{label}</h1>
          <p className="mt-1.5 text-sm text-white/85">Pick a client to open the one-pager it receives as its monthly report — print it, download the PDF, or check it before it goes out.</p>
        </div>
        {clients.length === 0 ? <p className="mt-6 text-sm text-gray-600">No active campaign client.</p> : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => {
              const col = c.pct === null ? "#6b7280" : c.pct >= 100 ? GOOD : c.pct >= 50 ? "#ea580c" : RED;
              return (
                <Link key={c.id} href={`/onepager?company=${c.id}&month=${month}`}
                  className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain border border-[#e5e7eb] shrink-0" />
                    : <span className="w-10 h-10 rounded-lg text-white text-sm font-bold flex items-center justify-center shrink-0" style={{ background: INK }}>{c.name.slice(0, 2).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-gray-500 truncate">{c.sub}</div>
                  </div>
                  <div className="text-xl font-bold tabular-nums" style={{ color: col }}>{c.pct === null ? "—" : `${c.pct}%`}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] flex items-center gap-2"><span className="h-3.5 w-1 rounded-full" style={{ background: RED }} />{children}</h2>;
}
function Lg({ c, t }: { c: string; t: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />{t}</span>;
}
function Ring({ value, label }: { value: string; label: string }) {
  const pct = Math.min(100, parseFloat(value) || 0), r = 52, c = 2 * Math.PI * r;
  const isPct = value.endsWith("%");
  return (
    <div className="relative shrink-0 w-[150px] h-[150px]">
      <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
        <circle cx="65" cy="65" r={r} fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${isPct ? (c * pct) / 100 : c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[32px] font-bold leading-none tabular-nums">{value}</div>
        <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/80">{label}</div>
      </div>
    </div>
  );
}
function Net({ net }: { net: string }) {
  const li = net === "LinkedIn";
  return <span className="inline-flex items-center justify-center h-[15px] min-w-[15px] px-[3px] rounded-[3px] text-[9px] font-bold text-white shrink-0" style={{ background: li ? LI : X }}>{li ? "in" : "X"}</span>;
}
function Top({ p, rank }: { p: ReportPost; rank: number }) {
  return (
    <div className="rounded-xl border p-3.5 flex gap-3" style={rank === 1 ? { background: TINT, borderColor: "#f3c9c5" } : { borderColor: "#e5e7eb" }}>
      <span className="h-6 w-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: rank === 1 ? RED : INK }}>{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-snug text-gray-800 line-clamp-3">{p.text || "Image or video post"}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="font-bold text-[14px] tabular-nums" style={{ color: INK }}>{fmt(p.eng)}</span> engagements · <Net net={p.net} /> {p.date}
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="no-print ml-auto text-gray-400 hover:text-gray-700"><ExternalLink size={12} /></a>}
        </div>
      </div>
    </div>
  );
}
