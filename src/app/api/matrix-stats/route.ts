export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { ClientStatus, ClientType } from "@prisma/client";
import prisma from "@/lib/db";
import { attainment, addDays, companyEvidence, toS } from "@/lib/tracking/attainment";

/**
 * POST /api/matrix-stats — read-only feed for the weekly "Client Platform Matrix"
 * email (Supabase edge function `client-platform-matrix`, task project, column key
 * `socialtracking`). Same contract as social.gershon.ai, linalysis.net, nexashare.com, Pulse:
 *
 * Request : {"secret":"…","people":[{"key":"…","company":"…","emails":["a@b.com"]}]}
 *           (the secret may also be sent as `Authorization: Bearer <secret>`)
 * Auth    : SHA-256 hex of the secret must equal MATRIX_SECRET_SHA256. Only the hash is
 *           stored here (plain value = cc_health_config.matrix_stats_secret in the task
 *           project) — no new Pages secret. Mismatch → 401 {"ok":false}. The path is in
 *           OPEN_API (src/middleware.ts) because it carries its own secret.
 * Response: {"ok":true,"platform":"socialtracking","as_of":"<ISO>","results":[{"key","ok","note"}]}
 *
 * A person is matched to a CAMPAIGN / INTERNAL Client of the primary (Gershon) workspace
 * exactly like Social does (company name, suffixes ignored, or work-email domain vs
 * Client.website). For the matched client, Tracking's own rule (lib/tracking/attainment.ts)
 * over the last 30 days: a weekday is verified when a SocialPost exists that day; evidence
 * date = oldest lastSyncAt of its enabled LinkedIn/X accounts (never read = unknown, not missed).
 * Default objective 5/5 weekdays (per-company objectives from Settings are not applied here).
 * ok   = client ACTIVE and at least one weekday was due (it is being tracked).
 * note = "V/D weekdays verified 30d" (+ " · M missed" / " · U unknown" / " · never read");
 *        "paused"/"draft"… when not active; "not tracked" when unmatched.
 * Reads only — never writes. No session → @/lib/db is the raw client (system context),
 * so the primary workspace is filtered explicitly below.
 */

const MATRIX_SECRET_SHA256 = "7031a38bde30c34db677585e85f696f51d78cc417e40d38572d20ebeb1c77569";

const SUFFIXES = new Set([
  "ag", "intl", "international", "inc", "incorporated", "llc", "ltd", "limited", "gmbh",
  "sa", "sas", "sarl", "sl", "srl", "spa", "bv", "nv", "plc", "corp", "corporation", "co",
  "company", "group", "holding", "holdings", "na", "usa", "us", "the",
]);

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "gmx.de", "orange.fr", "free.fr", "wanadoo.fr", "laposte.net",
]);

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Body `secret` (what the matrix sends) or `Authorization: Bearer <secret>` (handy for curl). */
async function authorized(req: NextRequest, body: { secret?: unknown } | null): Promise<boolean> {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const secret = typeof body?.secret === "string" && body.secret ? body.secret : bearer;
  return !!secret && (await sha256Hex(secret)) === MATRIX_SECRET_SHA256;
}

function nameTokens(name: string): string[] {
  const t = name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (t.length > 1 && SUFFIXES.has(t[t.length - 1])) t.pop();
  while (t.length > 1 && t[0] === "the") t.shift();
  return t;
}

function namesMatch(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const A = a.join(" ");
  const B = b.join(" ");
  if (A === B) return true;
  if (A.replace(/ /g, "") === B.replace(/ /g, "")) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.join("").length < 4) return false;
  return s.every((w, i) => l[i] === w);
}

function hostOf(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website.trim()}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function domainsMatch(emailDomain: string, siteHost: string): boolean {
  return emailDomain === siteHost || emailDomain.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${emailDomain}`);
}

type PersonIn = { key?: unknown; company?: unknown; emails?: unknown };
type ClientRow = { id: string; name: string; status: ClientStatus; website: string | null };

/** Same matching as social.gershon.ai: company name (suffixes ignored) or work-email domain vs Client.website. */
function pickClients<C extends ClientRow>(people: PersonIn[], clients: C[]): (C | null)[] {
  const indexed = clients.map((c) => ({ c, tokens: nameTokens(c.name), host: hostOf(c.website) }));
  return people.map((p) => {
    const company = typeof p?.company === "string" ? p.company : "";
    const emails = Array.isArray(p?.emails) ? p.emails.filter((e): e is string => typeof e === "string") : [];
    const domains = emails.map((e) => e.trim().toLowerCase().split("@")[1] || "").filter((d) => d && !FREEMAIL.has(d));
    const ct = nameTokens(company);
    const hits = indexed.filter((x) => namesMatch(ct, x.tokens) || (!!x.host && domains.some((d) => domainsMatch(d, x.host as string))));
    if (!hits.length) return null;
    hits.sort((x, y) => Number(y.c.status === ClientStatus.ACTIVE) - Number(x.c.status === ClientStatus.ACTIVE));
    return hits[0].c;
  });
}

export async function POST(req: NextRequest) {
  let body: { secret?: unknown; people?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!(await authorized(req, body))) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const people: PersonIn[] = Array.isArray(body?.people) ? (body!.people as PersonIn[]).slice(0, 200) : [];
    const as_of = new Date().toISOString();
    const primary = await prisma.organization.findFirst({ where: { isPrimary: true }, select: { id: true } });
    if (!primary) {
      return NextResponse.json({ ok: true, platform: "socialtracking", as_of, results: people.map((p) => ({ key: String(p?.key ?? ""), ok: false, note: "not tracked" })) });
    }

    const clients = await prisma.client.findMany({
      where: {
        organizationId: primary.id,
        archivedAt: null,
        status: { not: ClientStatus.ARCHIVED },
        clientType: { in: [ClientType.CAMPAIGN, ClientType.INTERNAL] },
      },
      select: { id: true, name: true, status: true, website: true, campaignStartDate: true },
    });
    const picks = pickClients(people, clients);

    const today = toS(new Date());
    const from = addDays(today, -30);
    const ids = Array.from(new Set(picks.filter((c) => c && c.status === ClientStatus.ACTIVE).map((c) => c!.id)));
    const postedDays = new Map<string, Set<string>>();
    const reads = new Map<string, Array<string | null>>();
    if (ids.length) {
      const [posts, conns] = await Promise.all([
        prisma.socialPost.findMany({
          where: { clientId: { in: ids }, platform: { in: ["LINKEDIN", "TWITTER"] }, publishedDateLocal: { gte: from, lte: today } },
          select: { clientId: true, publishedDateLocal: true },
          distinct: ["clientId", "publishedDateLocal"],
        }),
        prisma.platformConnection.findMany({
          where: { clientId: { in: ids }, isEnabled: true, platform: { in: ["LINKEDIN", "TWITTER"] } },
          select: { clientId: true, lastSyncAt: true },
        }),
      ]);
      for (const p of posts) {
        if (!postedDays.has(p.clientId)) postedDays.set(p.clientId, new Set());
        postedDays.get(p.clientId)!.add(p.publishedDateLocal);
      }
      for (const c of conns) {
        if (!reads.has(c.clientId)) reads.set(c.clientId, []);
        reads.get(c.clientId)!.push(c.lastSyncAt ? c.lastSyncAt.toISOString() : null);
      }
    }

    const results = people.map((p, i) => {
      const key = String(p?.key ?? "");
      const c = picks[i];
      if (!c) return { key, ok: false, note: "not tracked" };
      if (c.status !== ClientStatus.ACTIVE) return { key, ok: false, note: c.status.toLowerCase().replace(/_/g, " ").slice(0, 20) };
      const days = postedDays.get(c.id) ?? new Set<string>();
      const ev = companyEvidence(reads.get(c.id) ?? []);
      const a = attainment({
        from,
        to: today,
        today,
        start: c.campaignStartDate ? toS(c.campaignStartDate) : null,
        posted: (d) => days.has(d),
        evidenceDate: ev.date,
      });
      if (!a.due) return { key, ok: false, note: "nothing due yet" };
      let note = `${a.verified}/${a.due} weekdays verified 30d`;
      if (a.missing) note += ` · ${a.missing} missed`;
      if (a.unknown) note += ev.date ? ` · ${a.unknown} unknown` : " · never read";
      return { key, ok: true, note };
    });

    return NextResponse.json({ ok: true, platform: "socialtracking", as_of, results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
