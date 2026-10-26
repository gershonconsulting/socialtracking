export const runtime = "edge";
/**
 * POST /api/collect/request  (signed-in dashboard)   body: { clientId?: string, deep?: true }
 *
 * Queues a VERIFICATION collection — one company, or every campaign and
 * internal company when clientId is absent. A Chrome running the Social
 * Tracking extension (Post Verifier) picks it up within a minute and checks the
 * pages in its own minimized window. Tracking's own queue
 * ("tracking_collect_queue"): Social's collector never takes these jobs.
 */
import { NextRequest, NextResponse } from "next/server";
import { orgFromSession } from "@/lib/session-org";
import { queueStatus, requestCollection } from "@/lib/remote-collect";

export async function POST(req: NextRequest) {
  const orgId = await orgFromSession();
  if (!orgId) return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  let clientId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    clientId = typeof body?.clientId === "string" && body.clientId ? body.clientId : null;
    // v4.63.0: { deep: true } = full history for one company (scrolls ~8× further back).
    const deep = body?.deep === true && !!clientId;
    const job = await requestCollection(orgId, clientId, undefined, deep);
    const { listening } = await queueStatus(orgId);
    return NextResponse.json({ success: true, data: { job, listening } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
