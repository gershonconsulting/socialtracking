/**
 * Social Tracking report schedule — a tiny Cloudflare Worker (gershon-socialtracking-cron).
 * Cloudflare Pages has no cron, so this Worker calls the app's own report routes:
 *   • Mondays 12:30 UTC (08:30 New York) → POST /api/report/weekly  (→ social@gershonconsulting.com)
 *   • 1st of the month 12:00 UTC          → POST /api/report/monthly (before Social's 13:00 run, which
 *     then skips the CAMPAIGN / INTERNAL items Social Tracking already sent — shared sent-log)
 * Secret binding REPORT_CRON_KEY must equal the Pages project's REPORT_CRON_KEY.
 * Both routes are idempotent, so a retry never double-sends.
 */
const BASE = "https://socialtracking.gershon.ai";

async function call(path, env) {
  const r = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Bearer ${env.REPORT_CRON_KEY}` } });
  const body = await r.text();
  console.log(path, r.status, body.slice(0, 500));
  return { status: r.status, body };
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "30 12 * * 1") ctx.waitUntil(call("/api/report/weekly", env));
    if (event.cron === "0 12 1 * *") ctx.waitUntil(call("/api/report/monthly", env));
  },
  async fetch() {
    return new Response("Social Tracking report schedule: weekly Mon 12:30 UTC, monthly 1st 12:00 UTC", { status: 200 });
  },
};
