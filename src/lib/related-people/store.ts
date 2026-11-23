/**
 * Related people — the people whose own LinkedIn / X accounts are tracked
 * together with a company (Altavia North America + Anne Bougel + Alexandre
 * Rouleau, say).
 *
 * v0.9.0. No schema change, same pattern as competitors/store.ts:
 *   - each person is an ordinary Client row of category COMPANY with a
 *     LinkedIn /in/ (and optional X) connection, so Social's collector and
 *     this app's Post Verifier extension read their posts like any account;
 *   - the link company → people lives in OrgSetting `related-people:<clientId>`
 *     as JSON [{ id, role }].
 * COMPANY is outside this app's product scope (CAMPAIGN + INTERNAL), so people
 * never show up as companies of their own in lists, dashboards or reports.
 * Reading them therefore goes through the raw client, always filtered by the
 * caller's organizationId.
 */

import rawDb from "@/lib/db-raw";

export type RelatedPersonLink = { id: string; role: string | null };

const PREFIX = "related-people:";
const keyFor = (clientId: string) => `${PREFIX}${clientId}`;
export const MAX_PEOPLE = 10;

function parse(value: string): RelatedPersonLink[] {
  try {
    const v = JSON.parse(value);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x.id === "string")
      .map((x) => ({ id: x.id as string, role: typeof x.role === "string" && x.role ? (x.role as string) : null }));
  } catch {
    return [];
  }
}

export async function getPeopleLinks(orgId: string, clientId: string): Promise<RelatedPersonLink[]> {
  const row = await rawDb.orgSetting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: keyFor(clientId) } },
  });
  return row ? parse(row.value) : [];
}

export async function setPeopleLinks(orgId: string, clientId: string, links: RelatedPersonLink[]): Promise<void> {
  const seen = new Set<string>();
  const clean = links.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true))).slice(0, MAX_PEOPLE);
  const value = JSON.stringify(clean);
  await rawDb.orgSetting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: keyFor(clientId) } },
    update: { value },
    create: { organizationId: orgId, key: keyFor(clientId), value },
  });
}

/** Every related person of the workspace → the company they belong to. */
export async function relatedPersonParents(orgId: string): Promise<Map<string, string>> {
  const rows = await rawDb.orgSetting.findMany({
    where: { organizationId: orgId, key: { startsWith: PREFIX } },
    select: { key: true, value: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const parentId = r.key.slice(PREFIX.length);
    for (const l of parse(r.value)) out.set(l.id, parentId);
  }
  return out;
}

export { cleanProfileUrl, cleanXUrl } from "./url";
