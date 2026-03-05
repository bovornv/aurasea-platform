-- PART 8: Normalize branch sort_order (no duplicates, contiguous 1..N)
-- Run if sort_order values become inconsistent. Safe to run multiple times.

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC NULLS LAST, created_at ASC) AS new_order
  FROM branches
)
UPDATE branches
SET sort_order = ordered.new_order
FROM ordered
WHERE branches.id = ordered.id;
