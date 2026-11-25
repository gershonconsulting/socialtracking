// Social Tracking v0.9.0 — weekly report: grades, week window, links, render. Pure, no database.
//   npx tsx --test tests/weekly-report.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as GM from "../src/lib/reports/weekly-grade";
import * as WM from "../src/lib/reports/weekly";
import * as EM from "../src/lib/reports/weekly-email";
import { writeFileSync } from "node:fs";
const G: any = (GM as any).gradeOf ? GM : (GM as any).default;
const W: any = (WM as any).weekWindow ? WM : (WM as any).default;
const E: any = (EM as any).weeklyEmailHtml ? EM : (EM as any).default;

test("grade bands", () => {
  assert.equal(G.gradeOf(100), "A"); assert.equal(G.gradeOf(90), "A"); assert.equal(G.gradeOf(80), "B");
  assert.equal(G.gradeOf(60), "C"); assert.equal(G.gradeOf(45), "D"); assert.equal(G.gradeOf(10), "F"); assert.equal(G.gradeOf(null), null);
});

test("week window ends on the last Sunday (Sunday send = this week, Monday send = last week)", () => {
  // Sun 2026-11-22 12:30 UTC — the actual Cloudflare firing time.
  assert.equal(W.weekWindow(null, new Date("2026-11-22T12:30:00Z")).first, "2026-11-16");
  // Mon 2026-11-23 12:30 UTC.
  assert.equal(W.weekWindow(null, new Date("2026-11-23T12:30:00Z")).first, "2026-11-16");
  assert.equal(W.weekWindow(null, new Date("2026-11-23T12:30:00Z")).last, "2026-11-22");
  assert.equal(W.weekWindow("2026-11-18").first, "2026-11-16");
});

test("competitor and arena scores", () => {
  assert.equal(G.competitorScore(0, 0, 5), 0);
  assert.equal(G.competitorScore(5, 50, 10), 75); // full volume, same engagement/post
  assert.equal(G.competitorScore(10, 200, 10), 100);
  assert.equal(G.arenaScore({ posts: 5, eng: 50 }, []), null);
  assert.equal(G.arenaScore({ posts: 5, eng: 50 }, [{ posts: 5, eng: 50 }]), 75); // level = B
  assert.ok(G.arenaScore({ posts: 1, eng: 2 }, [{ posts: 6, eng: 300 }])! < 40);
  assert.equal(G.shareOfVoice(2, [3, 5]), 20);
});

test("links go to the exact post and only to http(s) sources", () => {
  assert.equal(G.postLink("c1", "p1"), "https://social.gershon.ai/clients/c1?post=p1#post-p1");
  assert.equal(G.sourceLink("javascript:alert(1)"), null);
  assert.equal(G.sourceLink("https://www.linkedin.com/feed/update/urn:li:activity:1/"), "https://www.linkedin.com/feed/update/urn:li:activity:1/");
});

test("render: grades, three choices per post, no raw HTML from post text", () => {
  const win = W.weekWindow("2026-11-16");
  const post = (id: string, clientId: string, company: string, eng: number, text: string) => ({ id, clientId, company, date: "Nov 18", net: "LinkedIn", text, eng, url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` });
  const companies = [
    { id: "valos", name: "VALOS", type: "CAMPAIGN", active: true, posts: 5, li: 4, x: 1, eng: 40, days: 5, perWeek: 5, pct: 100, top: post("p1", "valos", "VALOS", 22, "Meet the VALOS team at PHUSE <script>x</script>") },
    { id: "alt", name: "Altavia", type: "CAMPAIGN", active: true, posts: 1, li: 1, x: 0, eng: 3, days: 1, perWeek: 5, pct: 20, top: null },
    { id: "wal", name: "WALLIX", type: "CAMPAIGN", active: true, posts: 0, li: 0, x: 0, eng: 0, days: 0, perWeek: 3, pct: 0, top: null },
    { id: "gc", name: "Gershon Consulting", type: "INTERNAL", active: true, posts: 3, li: 1, x: 2, eng: 4, days: 3, perWeek: null, pct: null, top: null },
  ];
  const arenas = [{ campaignId: "valos", campaign: "VALOS", ours: { posts: 5, eng: 40 }, sov: 38, score: 70, grade: "C",
    rivals: [{ id: "r1", name: "Cytel", posts: 8, eng: 300, score: 100, grade: "A", top: post("q1", "r1", "Cytel", 140, "Join our webinar on adaptive trials") }] }];
  const d = { win, companies, perDay: [1, 2, 1, 1, 1, 0, 0], prevPosts: 7, arenas };
  const m = W.weeklyModel(d, "test");
  assert.equal(m.weekGrade, "D"); // 5+1+0 of 13 = 46%
  assert.equal(m.competitionGrade, "A");
  assert.match(m.subject, /Grade D · Competition A/);
  const html = E.weeklyEmailHtml(d, m, "Social Tracking v0.9.0 · test");
  assert.ok(html.includes("https://social.gershon.ai/clients/valos?post=p1#post-p1"));
  assert.ok(html.includes("https://social.gershon.ai/clients/r1?post=q1#post-q1"));
  assert.ok(html.includes("urn:li:activity:q1"));
  assert.ok(html.includes("https://publish.gershon.ai/publishing?client=valos"));
  assert.ok(html.includes("COMPETITION GRADE") && html.includes("Competition graded"));
  assert.ok(!html.includes("<script>x"));
  writeFileSync("/tmp/weekly-sample.html", html);
});
