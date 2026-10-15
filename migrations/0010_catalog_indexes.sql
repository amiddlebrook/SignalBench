CREATE INDEX IF NOT EXISTS idx_catalog_cases_cursor ON cases(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_gate_verdicts_cursor ON gate_verdicts(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_runs_cursor ON runs(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_suites_cursor ON suites(created_at DESC,id DESC);
