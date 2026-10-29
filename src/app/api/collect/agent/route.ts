export const runtime = "edge";
/**
 * POST /api/collect/agent  { agentId, on }   (signed-in dashboard, v0.6.0)
 *
 * Switches one Chrome running the Post Verifier ON or OFF. OFF = that computer
 * is never handed a verification, and the extension (0.2.0+) stops its own
 * daily and catch-up runs within a minute. Reversible from any browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { orgFromSession } from "@/lib/session-org";
import { setAgentPaused } from "@/lib/remote-collect";

export async function POST(req: NextRequest) {
  const orgId = await orgFromSession();
  if (!orgId) return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { agentId?: unknown; on?: unknown } | null;
  const agentId = String(body?.agentId ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (!agentId || typeof body?.on !== "boolean") {
    return NextResponse.json({ success: false, error: "agentId and on (true/false) required" }, { status: 400 });
  }
  try {
    await setAgentPaused(orgId, agentId, !body.on);
    return NextResponse.json({ success: true, data: { agentId, on: body.on } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
