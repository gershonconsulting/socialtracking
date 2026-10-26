// Social Tracking v0.4.0 — expected vs verified rule (lib/tracking/attainment.ts)
// and the evidence log merge (lib/extension/evidence.ts). Pure, no database.
//   npx tsx --test tests/attainment.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as AM from "../src/lib/tracking/attainment";
import * as EM from "../src/lib/extension/evidence";
// The sources are CommonJS to tsx: named exports may sit on .default.
const A: any = (AM as any).attainment ? AM : (AM as any).default;
const E: any = (EM as any).mergeEvidence ? EM : (EM as any).default;
const { attainment, companyEvidence, weekdaysSince, isStale, weekdays } = A;
const { mergeEvidence } = E;

// October 2026: Thu 1 … Sat 31. 22 weekdays. "Today" = Mon 26 Oct.
const today = "2026-10-26";
const set = (...d: string[]) => { const s = new Set(d); return (x: string) => s.has(x); };

test("weekday counting", () => {
  assert.equal(weekdays("2026-10-01", "2026-10-31"), 22);
  assert.equal(weekdays("2026-10-03", "2026-10-04"), 0);
});

test("fresh evidence: missing days are missing, today and later are pending", () => {
  const a = attainment({ from: "2026-10-01", to: "2026-10-31", today, start: null, evidenceDate: "2026-10-26",
    posted: set("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-05") });
  assert.equal(a.expected, 22);
  assert.equal(a.verified, 3);           // 10 posts on one day still count once
  assert.equal(a.pending, 5);            // Mon 26 .. Fri 30
  assert.equal(a.due, 17);
  assert.equal(a.missing, 14);
  assert.equal(a.unknown, 0);
  assert.equal(a.provisional, false);
  assert.ok(Math.abs(a.rate! - 3 / 17) < 1e-9);
});

test("stale evidence: days at/after the last read are UNKNOWN, never missing", () => {
  const a = attainment({ from: "2026-10-01", to: "2026-10-31", today, start: null, evidenceDate: "2026-10-20",
    posted: set("2026-10-21") });
  // Read on Tue 20: Thu 1..Mon 19 are known (13 weekdays), Tue 20..Fri 23 unknown except Wed 21 posted.
  assert.equal(a.verified, 1);
  assert.equal(a.unknown, 3);            // 20, 22, 23
  assert.equal(a.missing, 13);
  assert.equal(a.provisional, true);
});

test("never read: nothing can be called missing", () => {
  const a = attainment({ from: "2026-10-01", to: "2026-10-31", today, start: null, evidenceDate: null, posted: set() });
  assert.equal(a.missing, 0);
  assert.equal(a.unknown, 17);
  assert.equal(a.verified, 0);
});

test("a post today counts as verified", () => {
  const a = attainment({ from: "2026-10-26", to: "2026-10-30", today, start: null, evidenceDate: today, posted: set(today) });
  assert.equal(a.verified, 1);
  assert.equal(a.due, 1);
  assert.equal(a.pending, 4);
  assert.equal(a.rate, 1);
});

test("campaign start trims the period; nothing due yet = n/a", () => {
  const a = attainment({ from: "2026-10-01", to: "2026-10-31", today, start: "2026-10-28", evidenceDate: today, posted: set() });
  assert.equal(a.expected, 3);
  assert.equal(a.due, 0);
  assert.equal(a.rate, null);
});

test("3 posts a week objective scales expected and caps verified", () => {
  const all = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
  const a = attainment({ from: "2026-10-12", to: "2026-10-16", today, start: null, evidenceDate: today, posted: set(...all), perWeek: 3 });
  assert.equal(a.expected, 3);
  assert.equal(a.verified, 3);
  assert.equal(a.missing, 0);
  assert.equal(a.rate, 1);
});

test("company evidence = oldest account read; any never-read account = unknown", () => {
  assert.deepEqual(companyEvidence(["2026-10-25T10:00:00.000Z", "2026-10-24T08:00:00.000Z"]), { at: "2026-10-24T08:00:00.000Z", date: "2026-10-24" });
  assert.deepEqual(companyEvidence(["2026-10-25T10:00:00.000Z", null]), { at: null, date: null });
  assert.deepEqual(companyEvidence([]), { at: null, date: null });
});

test("weekdays since last post, and staleness", () => {
  assert.equal(weekdaysSince("2026-10-21", today, null), 2);   // Thu 22, Fri 23
  assert.equal(weekdaysSince(null, today, "2026-10-19"), 5);
  assert.equal(weekdaysSince(null, today, null), null);
  const now = Date.parse("2026-10-26T12:00:00Z");
  assert.equal(isStale("2026-10-25T12:00:00Z", now), false);
  assert.equal(isStale("2026-10-24T11:00:00Z", now), true);
  assert.equal(isStale(null, now), true);
});

test("evidence merge: success clears the error, failure keeps the last good read", () => {
  const t1 = new Date("2026-10-25T10:00:00Z"), t2 = new Date("2026-10-26T10:00:00Z");
  const a = mergeEvidence({}, [{ connectionId: "c1", ok: true, n: 12 }], t1);
  assert.equal(a.c1.okAt, t1.toISOString());
  const b = mergeEvidence(a, [{ connectionId: "c1", ok: false, n: 0, error: "LinkedIn signed out" }], t2);
  assert.equal(b.c1.okAt, t1.toISOString());
  assert.equal(b.c1.at, t2.toISOString());
  assert.equal(b.c1.error, "LinkedIn signed out");
  assert.equal(b.c1.n, 12);
  const c = mergeEvidence(b, [{ connectionId: "c1", ok: true, n: 3 }], t2);
  assert.equal(c.c1.error, null);
});
