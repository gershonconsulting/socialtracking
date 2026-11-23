/**
 * Related people of a company (v0.9.0) — see lib/related-people/store.ts.
 *
 * GET                                   → the people, their accounts and their posts
 *                                         (last 30 days: count, last post, latest 5)
 * POST   { name, role?, linkedinUrl, xUrl? } → create the person (ACTIVE, so the
 *                                         collectors start reading the profile) and link it
 * DELETE ?personId=…                    → unlink and stop collecting (person ARCHIVED)
 */

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import rawDb from "@/lib/db-raw";
import { ClientStatus, ClientType, ConnectionStatus, Platform } from "@prisma/client";
import { requireOrgId } from "@/lib/competitors/store";
import {
  MAX_PEOPLE,
  cleanProfileUrl,
  cleanXUrl,
  getPeopleLinks,
  setPeopleLinks,
} from "@/lib/related-people/store";

const DAY = 24 * 60 * 60 * 1000;

function fail(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  const status = message === "NO_ORGANIZATION" || message === "UNAUTHORIZED" ? 401 : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "person"
  );
}

/** The company, through the scoped client: it must be one of this workspace's CAMPAIGN / INTERNAL companies. */
async function loadCompany(id: string) {
  return prisma.client.findUnique({ where: { id }, select: { id: true, name: true, slug: true, timezone: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const company = await loadCompany(id);
    if (!company) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
    const orgId = await requireOrgId();

    const links = await getPeopleLinks(orgId, id);
    const ids = links.map((l) => l.id);
    if (!ids.length) return NextResponse.json({ success: true, data: { people: [] } });

    const since = new Date(Date.now() - 30 * DAY);
    const [rows, posts] = await Promise.all([
      rawDb.client.findMany({
        where: { id: { in: ids }, organizationId: orgId },
        select: {
          id: true,
          name: true,
          status: true,
          platformConnections: {
            select: { platform: true, externalAccountUrl: true, lastSyncAt: true, lastSyncError: true },
          },
        },
      }),
      rawDb.socialPost.findMany({
        where: { clientId: { in: ids }, organizationId: orgId, publishedAtUtc: { gte: since } },
        orderBy: { publishedAtUtc: "desc" },
        take: 200,
        select: {
          id: true,
          clientId: true,
          platform: true,
          postUrl: true,
          postTextSnippet: true,
          publishedAtUtc: true,
          likeCount: true,
          commentCount: true,
          shareCount: true,
        },
      }),
    ]);

    const people = links
      .map((l) => {
        const r = rows.find((x) => x.id === l.id);
        if (!r) return null;
        const mine = posts.filter((p) => p.clientId === r.id);
        const li = r.platformConnections.find((c) => c.platform === Platform.LINKEDIN);
        const x = r.platformConnections.find((c) => c.platform === Platform.TWITTER);
        const lastSync = r.platformConnections
          .map((c) => c.lastSyncAt?.getTime() ?? 0)
          .reduce((a, b) => Math.max(a, b), 0);
        return {
          id: r.id,
          name: r.name.replace(/\s*\([^)]*\)\s*$/, ""),
          role: l.role,
          status: r.status,
          linkedinUrl: li?.externalAccountUrl ?? null,
          xUrl: x?.externalAccountUrl ?? null,
          lastCollectedAt: lastSync ? new Date(lastSync).toISOString() : null,
          lastError: li?.lastSyncError ?? x?.lastSyncError ?? null,
          posts30d: mine.length,
          lastPostAt: mine[0]?.publishedAtUtc.toISOString() ?? null,
          latest: mine.slice(0, 5).map((p) => ({
            id: p.id,
            platform: p.platform,
            url: p.postUrl,
            text: p.postTextSnippet,
            publishedAt: p.publishedAtUtc.toISOString(),
            engagement: p.likeCount + p.commentCount + p.shareCount,
          })),
        };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);

    return NextResponse.json({ success: true, data: { people } });
  } catch (err) {
    return fail(err, "Could not load related people");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const company = await loadCompany(id);
    if (!company) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
    const orgId = await requireOrgId();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const role = typeof body.role === "string" ? body.role.trim().slice(0, 120) || null : null;
    const linkedinUrl = cleanProfileUrl(body.linkedinUrl);
    const xUrl = cleanXUrl(body.xUrl);
    if (!name) return NextResponse.json({ success: false, error: "Name required" }, { status: 400 });
    if (!linkedinUrl) {
      return NextResponse.json(
        { success: false, error: "A LinkedIn profile link is required (linkedin.com/in/…)" },
        { status: 400 },
      );
    }

    const links = await getPeopleLinks(orgId, id);
    if (links.length >= MAX_PEOPLE) {
      return NextResponse.json({ success: false, error: `${MAX_PEOPLE} people maximum per company` }, { status: 400 });
    }

    // Same profile already tracked in this workspace → link that person instead of duplicating.
    const existingConn = await rawDb.platformConnection.findFirst({
      where: { organizationId: orgId, platform: Platform.LINKEDIN, externalAccountUrl: linkedinUrl },
      select: { clientId: true, client: { select: { clientType: true } } },
    });

    let personId: string;
    if (existingConn && existingConn.client.clientType === ClientType.COMPANY) {
      personId = existingConn.clientId;
      await rawDb.client.update({ where: { id: personId }, data: { status: ClientStatus.ACTIVE, archivedAt: null } });
    } else {
      const base = slugify(`${company.slug}-${name}`);
      let slug = base;
      for (let i = 2; i < 30; i++) {
        const taken = await rawDb.client.findUnique({ where: { slug }, select: { id: true } });
        if (!taken) break;
        slug = `${base}-${i}`;
      }
      const created = await rawDb.client.create({
        data: {
          name: `${name} (${company.name})`,
          slug,
          status: ClientStatus.ACTIVE,
          clientType: ClientType.COMPANY,
          timezone: company.timezone,
          organizationId: orgId,
          notes: `Related person of ${company.name}${role ? ` — ${role}` : ""} (added in Social Tracking)`,
        },
        select: { id: true },
      });
      personId = created.id;
      const conns: Array<[Platform, string]> = [[Platform.LINKEDIN, linkedinUrl]];
      if (xUrl) conns.push([Platform.TWITTER, xUrl]);
      for (const [platform, url] of conns) {
        await rawDb.platformConnection.create({
          data: {
            clientId: personId,
            platform,
            externalAccountUrl: url,
            connectionStatus: ConnectionStatus.PENDING,
            isMandatory: false,
            isEnabled: true,
            organizationId: orgId,
          },
        });
      }
    }

    if (!links.some((l) => l.id === personId)) links.push({ id: personId, role });
    await setPeopleLinks(orgId, id, links);
    return NextResponse.json({ success: true, data: { personId } });
  } catch (err) {
    return fail(err, "Could not add the person");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const company = await loadCompany(id);
    if (!company) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
    const orgId = await requireOrgId();
    const personId = req.nextUrl.searchParams.get("personId") || "";

    const links = await getPeopleLinks(orgId, id);
    if (!links.some((l) => l.id === personId)) {
      return NextResponse.json({ success: false, error: "Person not linked to this company" }, { status: 404 });
    }
    await setPeopleLinks(orgId, id, links.filter((l) => l.id !== personId));
    // Stop collecting; posts already collected are kept.
    await rawDb.client.updateMany({
      where: { id: personId, organizationId: orgId, clientType: ClientType.COMPANY },
      data: { status: ClientStatus.ARCHIVED, archivedAt: new Date(), archiveReason: "Removed from related people" },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return fail(err, "Could not remove the person");
  }
}
