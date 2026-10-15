# Phase 28 — Transactionally consistent evaluation results

**Problem corrected:** a graded evaluation result and its run counters were written separately. If the second write failed, the database could hold a result without the corresponding run cursor/count update. Subsequent release checks might then see inconsistent evidence.

**Production fix:** `0014_atomic_evaluation_results.sql` installs two SQLite triggers. For a run in the claimed `processing` state, a result must correspond to the next ordered case, and the INSERT atomically advances the run's cursor and pass/fail counters. The final case changes status to `completed` in that same SQLite transaction. A mismatch, duplicate or storage failure aborts the whole result insert. Completed historic datasets remain untouched.

The API still requires a completed evaluation with complete test coverage before granting any release decision. The fix introduces no outside dependencies, no new paid Cloudflare resources and no change to the branded evaluation workbench.

**Evidence:** three additional SQL-backed tests exercise normal two-case completion, an out-of-order result attempt, and an injected run-counter failure that proves rollback. GitHub release preflight verifies all 14 D1 migrations. The live deployment suite then checks authenticated APIs and production Chromium desktop/mobile rendering.

**Limit:** external model calls cannot be rolled back, so exactly-once inference across interrupted Workers requires additional durable execution. This release fixes local result persistence, not remote provider transactional semantics.
