-- PART 7: Add validation constraints to daily_metrics table
-- Ensures data integrity and prevents duplicate entries

-- Ensure daily_metrics uniqueness (one record per branch per date)
ALTER TABLE daily_metrics
ADD CONSTRAINT IF NOT EXISTS unique_branch_metric_date
UNIQUE (branch_id, metric_date);

-- Add NOT NULL constraints where required
ALTER TABLE daily_metrics
ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE daily_metrics
ALTER COLUMN metric_date SET NOT NULL;

-- Add index for performance (queries by branch_id and date)
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_date
ON daily_metrics(branch_id, metric_date);

-- Add index for date range queries
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date
ON daily_metrics(metric_date DESC);

-- Verify constraints were added
DO $$
BEGIN
  -- Check if unique constraint exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_branch_metric_date'
  ) THEN
    RAISE NOTICE '✅ Unique constraint unique_branch_metric_date added successfully';
  ELSE
    RAISE WARNING '❌ Unique constraint unique_branch_metric_date not found';
  END IF;

  -- Check if indexes exist
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_daily_metrics_branch_date'
  ) THEN
    RAISE NOTICE '✅ Index idx_daily_metrics_branch_date created successfully';
  ELSE
    RAISE WARNING '❌ Index idx_daily_metrics_branch_date not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_daily_metrics_date'
  ) THEN
    RAISE NOTICE '✅ Index idx_daily_metrics_date created successfully';
  ELSE
    RAISE WARNING '❌ Index idx_daily_metrics_date not found';
  END IF;
END $$;
