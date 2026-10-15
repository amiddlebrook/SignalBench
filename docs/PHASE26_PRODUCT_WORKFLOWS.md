# SignalBench — Phase 26: Release preview and complete evidence coverage

## Purpose

Preview performs no verdict write, reports Wilson 95% lower bound and matched case counts. Final gate writes now refuse completed runs with missing case results or incomplete pinned baselines.

## Production API

`POST /api/gates/:id/preview`

Example: `{"run_id":"completed-run-id"}`

The endpoint is authenticated through the existing Cloudflare Worker authorization layer. No paid dependency or new mandatory Cloudflare resource is introduced. Production defaults to remote inference disabled; limits and account-wide quotas still apply.

## Interface

The product-specific UI integrates this operation in its existing workflow via `lab-certify`. Interactions provide explicit labels and status messages and reuse the application's own visual language.

## Verification

- `npm run check` and `npm run verify:release`
- `npm test`, including `tests/phase26.test.mjs`
- CI and deployment contract checks for the Phase 26 UI and API
- Do not claim browser-level UX acceptance from API smoke tests.

## Not a final enterprise certification

Missing: tenant-level authorization, independent penetration testing, failover/load validation, recoverability drills, realistic end-to-end browser automation and an accessibility audit. These require explicit measured acceptance before any enterprise-production claim.
