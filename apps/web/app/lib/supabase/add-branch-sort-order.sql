-- Migration: Add sort_order column to branches table for proper reordering
-- Use sort_order as the single source of truth for branch order (not array index).

-- PART 1: Add sort_order column
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS sort_order integer;

-- PART 2: Initialize existing branches by created_at (oldest first)
UPDATE branches
SET sort_order = ordered.row_number
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS row_number
  FROM branches
) ordered
WHERE branches.id = ordered.id;

UPDATE branches SET sort_order = 0 WHERE sort_order IS NULL;

-- PART 3: Index for ordering queries
CREATE INDEX IF NOT EXISTS idx_branches_sort_order ON branches(sort_order);

-- PART 8 (optional): Normalize inconsistent sort_order — run if values get out of sync
-- WITH ordered AS (
--   SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC, created_at ASC) AS new_order
--   FROM branches
-- )
-- UPDATE branches SET sort_order = ordered.new_order
-- FROM ordered WHERE branches.id = ordered.id;
