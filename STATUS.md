# socialtracking status

Last updated: 2026-11-23

## Deploy route
Merge to `main` here, then run workflow `deploy-siblings.yml` in the **social** repo on branch `deploy/socialtracking`
(workflow_dispatch or a push to that branch). It builds socialtracking@main and deploys Cloudflare Pages `gershon-socialtracking`
→ https://socialtracking.gershon.ai. It never runs prisma db push.
Live check: `GET https://socialtracking.gershon.ai/api/ping` → `version`, `build`.

## Current — v0.9.1 (weekly report redesign, PR #5 rebuilt 2026-11-25)
- Olivier 2026-11-23: weekly report design not good enough; each content item → see on social.gershon.ai / original source / suggested action; links must open the exact place; grade the week and the competition.
- ✅ New e-mail (src/lib/reports/weekly-email.ts): Week grade + Competition grade hero, campaigns graded A–F, needs-attention cards, best posts and top rival posts each with View in Social (social.gershon.ai/clients/<id>?post=<postId> — Social v4.83.0 scrolls to that row), Original post, Suggested action + "Do it in Publish". Grades in src/lib/reports/weekly-grade.ts. Rivals = Competitor Watch links (OrgSetting competitors:<campaignId>).
- ✅ Wrong week fixed: Cloudflare cron "* * 1" = SUNDAY, so the 11-22 send covered Nov 9–15. Cron now "30 12 * * MON"; weekWindow ends on the last Sunday ≤ today.
- tests/weekly-report.test.mts 5/5, attainment 10/10, tsc ✅.

## v0.9.0 (extension 0.4.0)
- v0.9.0 Related people: company page section "Related people" — add a person (name, role, LinkedIn /in/ link, optional X); their own posts are collected with the company. Person = Client row of category COMPANY (outside product scope, so never listed as a company here) + link in OrgSetting `related-people:<companyId>`; no schema change. API /api/clients/[id]/people (GET/POST/DELETE); /api/extension/clients also returns people (category PERSON); ingest accepts their connections; extension 0.4.0 opens /in/<vanity>/recent-activity/all/. Social's collector already reads /in/ profiles of ACTIVE COMPANY rows ✅
- Checks 2026-11-23: tsc ✅; next build ✅; tests related-people 2/2 ✅, linkedin-page ✅, attainment ✅
- Related people not yet in monthly/weekly reports ❌

## Previous — v0.8.2
- v0.8.2 brand red #FE1B04 (dark #d11200, tint #fff5f5) in UI, tailwind tokens and all e-mail/PDF renderers — PR #3 merged 2026-11-14 ✅
- Version in package.json + src/lib/product.ts ✅
- Checks 2026-11-14: tsc ✅; tests/attainment 10/10 ✅; tests/remote-collect + remote-collect-e2e fail without a database (same on main) — not a regression
- Not run: next build locally (runs in the deploy workflow)

## Open ❌
- remote-collect tests need a test database to run in CI ❌
