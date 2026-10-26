export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { dbForOrg } from "@/lib/scoped-db";
import { resolveExtensionCaller } from "@/lib/extension-auth";
import { PRODUCT_CLIENT_TYPES } from "@/lib/product";

/**
 * GET /api/extension/clients  (extension workspace token)
 *
 * Social Tracking v0.4.0 — the companies the Post Verifier extension checks:
 * ACTIVE CAMPAIGN and INTERNAL companies only (PRODUCT_CLIENT_TYPES), with
 * their LinkedIn / X accounts. Scoped to the workspace the token belongs to
 * (lib/extension-auth.ts: no token, no workspace — never a fallback), and the
 * product scope is applied twice: by dbForOrg (lib/scoped-db.ts) and by the
 * explicit clientType filter below.
 *
 * Response: { success, data: { clients: [{ id, name, slug, category,
 *   linkedin: { connectionId, url, vanity } | null,
 *   twitter:  { connectionId, url, handle } | null }], totalClients } }
 */
// Campaign companies first (they are what the monthly reports are about).
const SCRAPE_PRIORITY = ["CAMPAIGN", "INTERNAL"];
const priorityRank = (t: string) => {
  const i = SCRAPE_PRIORITY.indexOf(t);
  return i === -1 ? SCRAPE_PRIORITY.length : i;
};

export async function GET(req: NextRequest) {
  try {
    const caller = await resolveExtensionCaller(req);
    if (!caller.ok) {
      return NextResponse.json(
        { success: false, error: "Unrecognised extension token" },
        { status: 401 },
      );
    }
    const db = dbForOrg(caller.orgId);

    const clients = await db.client.findMany({
      where: { status: "ACTIVE", clientType: { in: [...PRODUCT_CLIENT_TYPES] } },
      orderBy: { name: "asc" },
      include: {
        platformConnections: {
          where: {
            isEnabled: true,
            platform: { in: [Platform.LINKEDIN, Platform.TWITTER] },
            externalAccountUrl: { not: null },
          },
          select: { id: true, platform: true, externalAccountUrl: true },
        },
      },
    });

    const out: Array<{
      id: string;
      name: string;
      slug: string;
      category: string;
      linkedin: { connectionId: string; url: string; vanity: string } | null;
      twitter: { connectionId: string; url: string; handle: string } | null;
    }> = [];

    clients.sort((a, b) =>
      priorityRank(a.clientType) - priorityRank(b.clientType) ||
      a.name.localeCompare(b.name)
    );

    for (const c of clients) {
      const li = c.platformConnections.find((p) => p.platform === Platform.LINKEDIN);
      const tw = c.platformConnections.find((p) => p.platform === Platform.TWITTER);
      let linkedin: { connectionId: string; url: string; vanity: string } | null = null;
      let twitter: { connectionId: string; url: string; handle: string } | null = null;
      if (li?.externalAccountUrl) {
        const m = li.externalAccountUrl.match(/linkedin\.com\/(?:company|in|school)\/([^/?#]+)/i);
        if (m) linkedin = { connectionId: li.id, url: li.externalAccountUrl, vanity: m[1] };
      }
      if (tw?.externalAccountUrl) {
        const m = tw.externalAccountUrl.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,20})/i);
        if (m) twitter = { connectionId: tw.id, url: tw.externalAccountUrl, handle: m[1] };
      }
      if (!linkedin && !twitter) continue;
      if (!(PRODUCT_CLIENT_TYPES as readonly string[]).includes(c.clientType)) continue;
      out.push({ id: c.id, name: c.name, slug: c.slug, category: c.clientType, linkedin, twitter });
    }

    return NextResponse.json({ success: true, data: { clients: out, totalClients: out.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
