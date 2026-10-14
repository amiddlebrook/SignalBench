ALTER TABLE quality_gates ADD COLUMN confidence_floor REAL NOT NULL DEFAULT 0 CHECK(confidence_floor BETWEEN 0 AND 1);
ALTER TABLE gate_verdicts ADD COLUMN lower_bound REAL NOT NULL DEFAULT 0;
