"use client";

/**
 * Monthly reports — v0.7.0 redesign (Olivier, 2026-10-29).
 *
 * One place for the month's reports, in the one-pager look:
 *   - the Campaigns report and the Internal report (to report@ / sales@),
 *   - each campaign company's own one-page report (to its contacts),
 * each with its live preview (the exact email), its PDF, and who receives it.
 * Sent automatically in the first days of each month (idempotent per report);
 * this page only previews — nothing is sent from here.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileDown, Loader2, Mail, Newspaper, Users, Building2 } from "lucide-react";

type Cat = { key: string; label: string; head: string; lead: string; companies: number; posts: number; eng: number; pct: number | null; to: string[] };
type Co = { id: string; name: string; head: string; pct: number | null; posts: number; eng: number; to: string[] };
type Index = { month: string; name: string; categories: Cat[]; companies: Co[] };
type Sel = { kind: "category"; key: string } | { kind: "company"; id: string };

const pad = (n: number) => String(n).padStart(2, "0");
function closedMonths(n = 12): Array<{ key: string; label: string }> {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1 - i, 1));
    return { key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, label: d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
}
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const tone = (p: number | null) => (p === null ? "#6b7280" : p >= 100 ? "#16a34a" : p >= 50 ? "#ea580c" : "#CC3333");

export default function ReportsPage() {
  const months = useMemo(() => closedMonths(), []);
  const [month, setMonth] = useState(months[0].key);
  const [idx, setIdx] = useState<Index | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Sel | null>(null);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setIdx(null); setSel(null);
    fetch(`/api/report/monthly?format=index&month=${month}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok || !j?.success) throw new Error(j?.error || "Could not load the reports");
        setIdx(j.data);
        if (j.data.categories[0]) setSel({ kind: "category", key: j.data.categories[0].key });
        else if (j.data.companies[0]) setSel({ kind: "company", id: j.data.companies[0].id });
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the reports"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [month]);

  const q = (s: Sel, pdf = false) =>
    `/api/report/monthly?${s.kind === "category" ? `category=${s.key}` : `company=${s.id}`}&month=${month}${pdf ? "&format=pdf" : ""}`;
  const isSel = (s: Sel) => !!sel && sel.kind === s.kind && (s.kind === "category" ? sel.kind === "category" && sel.key === s.key : sel.kind === "company" && sel.id === s.id);
  const monthName = months.find((m) => m.key === month)?.label ?? month;

  return (
    <div className="space-y-5">
      {/* Header band */}
      <section className="relative overflow-hidden rounded-2xl text-white shadow-[0_10px_40px_rgba(168,40,31,0.25)]"
        style={{ background: "linear-gradient(120deg, #CC3333 0%, #a8281f 60%, #6f1a14 100%)" }}>
        <svg className="absolute right-0 top-0 h-full opacity-[0.10] pointer-events-none" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={400} cy={100} r={30 + i * 34} fill="none" stroke="#fff" strokeWidth="1.5" />)}
        </svg>
        <div className="relative p-6 lg:p-7 flex flex-wrap items-end gap-6">
          <div className="flex-1 min-w-[260px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Social Tracking · Monthly reports</div>
            <h1 className="mt-1 text-[30px] leading-tight font-bold tracking-tight">{monthName}</h1>
            <p className="mt-1.5 text-sm text-white/85 max-w-[620px]">
              One page each, positives only. Every campaign client receives its own one-pager, and the Gershon team gets the
              Campaigns summary — automatically in the first days of the month. Preview them here exactly as they are sent.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-lg bg-white text-[#a8281f] font-semibold text-sm px-3 border-0">
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <Link href={`/onepager?month=${month}`}
              className="inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-white/15 ring-1 ring-white/30 text-white text-sm font-bold px-4 hover:bg-white/25">
              <Newspaper size={16} /> {monthName} client one-pagers
            </Link>
          </div>
        </div>
      </section>

      {loading && <div className="gx-card p-8 flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Building the {monthName} reports…</div>}
      {error && <div className="gx-card p-6 text-sm text-red-700">{error}</div>}
      {idx && !idx.categories.length && !idx.companies.length && (
        <div className="gx-card p-6 text-sm text-gray-600">No campaign or internal company published anything in {idx.name} — there is no report for that month.</div>
      )}

      {idx && (idx.categories.length > 0 || idx.companies.length > 0) && (
        <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
          {/* List */}
          <div className="space-y-4">
            {idx.categories.length > 0 && (
              <div className="gx-card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500 flex items-center gap-2"><Users size={13} /> Team reports</div>
                {idx.categories.map((c) => {
                  const s: Sel = { kind: "category", key: c.key };
                  return (
                    <ReportRow key={c.key} active={isSel(s)} onClick={() => setSel(s)}
                      title={`${c.label} report`} head={c.head}
                      big={c.pct !== null ? `${c.pct}%` : fmt(c.posts)} bigColor={tone(c.pct)}
                      sub={`${c.companies} companies · ${fmt(c.posts)} posts · ${fmt(c.eng)} engagements`} to={c.to} />
                  );
                })}
              </div>
            )}
            {idx.companies.length > 0 && (
              <div className="gx-card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500 flex items-center gap-2"><Building2 size={13} /> Client one-pagers ({idx.companies.length})</div>
                {idx.companies.map((c) => {
                  const s: Sel = { kind: "company", id: c.id };
                  return (
                    <ReportRow key={c.id} active={isSel(s)} onClick={() => setSel(s)}
                      title={c.name} head={c.head}
                      big={c.pct !== null ? `${c.pct}%` : `${c.posts}`} bigColor={tone(c.pct)}
                      sub={`${c.posts} posts · ${fmt(c.eng)} engagements`} to={c.to} />
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          {sel && (
            <div className="gx-card overflow-hidden flex flex-col min-h-[720px]">
              <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Mail size={15} className="text-gray-400" /> Email preview</span>
                <span className="flex-1" />
                <a href={q(sel)} target="_blank" rel="noreferrer" className="gx-btn-secondary"><ExternalLink size={14} /> Open</a>
                <a href={q(sel, true)} target="_blank" rel="noreferrer" className="gx-btn-primary"><FileDown size={14} /> PDF</a>
              </div>
              <iframe key={q(sel)} src={q(sel)} title="Report preview" className="flex-1 w-full bg-[#f3f2ee]" style={{ minHeight: 1000, border: 0 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportRow({ active, onClick, title, head, big, bigColor, sub, to }: {
  active: boolean; onClick: () => void; title: string; head: string; big: string; bigColor: string; sub: string; to: string[];
}) {
  return (
    <button onClick={onClick}
      className={"w-full text-left px-4 py-3 border-t border-gray-100 first:border-t-0 flex items-start gap-3 transition-colors " +
        (active ? "bg-[#fdf2f2] shadow-[inset_3px_0_0_#CC3333]" : "hover:bg-gray-50")}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
        <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{head}</div>
        <div className="text-[11px] text-gray-500 mt-1">{sub}</div>
        <div className={"text-[11px] mt-1 truncate " + (to.length ? "text-gray-500" : "text-amber-700")}>
          {to.length ? `→ ${to.join(", ")}` : "No report email on file — not sent"}
        </div>
      </div>
      <div className="text-xl font-bold tabular-nums shrink-0" style={{ color: bigColor }}>{big}</div>
    </button>
  );
}
