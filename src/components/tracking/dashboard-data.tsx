/**
 * Social Tracking /dashboard data — "Campaign command center" (v0.4.0).
 *
 * Port of Social's v4.59 dashboard (src/components/dashboard/dashboard-overview.tsx)
 * for Tracking's question, "was the agreed work done?":
 *   - scope: ACTIVE CAMPAIGN + INTERNAL companies (PRODUCT_CLIENT_TYPES);
 *   - coverage comes from the Tracking book (lib/tracking/book.ts), so every
 *     weekday is verified / missing / unknown (stale evidence) / pending —
 *     unknown is never shown as a miss or as zero;
 *   - plus Social's success, stock and efficiency figures, read-only.
 *
 * Aggregated in the database (GROUP BY) — never raw posts in the edge worker.
 */
import prisma from "@/lib/db";
import { inventory } from "@/lib/publishing-inventory";
import { getCurrentOrgId } from "@/lib/scoped-db";
import { loadBook, type BookCompany } from "@/lib/tracking/book";
import { TrackingDashboardClient } from "./dashboard-client";

/** [companyIndex, platform 0=LinkedIn 1=X, YYYY-MM-DD, posts, engagement, views] */
export type DayRow = [number, number, string, number, number, number];
/** [companyIndex, platform, YYYY-MM, posts, engagement, views] */
export type MonthRow = [number, number, string, number, number, number];
/** Content not yet published: [companyIndex, status, NY date YYYY-MM-DD | null] */
export type StockRow = [number, string, string | null];

export interface DashFollower { platform: string; now: number; then: number | null }

export interface TopPost {
  c: number; platform: string; date: string; url: string | null; text: string;
  likes: number; comments: number; shares: number; views: number;
}

export interface TrackingDashData {
  companies: BookCompany[];
  followers: DashFollower[][];
  runway: Array<{ days: number; ready: number; inReview: number; changes: number; level: "ok" | "low" | "critical" } | null>;
  days: DayRow[];
  months: MonthRow[];
  stock: StockRow[];
  top: TopPost[];
  pipeline: { drafts: number; review: number; changes: number; approved: number; scheduled: number; published30: number; failed: number };
  today: string;
  generatedAt: string;
}

const PLAT_IDX: Record<string, number> = { LINKEDIN: 0, TWITTER: 1 };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function TrackingDashboard() {
  const book = await loadBook();
  const companies = book.companies;
  const ids = companies.map((c) => c.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 400);
  const sinceDay = isoDay(since);
  const f30 = new Date(now);
  f30.setDate(f30.getDate() - 30);
  const f30Day = isoDay(f30);
  const p30 = new Date(now.getTime() - 30 * 86400000);

  type Agg = { clientId: string; platform: string; k: string; n: number; e: number; v: number };
  type Top = { clientId: string; platform: string; d: string; url: string | null; t: string | null; l: number; c: number; s: number; v: number };
  type Fol = { clientId: string; platform: string; n: number };
  const none = <T,>() => Promise.resolve([] as T[]);
  const orgId = await getCurrentOrgId().catch(() => null);
  const has = ids.length > 0;

  const [stockItems, daily, monthly, top, folNow, folThen, items, sched, published30, failed, inv] = await Promise.all([
    has
      ? prisma.contentItem.findMany({
          where: {
            clientId: { in: ids },
            status: { in: ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SCHEDULED"] },
            OR: [{ scheduledAt: null }, { scheduledAt: { gte: new Date(now.getTime() - 86400000) } }],
          },
          select: { clientId: true, status: true, scheduledAt: true },
        })
      : Promise.resolve([] as Array<{ clientId: string | null; status: string; scheduledAt: Date | null }>),
    has
      ? prisma.$queryRaw<Agg[]>`
          SELECT "clientId", platform::text AS platform, "publishedDateLocal" AS k,
                 COUNT(*)::int AS n,
                 COALESCE(SUM("likeCount" + "commentCount" + "shareCount"),0)::int AS e,
                 COALESCE(SUM("viewCount"),0)::int AS v
          FROM social_posts
          WHERE "clientId" = ANY(${ids}) AND "publishedDateLocal" >= ${sinceDay}
            AND platform::text IN ('LINKEDIN','TWITTER')
          GROUP BY 1,2,3`
      : none<Agg>(),
    has
      ? prisma.$queryRaw<Agg[]>`
          SELECT "clientId", platform::text AS platform, substr("publishedDateLocal",1,7) AS k,
                 COUNT(*)::int AS n,
                 COALESCE(SUM("likeCount" + "commentCount" + "shareCount"),0)::int AS e,
                 COALESCE(SUM("viewCount"),0)::int AS v
          FROM social_posts
          WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
          GROUP BY 1,2,3`
      : none<Agg>(),
    has
      ? prisma.$queryRaw<Top[]>`
          SELECT "clientId", platform, d, url, t, l, c, s, v FROM (
            SELECT "clientId", platform::text AS platform, "publishedDateLocal" AS d, "postUrl" AS url,
                   LEFT(COALESCE("postTextSnippet", "postTextFull", ''), 220) AS t,
                   "likeCount" AS l, "commentCount" AS c, "shareCount" AS s, "viewCount" AS v,
                   ROW_NUMBER() OVER (PARTITION BY "clientId", ("publishedDateLocal" >= ${sinceDay})
                                      ORDER BY ("likeCount" + "commentCount" + "shareCount") DESC) AS rn,
                   ("publishedDateLocal" >= ${sinceDay}) AS recent
            FROM social_posts
            WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
          ) x WHERE (recent AND rn <= 6) OR (NOT recent AND rn <= 3)`
      : none<Top>(),
    has
      ? prisma.$queryRaw<Fol[]>`
          SELECT DISTINCT ON ("clientId", platform) "clientId", platform::text AS platform, "followerCount" AS n
          FROM follower_snapshots WHERE "clientId" = ANY(${ids})
          ORDER BY "clientId", platform, "snapshotDateLocal" DESC`
      : none<Fol>(),
    has
      ? prisma.$queryRaw<Fol[]>`
          SELECT DISTINCT ON ("clientId", platform) "clientId", platform::text AS platform, "followerCount" AS n
          FROM follower_snapshots WHERE "clientId" = ANY(${ids}) AND "snapshotDateLocal" <= ${f30Day}
          ORDER BY "clientId", platform, "snapshotDateLocal" DESC`
      : none<Fol>(),
    has ? prisma.contentItem.groupBy({ by: ["status"], where: { clientId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
    has ? prisma.scheduledPost.count({ where: { clientId: { in: ids }, status: "SCHEDULED", scheduledAt: { gte: now } } }) : Promise.resolve(0),
    has ? prisma.scheduledPost.count({ where: { clientId: { in: ids }, status: "POSTED", postedAt: { gte: p30 } } }) : Promise.resolve(0),
    has ? prisma.scheduledPost.count({ where: { clientId: { in: ids }, status: { in: ["FAILED", "MISSED"] }, scheduledAt: { gte: p30 } } }) : Promise.resolve(0),
    orgId ? inventory(orgId).catch(() => []) : Promise.resolve([]),
  ]);

  const folThenM = new Map(folThen.map((f) => [`${f.clientId}|${f.platform}`, f.n]));
  const invM = new Map(inv.map((r) => [r.clientId, r]));
  const status = (s: string) =>
    (items as Array<{ status: string; _count: { _all: number } }>).find((i) => i.status === s)?._count._all ?? 0;

  const data: TrackingDashData = {
    companies,
    // Followers are per company and per network — never summed across companies.
    followers: companies.map((c) =>
      folNow
        .filter((f) => f.clientId === c.id && f.platform in PLAT_IDX)
        .map((f) => ({ platform: f.platform, now: f.n, then: folThenM.get(`${c.id}|${f.platform}`) ?? null })),
    ),
    runway: companies.map((c) => {
      const r = invM.get(c.id);
      return r ? { days: r.coverageDays, ready: r.ready, inReview: r.inReview, changes: r.changesRequested, level: r.level } : null;
    }),
    days: daily.map((d) => [idx.get(d.clientId)!, PLAT_IDX[d.platform], d.k, d.n, d.e, d.v]),
    months: monthly.map((d) => [idx.get(d.clientId)!, PLAT_IDX[d.platform], d.k, d.n, d.e, d.v]),
    stock: stockItems
      .filter((i) => i.clientId && idx.has(i.clientId))
      .map((i) => [
        idx.get(i.clientId!)!,
        i.status,
        i.scheduledAt ? i.scheduledAt.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null,
      ]),
    top: top.map((t) => ({
      c: idx.get(t.clientId)!, platform: t.platform, date: t.d, url: t.url, text: t.t ?? "",
      likes: t.l, comments: t.c, shares: t.s, views: t.v,
    })),
    pipeline: {
      drafts: status("DRAFT"),
      review: status("IN_REVIEW"),
      changes: status("CHANGES_REQUESTED"),
      approved: status("APPROVED"),
      scheduled: sched,
      published30,
      failed,
    },
    today: book.today,
    generatedAt: book.generatedAt,
  };

  return <TrackingDashboardClient data={data} />;
}
