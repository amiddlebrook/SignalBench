-- Production evaluation results advance their run atomically.
-- Historical fixtures/imported completed runs are not altered by this migration.
CREATE TRIGGER IF NOT EXISTS evaluation_result_order_guard
BEFORE INSERT ON results
FOR EACH ROW
WHEN EXISTS(SELECT 1 FROM runs WHERE id=NEW.run_id AND status='processing')
BEGIN
  SELECT CASE WHEN NEW.passed NOT IN (0,1)
    OR NOT EXISTS (
      SELECT 1 FROM runs r JOIN cases c ON c.id=NEW.case_id
      WHERE r.id=NEW.run_id AND c.suite_id=r.suite_id
      AND (SELECT count(*) FROM cases prior
           WHERE prior.suite_id=c.suite_id AND
            (prior.created_at<c.created_at OR (prior.created_at=c.created_at AND prior.id<c.id)))=r.cursor
      AND NOT EXISTS (SELECT 1 FROM results previous WHERE previous.run_id=NEW.run_id AND previous.case_id=NEW.case_id)
    ) THEN RAISE(ABORT,'Evaluation result out of sequence') END;
END;

CREATE TRIGGER IF NOT EXISTS evaluation_result_atomic
AFTER INSERT ON results
FOR EACH ROW
WHEN EXISTS(SELECT 1 FROM runs WHERE id=NEW.run_id AND status='processing')
BEGIN
  UPDATE runs SET cursor=cursor+1,
    passed=passed+NEW.passed,
    failed=failed+1-NEW.passed,
    status=CASE WHEN cursor+1 >= (SELECT count(*) FROM cases WHERE suite_id=runs.suite_id)
      THEN 'completed' ELSE 'running' END,
    updated_at=NEW.created_at
  WHERE id=NEW.run_id AND status='processing';
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT,'Evaluation result not committed') END;
END;
