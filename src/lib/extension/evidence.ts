/**
 * Independent verification evidence (Social Tracking v0.4.0).
 *
 * Every batch the Post Verifier extension sends to /api/extension/ingest is a
 * fresh, independent look at a company's LinkedIn or X page. The posts it saw
 * go into the shared SocialPost table (same dedupe key as Social, so nothing is
 * ever counted twice); WHEN Tracking last looked, and what it saw, is kept here
 * per account so the Summary can show evidence freshness and so absence is only
 * concluded when the evidence is fresh (spec §7: "unknown" must never read as
 * "missing" or as zero).
 *
 * Stored in one OrgSetting row per workspace (no schema change):
 *   tracking_evidence = { "<connectionId>": { at, okAt, n, error } }
 *     at    — last time the verifier reported on this account (ok or not)
 *     okAt  — last time it read the page successfully
 *     n     — posts it saw on that successful read
 *     error — the last failure, cleared by the next success
 */
import rawPrisma from "@/lib/db-raw";

export const EVIDENCE_KEY = "tracking_evidence";

export interface EvidenceEntry {
  at: string;
  okAt: string | null;
  n: number;
  error: string | null;
}
export type Evidence = Record<string, EvidenceEntry>;

function parse(v: string | null | undefined): Evidence {
  if (!v) return {};
  try {
    const j = JSON.parse(v);
    return j && typeof j === "object" ? (j as Evidence) : {};
  } catch {
    return {};
  }
}

export async function readEvidence(orgId: string): Promise<Evidence> {
  const row = await rawPrisma.orgSetting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: EVIDENCE_KEY } },
  });
  return parse(row?.value);
}

/** Pure merge — unit-tested. */
export function mergeEvidence(
  cur: Evidence,
  updates: Array<{ connectionId: string; ok: boolean; n: number; error?: string | null }>,
  now: Date,
): Evidence {
  const out: Evidence = { ...cur };
  const iso = now.toISOString();
  for (const u of updates) {
    const prev = out[u.connectionId];
    out[u.connectionId] = u.ok
      ? { at: iso, okAt: iso, n: Math.max(0, Math.round(u.n) || 0), error: null }
      : { at: iso, okAt: prev?.okAt ?? null, n: prev?.n ?? 0, error: String(u.error || "failed").slice(0, 300) };
  }
  return out;
}

/** Best effort: never fails an ingest. Two tries cover a concurrent writer. */
export async function recordEvidence(
  orgId: string,
  updates: Array<{ connectionId: string; ok: boolean; n: number; error?: string | null }>,
): Promise<void> {
  if (!updates.length) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await rawPrisma.orgSetting.findUnique({
        where: { organizationId_key: { organizationId: orgId, key: EVIDENCE_KEY } },
      });
      const value = JSON.stringify(mergeEvidence(parse(row?.value), updates, new Date()));
      if (!row) {
        await rawPrisma.orgSetting.create({ data: { organizationId: orgId, key: EVIDENCE_KEY, value } });
        return;
      }
      const res = await rawPrisma.orgSetting.updateMany({
        where: { organizationId: orgId, key: EVIDENCE_KEY, value: row.value },
        data: { value },
      });
      if (res.count === 1) return;
    } catch {
      /* lost a race on create — go round again */
    }
  }
}
