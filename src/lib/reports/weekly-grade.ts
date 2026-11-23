/**
 * Weekly report v0.9.0 — grades, links and suggested actions (pure, no database).
 *
 * Olivier, 2026-11-23: "Grade the week, grade the competition. The content
 * should offer the option to see it on social.gershon.ai, see the original
 * source, or suggest something to do about it. The current links are not
 * correct, they do not bring to the exact location desired."
 *
 *   • gradeOf(score)        — A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F below.
 *   • week grade            — campaign posts delivered vs weekly objective (capped per company).
 *   • competitor grade      — how strong a competitor was this week: volume (5 posts = full marks)
 *                             and engagement per post against the campaign it is watched for.
 *   • "you vs them" grade   — the campaign's share of the posts and engagement in its own arena.
 *   • links                 — social.gershon.ai/clients/<id>?post=<postId>#post-<postId> opens the
 *                             company on "All time" and scrolls to that exact post (Social v4.83.0);
 *                             the original source is the post's own URL; actions open Publish for
 *                             the campaign company concerned.
 */

export type Grade = "A" | "B" | "C" | "D" | "F";

export const SOCIAL = "https://social.gershon.ai";
export const PUBLISH = "https://publish.gershon.ai";
export const TRACKING = "https://socialtracking.gershon.ai";

export function gradeOf(score: number | null | undefined): Grade | null {
  if (score == null || !Number.isFinite(score)) return null;
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
}

export const GRADE_COLOR: Record<Grade, string> = { A: "#057642", B: "#3f8f3a", C: "#b76b00", D: "#d9480f", F: "#FE1B04" };

const cap = (n: number, max = 100) => Math.max(0, Math.min(max, n));

/** Score of a campaign's week: % of its objective, capped at 100. */
export function campaignScore(posts: number, perWeek: number): number {
  return perWeek > 0 ? cap((100 * posts) / perWeek) : 0;
}

/**
 * Competitor strength 0–100: half volume (5 posts in the week = full marks),
 * half engagement per post against the campaign it is watched for (equal = 50,
 * twice ours or more = full marks). With no benchmark, 10 engagements/post = 50.
 */
export function competitorScore(posts: number, eng: number, ourEngPerPost: number): number {
  if (posts <= 0) return 0;
  const volume = cap((100 * posts) / 5);
  const perPost = eng / posts;
  const bench = ourEngPerPost > 0 ? ourEngPerPost : 10;
  const engagement = cap((50 * perPost) / bench);
  return Math.round(volume / 2 + engagement / 2);
}

/** Our standing in our own arena 0–100: average of our share of posts and of engagement, ×2 against the strongest rival. */
export function arenaScore(ours: { posts: number; eng: number }, rivals: Array<{ posts: number; eng: number }>): number | null {
  if (!rivals.length) return null;
  const topPosts = Math.max(...rivals.map((r) => r.posts));
  const topEng = Math.max(...rivals.map((r) => r.eng));
  const vs = (a: number, b: number) => (a + b === 0 ? 50 : (100 * a) / (a + b)); // 50 = level
  // Level with the strongest rival = 75 (B); clearly ahead → A; far behind → F.
  return Math.round(cap(((vs(ours.posts, topPosts) + vs(ours.eng, topEng)) / 2) * 1.5));
}

export function shareOfVoice(ours: number, rivals: number[]): number | null {
  const total = ours + rivals.reduce((s, n) => s + n, 0);
  return total > 0 ? Math.round((100 * ours) / total) : null;
}

// ── Links ────────────────────────────────────────────────────────────────────
export const companyLink = (clientId: string) => `${SOCIAL}/clients/${encodeURIComponent(clientId)}`;
export const postLink = (clientId: string, postId: string) =>
  `${SOCIAL}/clients/${encodeURIComponent(clientId)}?post=${encodeURIComponent(postId)}#post-${encodeURIComponent(postId)}`;
export const publishLink = (clientId: string) => `${PUBLISH}/publishing?client=${encodeURIComponent(clientId)}`;

/** Only http(s) URLs of LinkedIn / X are offered as the original source. */
export function sourceLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ── Suggested actions ────────────────────────────────────────────────────────
const TOPIC_RULES: Array<{ re: RegExp; label: string; reply: string }> = [
  { re: /\b(webinar|conference|summit|booth|expo|trade ?show|event|meet us|see you|join us|register)\b/i, label: "an event", reply: "a post on where your team will be next, or a take-away on the same theme" },
  { re: /\b(launch\w*|introduc\w+|releas\w+|now available|new feature|unveil\w*)\b/i, label: "a launch", reply: "a post on the problem your own offer solves better, with one proof point" },
  { re: /\b(customer|client|case study|success story|testimonial|trusted by)\b/i, label: "a customer story", reply: "a customer result of your own (numbers first)" },
  { re: /\b(partner\w*|collaborat\w+|alliance|agreement|signed)\b/i, label: "a partnership", reply: "a post on your own ecosystem and who you work with" },
  { re: /\b(award\w*|recogni\w+|ranked|funding|raised|milestone)\b/i, label: "company news", reply: "a milestone or proof point of your own this week" },
  { re: /\b(hiring|join our team|careers?|recruit\w*|meet the team)\b/i, label: "hiring / culture", reply: "a team or expertise post that shows who does the work" },
  { re: /\b(how to|tips?|guide|insight|trend|study|research|report|why)\b/i, label: "expertise", reply: "your own point of view on the same question — agree, disagree or add a number" },
];

export function topicOf(text: string): { label: string; reply: string } {
  for (const t of TOPIC_RULES) if (t.re.test(text || "")) return { label: t.label, reply: t.reply };
  return { label: "a general post", reply: "a post on the same subject from your angle" };
}

/** What to do about a competitor post that worked. */
export function competitorAction(competitor: string, ours: string, text: string, eng: number): string {
  const t = topicOf(text);
  return `${competitor} got ${eng} engagement${eng === 1 ? "" : "s"} on ${t.label}. Answer for ${ours} with ${t.reply} — schedule it in Publish this week.`;
}

/** What to do about one of our own posts that worked. */
export function bestPostAction(company: string, eng: number): string {
  return `Best post of ${company} this week (${eng} engagements): reuse the angle — a follow-up post or an X thread next week, and comment back on the replies.`;
}

/** What to do about a campaign short of its objective. */
export function shortfallAction(company: string, posts: number, perWeek: number): string {
  const short = Math.max(0, perWeek - posts);
  if (posts === 0) return `${company} published nothing this week: check the client validation and the posting browser, then schedule ${perWeek} posts for next week.`;
  return `${company} is ${short} post${short === 1 ? "" : "s"} short: check what is waiting for validation in Publish and fill next week's ${perWeek} slots.`;
}

export function weekVerdict(grade: Grade | null): string {
  switch (grade) {
    case "A": return "The work was done.";
    case "B": return "Almost there — a few posts missing.";
    case "C": return "Behind plan on several campaigns.";
    case "D": return "Well behind plan — action needed.";
    case "F": return "Most of the planned work was not published.";
    default: return "No active campaign this week.";
  }
}
