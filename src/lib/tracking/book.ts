/**
 * The Tracking book (v0.4.0): every ACTIVE CAMPAIGN and INTERNAL company, with
 * what is needed to judge "was the agreed work done?" — the weekdays it posted
 * (all time, LinkedIn / X), its objective, campaign start, last post, and how
 * fresh the evidence is per account. Shared by /dashboard and /summary.
 *
 * Everything heavy is aggregated in the database (never raw posts into the
 * edge worker — see project_social_outage_2026_08_21): one row per company per
 * posting day.
 *
 * EVIDENCE per account = the latest of
 *   - the last time ANY collector wrote one of its posts (SocialPost.updatedAt
 *     is touched by every upsert, Social's collector and Tracking's verifier),
 *   - PlatformConnection.lastSyncAt when that read reported no error,
 *   - Tracking's own verifier log (lib/extension/evidence.ts, okAt).
 */
import prisma from "@/lib/db";
import { PRODUCT_CLIENT_TYPES } from "@/lib/product";
import { getCurrentOrgId } from "@/lib/scoped-db";
import { objectivesFor } from "@/lib/campaigns/objectives";
import { readEvidence, type Evidence } from "@/lib/extension/evidence";
import { companyEvidence, DEFAULT_PER_WEEK, toS } from "@/lib/tracking/attainment";

export const NET_KEYS = ["LINKEDIN", "TWITTER"] as const;

export interface BookAccount {
  platform: "LINKEDIN" | "TWITTER";
  connectionId: string;
  url: string | null;
  /** Latest good read by any collector (ISO) — null = never read. */
  lastGood: string | null;
  /** Latest read by Tracking's own verifier (ISO), and its error if it failed. */
  verifierAt: string | null;
  verifierOkAt: string | null;
  error: string | null;
}

export interface BookCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  clientType: string;
  perWeek: number;
  /** YYYY-MM-DD — campaignStartDate, else the first posting month. */
  campaignStart: string | null;
  accounts: BookAccount[];
  /** Oldest last-good read across its accounts (null if one was never read / no account). */
  evidenceAt: string | null;
  evidenceDate: string | null;
  lastPost: { date: string; url: string | null; platform: string } | null;
  /** Posting weekdays, all time: "YYYY-MM-DD" → 1 LinkedIn, 2 X, 3 both. */
  posted: Record<string, number>;
}

export interface Book {
  companies: BookCompany[];
  today: string;
  generatedAt: string;
}

type DayRow = { clientId: string; d: string; li: boolean; x: boolean };
type LastRow = { clientId: string; d: string; url: string | null; platform: string };
type UpdRow = { platformConnectionId: string; u: Date };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const later = (...xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort().pop() ?? null;

export async function loadBook(): Promise<Book> {
  const now = new Date();
  const today = toS(now);
  const clients = await prisma.client.findMany({
    where: { status: "ACTIVE", clientType: { in: [...PRODUCT_CLIENT_TYPES] } },
    select: { id: true, name: true, logoUrl: true, clientType: true, campaignStartDate: true },
    orderBy: { name: "asc" },
  });
  const ids = clients.map((c) => c.id);
  const orgId = await getCurrentOrgId().catch(() => null);
  if (!ids.length) return { companies: [], today, generatedAt: now.toISOString() };

  const [days, last, conns, upd, evidence, obj] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT "clientId", "publishedDateLocal" AS d,
             bool_or(platform::text = 'LINKEDIN') AS li,
             bool_or(platform::text = 'TWITTER') AS x
      FROM social_posts
      WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
        AND EXTRACT(ISODOW FROM to_date("publishedDateLocal", 'YYYY-MM-DD')) < 6
      GROUP BY 1,2`,
    prisma.$queryRaw<LastRow[]>`
      SELECT DISTINCT ON ("clientId") "clientId", "publishedDateLocal" AS d, "postUrl" AS url, platform::text AS platform
      FROM social_posts
      WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
      ORDER BY "clientId", "publishedAtUtc" DESC`,
    prisma.platformConnection.findMany({
      where: { clientId: { in: ids }, isEnabled: true, externalAccountUrl: { not: null }, platform: { in: ["LINKEDIN", "TWITTER"] } },
      select: { id: true, clientId: true, platform: true, externalAccountUrl: true, lastSyncAt: true, lastSyncError: true },
    }),
    prisma.$queryRaw<UpdRow[]>`
      SELECT "platformConnectionId", MAX("updatedAt") AS u
      FROM social_posts WHERE "clientId" = ANY(${ids})
      GROUP BY 1`,
    orgId ? readEvidence(orgId).catch(() => ({}) as Evidence) : Promise.resolve({} as Evidence),
    orgId ? objectivesFor(orgId, clients).catch(() => null) : Promise.resolve(null),
  ]);

  const updM = new Map(upd.map((r) => [r.platformConnectionId, iso(new Date(r.u))]));
  const lastM = new Map(last.map((r) => [r.clientId, r]));
  const postedM = new Map<string, Record<string, number>>();
  const firstDay = new Map<string, string>();
  for (const r of days) {
    const m = postedM.get(r.clientId) ?? {};
    m[r.d] = (r.li ? 1 : 0) | (r.x ? 2 : 0);
    postedM.set(r.clientId, m);
    const f = firstDay.get(r.clientId);
    if (!f || r.d < f) firstDay.set(r.clientId, r.d);
  }

  const companies: BookCompany[] = clients.map((c) => {
    const accounts: BookAccount[] = conns
      .filter((x) => x.clientId === c.id)
      .map((x) => {
        const ev = evidence[x.id];
        const syncOk = x.lastSyncAt && !x.lastSyncError ? iso(x.lastSyncAt) : null;
        return {
          platform: x.platform as "LINKEDIN" | "TWITTER",
          connectionId: x.id,
          url: x.externalAccountUrl,
          lastGood: later(syncOk, updM.get(x.id) ?? null, ev?.okAt ?? null),
          verifierAt: ev?.at ?? null,
          verifierOkAt: ev?.okAt ?? null,
          error: ev?.error ?? x.lastSyncError ?? null,
        };
      })
      .sort((a, b) => a.platform.localeCompare(b.platform));
    const ev = companyEvidence(accounts.map((a) => a.lastGood));
    const lp = lastM.get(c.id);
    const first = firstDay.get(c.id);
    return {
      id: c.id,
      name: c.name,
      logoUrl: c.logoUrl,
      clientType: c.clientType,
      perWeek: obj ? obj.perWeek(c.id) : DEFAULT_PER_WEEK,
      campaignStart: c.campaignStartDate ? toS(c.campaignStartDate) : first ? `${first.slice(0, 7)}-01` : null,
      accounts,
      evidenceAt: ev.at,
      evidenceDate: ev.date,
      lastPost: lp ? { date: lp.d, url: lp.url, platform: lp.platform } : null,
      posted: postedM.get(c.id) ?? {},
    };
  });

  return { companies, today, generatedAt: now.toISOString() };
}
