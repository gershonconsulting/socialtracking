export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { primaryOrgId } from "@/lib/reports/monthly/data";
import { renderWeekly, runWeeklyReport } from "@/lib/reports/weekly";

/**
 * Weekly work report → social@gershonconsulting.com (Olivier, 2026-10-26).
 *
 * GET  /api/report/weekly[?week=YYYY-MM-DD&format=html|pdf|json]  — preview (default: last full Mon–Sun week)
 * POST /api/report/weekly[?week=&force=1&dry=1&to=a@b.com]        — build AND send; idempotent per week
 *      (`to` sends a one-off test copy and does not mark the week as sent)
 * Auth: Bearer CRON_SECRET / DIGEST_SECRET / REPORT_CRON_KEY, or an ADMIN of the primary workspace.
 * Schedule: Mondays 12:30 UTC (08:30 New York) — see cron/ in this repo.
 */
function secretOk(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  return [process.env.CRON_SECRET, process.env.DIGEST_SECRET, process.env.REPORT_CRON_KEY]
    .some((s) => !!s && auth === `Bearer ${s}`);
}
async function adminOk() {
  const s = await getSession();
  if (!s?.user || s.user.role !== "ADMIN") return false;
  return s.user.organizationId === (await primaryOrgId());
}

export async function GET(req: NextRequest) {
  if (!secretOk(req) && !(await adminOk())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const r = await renderWeekly(url.searchParams.get("week"));
    const format = url.searchParams.get("format") || "html";
    if (format === "json") return NextResponse.json({ success: true, data: { subject: r.subject, week: r.win, pct: r.pct, companies: r.data.companies, perDay: r.data.perDay } });
    if (format === "pdf") return new NextResponse(r.pdf.bytes() as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.filename}"` } });
    return new NextResponse(r.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "build failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!secretOk(req) && !(await adminOk())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const to = (url.searchParams.get("to") || "").split(",").map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    const r = await runWeeklyReport({
      week: url.searchParams.get("week"),
      force: url.searchParams.get("force") === "1",
      dry: url.searchParams.get("dry") === "1",
      to,
    });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "send failed" }, { status: 500 });
  }
}
