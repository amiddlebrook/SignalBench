# SignalBench | Architecture decision and design review

**Scope:** Agent testing, reliability and release governance. Standalone deployment on Cloudflare Workers, static assets, D1 and optionally Workers AI within the free allowances.

## System boundaries

Evaluation cases produce persisted results. Release gates compute pass rate from individual results, compare to completed baseline, block regressions, and write immutable verdict records.

All persistent data is stored in per-application D1. The application frontend and API are deployed together via one Worker; no external hosted DB or paid queue is assumed. GitHub Actions runs TypeScript checks, smoke/integration tests, D1 migrations and Wrangler deployment. The deployment runs a live HTTP smoke check of the Worker URL.

## API integrity

- All `/api/*` routes except `/api/health` are protected by a Worker `ADMIN_TOKEN` bearer secret for the current **single-administrator demo**.
- State-changing methods use parameterized SQL and validation. Detailed `400`, `409`, and `422` responses avoid ambiguous success.
- Existing D1 rows survive deploys; each migration is additive and idempotently tracked by Wrangler.
- The new `0002_advanced.sql` migration installs the application-specific governance and reliability tables.
- JSON responses are uncached. The UI uses `sessionStorage` for the token, not checked-in configuration.

## Domain failure modes

- Sample-size manipulation: min_cases required by each release gate.
- Ungraded run falsely passing: verdicts reject incomplete runs.
- Aggregate-metric fraud: gate recalculates metrics from per-case records.
- Evaluation contamination and brittle string matching: assertions are deterministic but not a substitute for graded semantic judgments.

## Verification

- `npm run check`: TypeScript strict-mode compilation and frontend syntax.
- `npm test`: SQLite-backed integration tests using a deterministic Workers AI test adapter; never conflated with production provider responses.
- `npm run verify:live`: health, authenticated D1 APIs, static site, and unauthorized API contract after deployment.
- Provisioning script reuses D1 databases and applies migrations before each deployment.

## Design tradeoffs

Free-tier hosting deliberately limits scope. This is not a horizontally scalable, multi-tenant production system; global SLAs, audited governance and paid provider budgets cannot be validated with tiny synthetic workloads. No paid upgrade should occur automatically.

## Phase 3: Statistical release gates

Optional Wilson 95% lower-bound thresholds limit false confidence from small evaluation samples. A baseline regression block remains mandatory. Wilson intervals assume independent Bernoulli outcomes; correlated or cherry-picked tests invalidate statistical interpretation.

## Phase 4: Delegated API credentials

`0004_access.sql` introduces expiring, revocable, SHA-256-hashed delegated credentials and an issuance/revocation audit. Authentication is enforced by `src/access.ts` from `withApi`, before any domain route executes. The shared API key policy does **not** implement object-level ACLs or tenant isolation. Access operations are confined to the root Worker `ADMIN_TOKEN`, and delegated keys are intentionally unable to administer credentials. See [`SECURITY.md`](SECURITY.md).
