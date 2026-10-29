export const runtime = "edge";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadOnePager } from "@/lib/tracking/onepager";
import { defaultMonth } from "@/lib/tracking/onepager-model";
import { addMonths, toS } from "@/lib/tracking/attainment";
import { OnePagerView } from "@/components/tracking/onepager-view";
import { PRODUCT_NAME } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * /onepager?month=YYYY-MM[&internal=1] — v0.6.0. The monthly one-pager: what
 * was posted and what happened, on one printable landscape page. Defaults to
 * LAST month (a finished month); the current month can be picked too (marked
 * provisional where days are still to come). Outside the dashboard layout so
 * it prints clean; the middleware still requires a Gershon session.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const m = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month : defaultMonth(toS(new Date()));
  return { title: `One-pager ${m} · ${PRODUCT_NAME} by Gershon.AI` };
}

export default async function OnePagerPage({ searchParams }: { searchParams: Promise<{ month?: string; internal?: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const today = toS(new Date());
  const current = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") && sp.month! <= current ? sp.month! : defaultMonth(today);
  const data = await loadOnePager(month, sp.internal === "1");
  const months = Array.from({ length: 13 }, (_, i) => addMonths(current, -i));
  return <OnePagerView data={data} months={months} />;
}
