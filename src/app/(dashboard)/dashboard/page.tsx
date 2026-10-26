export const runtime = 'edge';
import { Suspense } from "react";
import { TrackingDashboard } from "@/components/tracking/dashboard-data";

export const dynamic = "force-dynamic";

/**
 * Social Tracking's own Dashboard (v0.4.0) — the campaign command center for
 * CAMPAIGN + INTERNAL companies: was the agreed posting done, what is in stock,
 * how the posts perform, efficiency over the campaign, and what needs attention.
 * PRODUCT_HOME. The company-by-company month view is /summary.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-gray-400">Loading dashboard…</div>}>
      <TrackingDashboard />
    </Suspense>
  );
}
