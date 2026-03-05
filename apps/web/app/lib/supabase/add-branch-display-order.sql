-- Migration: Add display_order column to branches table
-- Allows manual ordering of branches in Company View and Branch dropdown

-- PART 1: Add display_order column
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- PART 2: Initialize display_order for existing branches
-- Set display_order based on created_at (oldest first = lower order)
UPDATE branches
SET display_order = sub.row_number
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_number
  FROM branches
) sub
WHERE branches.id = sub.id;

-- PART 3: Add index for performance
CREATE INDEX IF NOT EXISTS idx_branches_display_order
ON branches(display_order);

-- PART 4: Ensure display_order is NOT NULL (set default for any NULL values)
UPDATE branches
SET display_order = 0
WHERE display_order IS NULL;

-- Note: We don't set NOT NULL constraint to avoid breaking existing data
-- The default value of 0 ensures all branches have an order
