/**
 * Database side of the monthly one-pager (v0.6.0). Same scope and rules as the
 * dashboard: the Tracking book (ACTIVE CAMPAIGN companies, INTERNAL on request),
 * verified / missing / unknown weekdays from lib/tracking/attainment.ts, posts
 * from social_posts, followers from follower_snapshots. Aggregated in the
 * database; only the month's posts (capped) reach the edge worker.
 */
import prisma from "@/lib/db";
import { loadBook } from "@/lib/tracking/book";
import { addMonths, monthFirst, monthLast } from "@/lib/tracking/attainment";
import { companyMonth, type OneCompany, type OnePagerData, type OnePost } from "./onepager-model";

const MAX_POSTS = 400;

type PostRow = { clientId: string; platform: string; d: string; url: string | null; t: string | null; l: number; c: number; s: number; v: number };
type AggRow = { clientId: string; n: number; e: number };
type FolRow = { clientId: string; platform: string; n: number };

export async function loadOnePager(month: string, includeInternal: boolean): Promise<OnePagerData> {
  const book = await loadBook();
  const companies = book.companies.filter((c) => c.clientType === "CAMPAIGN" || (includeInternal && c.clientType === "INTERNAL"));
  const ids = companies.map((c) => c.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const from = monthFirst(month), to = monthLast(month);
  const pmk = addMonths(month, -1);
  const pFrom = monthFirst(pmk), pTo = monthLast(pmk);

  const has = ids.length > 0;
  const [posts, count, prev, folStart, folEnd] = has
    ? await Promise.all([
        prisma.$queryRaw<PostRow[]>`
          SELECT "clientId", platform::text AS platform, "publishedDateLocal" AS d, "postUrl" AS url,
                 LEFT(COALESCE("postTextSnippet", "postTextFull", ''), 200) AS t,
                 "likeCount" AS l, "commentCount" AS c, "shareCount" AS s, "viewCount" AS v
          FROM social_posts
          WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
            AND "publishedDateLocal" >= ${from} AND "publishedDateLocal" <= ${to}
          ORDER BY "publishedDateLocal" ASC, "publishedAtUtc" ASC
          LIMIT ${MAX_POSTS}`,
        prisma.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM social_posts
          WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
            AND "publishedDateLocal" >= ${from} AND "publishedDateLocal" <= ${to}`,
        prisma.$queryRaw<AggRow[]>`
          SELECT "clientId", COUNT(*)::int AS n, COALESCE(SUM("likeCount" + "commentCount" + "shareCount"),0)::int AS e
          FROM social_posts
          WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
            AND "publishedDateLocal" >= ${pFrom} AND "publishedDateLocal" <= ${pTo}
          GROUP BY 1`,
        // Followers at the start: the last snapshot before the month began (else the first one inside it).
        prisma.$queryRaw<FolRow[]>`
          SELECT DISTINCT ON ("clientId", platform) "clientId", platform::text AS platform, "followerCount" AS n
          FROM follower_snapshots
          WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER') AND "snapshotDateLocal" <= ${to}
          ORDER BY "clientId", platform, ("snapshotDateLocal" < ${from}) DESC,
                   CASE WHEN "snapshotDateLocal" < ${from} THEN "snapshotDateLocal" END DESC NULLS LAST,
                   "snapshotDateLocal" ASC`,
        prisma.$queryRaw<FolRow[]>`
          SELECT DISTINCT ON ("clientId", platform) "clientId", platform::text AS platform, "followerCount" AS n
          FROM follower_snapshots
          WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER') AND "snapshotDateLocal" <= ${to}
          ORDER BY "clientId", platform, "snapshotDateLocal" DESC`,
      ])
    : [[], [{ n: 0 }], [], [], []];

  // Engagement + views for the WHOLE month (the posts list may be capped).
  const monthAgg = has
    ? await prisma.$queryRaw<Array<AggRow & { v: number; li: number; x: number }>>`
        SELECT "clientId", COUNT(*)::int AS n,
               COALESCE(SUM("likeCount" + "commentCount" + "shareCount"),0)::int AS e,
               COALESCE(SUM("viewCount"),0)::int AS v,
               COUNT(*) FILTER (WHERE platform::text = 'LINKEDIN')::int AS li,
               COUNT(*) FILTER (WHERE platform::text = 'TWITTER')::int AS x
        FROM social_posts
        WHERE "clientId" = ANY(${ids}) AND platform::text IN ('LINKEDIN','TWITTER')
          AND "publishedDateLocal" >= ${from} AND "publishedDateLocal" <= ${to}
        GROUP BY 1`
    : [];

  const aggM = new Map(monthAgg.map((r) => [r.clientId, r]));
  const prevM = new Map((prev as AggRow[]).map((r) => [r.clientId, r]));
  const fs = new Map((folStart as FolRow[]).map((r) => [`${r.clientId}|${r.platform}`, r.n]));
  const fe = new Map((folEnd as FolRow[]).map((r) => [`${r.clientId}|${r.platform}`, r.n]));

  const onePosts: OnePost[] = (posts as PostRow[]).map((p) => ({
    c: idx.get(p.clientId)!,
    platform: p.platform as OnePost["platform"],
    date: p.d,
    url: p.url,
    text: (p.t ?? "").replace(/\s+/g, " ").trim(),
    likes: p.l ?? 0, comments: p.c ?? 0, shares: p.s ?? 0, views: p.v ?? 0,
  }));

  const out: OneCompany[] = companies.map((co) => {
    const m = companyMonth(co, month, book.today);
    const a = aggM.get(co.id);
    const pr = prevM.get(co.id);
    const days: Record<number, number> = {};
    for (const [d, flags] of Object.entries(co.posted)) if (d.startsWith(month)) days[Number(d.slice(8))] = flags;
    // co.posted holds weekdays only — weekend posts come from the posts list.
    for (const p of onePosts) if (p.c === idx.get(co.id)) {
      const k = Number(p.date.slice(8));
      days[k] = (days[k] ?? 0) | (p.platform === "LINKEDIN" ? 1 : 2);
    }
    const nets = co.accounts.map((x) => x.platform).filter((v, i, arr) => arr.indexOf(v) === i);
    return {
      id: co.id, name: co.name, logoUrl: co.logoUrl, clientType: co.clientType, perWeek: co.perWeek,
      att: m.att, prevAtt: m.prevAtt, missingDays: m.missingDays,
      posts: { li: a?.li ?? 0, x: a?.x ?? 0 },
      eng: a?.e ?? 0, views: a?.v ?? 0,
      prev: { posts: pr?.n ?? 0, eng: pr?.e ?? 0 },
      followers: nets.map((platform) => ({
        platform,
        start: fs.get(`${co.id}|${platform}`) ?? null,
        end: fe.get(`${co.id}|${platform}`) ?? null,
      })),
      days,
    };
  });

  const total = (count as { n: number }[])[0]?.n ?? onePosts.length;
  return {
    month,
    today: book.today,
    generatedAt: book.generatedAt,
    includeInternal,
    companies: out,
    posts: onePosts,
    postsTruncated: Math.max(0, total - onePosts.length),
  };
}
