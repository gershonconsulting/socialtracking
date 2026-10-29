export const runtime = "edge";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";
import { addMonths, toS } from "@/lib/tracking/attainment";
import { ClientOnePager, ClientPicker, type ClientPick } from "@/components/tracking/client-onepager";
import { buildClientOnePager, CompanyReportError } from "@/lib/reports/monthly/company-download";
import { loadCategories, monthWindow, primaryOrgId } from "@/lib/reports/monthly/data";
import { PRODUCT_NAME } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * /onepager — v0.8.0 (Olivier, 2026-10-29): "a one pager per company we do
 * campaign for so we can send it for the monthly report. No need for internal,
 * just the clients."
 *   /onepager?month=YYYY-MM                  → pick a campaign client
 *   /onepager?company=<id>&month=YYYY-MM     → that client's one-pager — the same
 *     content as the monthly report email and PDF it receives (one view model).
 * Default month: last month. Outside the dashboard layout so it prints clean.
 */
const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  return { title: `One-pager ${sp.month ?? ""} · ${PRODUCT_NAME} by Gershon.AI` };
}

export default async function OnePagerPage({ searchParams }: { searchParams: Promise<{ month?: string; company?: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const today = toS(new Date());
  const current = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") && sp.month! <= current ? sp.month! : addMonths(current, -1);
  const months = Array.from({ length: 13 }, (_, i) => addMonths(current, -i)).map((k) => ({ key: k, label: k === current ? `${monthLabel(k)} (to date)` : monthLabel(k) }));

  const clients = await prisma.client.findMany({
    where: { clientType: "CAMPAIGN", status: "ACTIVE" },
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: "asc" },
  });

  if (sp.company) {
    try {
      const r = await buildClientOnePager(sp.company, month);
      if (r.client.clientType !== "CAMPAIGN") redirect(`/onepager?month=${month}`);
      const logo = clients.find((c) => c.id === r.client.id)?.logoUrl ?? null;
      return (
        <ClientOnePager view={r.view} month={month} months={months} companyId={r.client.id}
          companies={clients.map((c) => ({ id: c.id, name: c.name }))} logoUrl={logo}
          pdfHref={`/api/clients/${r.client.id}/report-pdf?month=${month}`} recipients={r.recipients} inProgress={r.inProgress} />
      );
    } catch (e) {
      if (e instanceof CompanyReportError && e.status === 404) redirect(`/onepager?month=${month}`);
      throw e;
    }
  }

  // Picker: each campaign client with its objective % for the month (same rule as its report).
  const win = monthWindow(month);
  const orgId = await primaryOrgId();
  const cats = await loadCategories(win, orgId);
  const byId = new Map((cats.find((c) => c.key === "CAMPAIGN")?.companies ?? []).map((c) => [c.id, c]));
  const inProgress = month === current;
  const frac = inProgress ? Number(today.slice(8)) / win.dim : 1;
  const picks: ClientPick[] = clients.map((c) => {
    const m = byId.get(c.id);
    const posts = m ? m.li + m.x : 0;
    const target = m?.objective ? Math.max(1, Math.round(m.objective.target * frac)) : null;
    return {
      id: c.id, name: c.name, logoUrl: c.logoUrl,
      pct: target ? Math.round((100 * posts) / target) : null,
      posts,
      sub: target ? `${posts} of ${target} posts${inProgress ? " so far" : ""} · ${m!.objective!.perWeek}/week` : `${posts} posts`,
    };
  });
  return <ClientPicker month={month} months={months} clients={picks} />;
}
