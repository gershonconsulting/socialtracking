# socialtracking status

Last updated: 2026-11-14 (night push)

## Deploy route
Merge to `main` here, then run workflow `deploy-siblings.yml` in the **social** repo on branch `deploy/socialtracking`
(workflow_dispatch or a push to that branch). It builds socialtracking@main and deploys Cloudflare Pages `gershon-socialtracking`
→ https://socialtracking.gershon.ai. It never runs prisma db push.
Live check: `GET https://socialtracking.gershon.ai/api/ping` → `version`, `build`.

## Current — v0.8.2
- v0.8.2 brand red #FE1B04 (dark #d11200, tint #fff5f5) in UI, tailwind tokens and all e-mail/PDF renderers — PR #3 merged 2026-11-14 ✅
- Version in package.json + src/lib/product.ts ✅
- Checks 2026-11-14: tsc ✅; tests/attainment 10/10 ✅; tests/remote-collect + remote-collect-e2e fail without a database (same on main) — not a regression
- Not run: next build locally (runs in the deploy workflow)

## Open ❌
- remote-collect tests need a test database to run in CI ❌
