-- ============================================================
-- MIGRATION TO FINAL PRODUCTION SCHEMA
-- ============================================================
-- This script migrates the database to the final production architecture
-- Safe to run multiple times (idempotent)
-- Run this AFTER backing up your data
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Backup existing data (if tables exist)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'weekly_metrics') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS weekly_metrics_backup AS SELECT * FROM weekly_metrics';
    RAISE NOTICE 'Backed up weekly_metrics';
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fnb_daily_metrics') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS fnb_daily_metrics_backup AS SELECT * FROM fnb_daily_metrics';
    RAISE NOTICE 'Backed up fnb_daily_metrics';
  END IF;
END $$;

-- ============================================================
-- STEP 2: Update organizations table
-- ============================================================
-- Add vertical_type column if missing
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vertical_type TEXT;

-- Set default value for existing rows
UPDATE organizations SET vertical_type = 'hybrid' WHERE vertical_type IS NULL;

-- Add constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_vertical_type_check'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_vertical_type_check 
      CHECK (vertical_type IN ('accommodation', 'fnb', 'hybrid'));
  END IF;
END $$;

-- Make NOT NULL (only if all rows have values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'vertical_type' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE organizations ALTER COLUMN vertical_type SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- STEP 3: Update branches table (add setup fields)
-- ============================================================
ALTER TABLE branches ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS rooms_available INTEGER;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS baseline_adr NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS accommodation_staff_count INTEGER;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS seating_capacity INTEGER;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS baseline_avg_ticket NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS fnb_staff_count INTEGER;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS monthly_fixed_cost NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS variable_cost_ratio NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS debt_payment_monthly NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS credit_line_limit NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Set business_type default if missing (derive from has_accommodation/has_fnb)
UPDATE branches 
SET business_type = CASE
  WHEN has_accommodation = TRUE AND has_fnb = TRUE THEN 'hybrid'
  WHEN has_accommodation = TRUE THEN 'accommodation'
  WHEN has_fnb = TRUE THEN 'fnb'
  ELSE 'hybrid'
END
WHERE business_type IS NULL;

-- Make business_type NOT NULL if all rows have values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM branches WHERE business_type IS NULL
  ) THEN
    ALTER TABLE branches ALTER COLUMN business_type SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- STEP 4: Update daily_metrics table
-- ============================================================
-- Ensure all required columns exist
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS revenue NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS rooms_sold INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS adr NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS customers INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS avg_ticket NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS cash_balance NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS cost NUMERIC;

-- Rename actual_cost to cost if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
    AND column_name = 'actual_cost'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
    AND column_name = 'cost'
  ) THEN
    ALTER TABLE daily_metrics RENAME COLUMN actual_cost TO cost;
    RAISE NOTICE 'Renamed actual_cost to cost';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
    AND column_name = 'actual_cost'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
    AND column_name = 'cost'
  ) THEN
    -- Both exist - migrate data and drop old column
    UPDATE daily_metrics SET cost = actual_cost WHERE cost IS NULL AND actual_cost IS NOT NULL;
    ALTER TABLE daily_metrics DROP COLUMN actual_cost;
    RAISE NOTICE 'Migrated actual_cost to cost and dropped old column';
  END IF;
END $$;

-- Ensure revenue is NOT NULL (if all rows have values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM daily_metrics WHERE revenue IS NULL
  ) THEN
    ALTER TABLE daily_metrics ALTER COLUMN revenue SET NOT NULL;
  END IF;
END $$;

-- Make cost nullable (FINAL PRODUCTION SCHEMA - cost is optional, can be estimated)
DO $$
BEGIN
  -- Check if cost is currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
    AND column_name = 'cost' 
    AND is_nullable = 'NO'
  ) THEN
    -- Set default for existing NULL values (if any would become NULL)
    -- Then make nullable
    ALTER TABLE daily_metrics ALTER COLUMN cost DROP NOT NULL;
    RAISE NOTICE 'Made cost column nullable (optional in final schema)';
  END IF;
END $$;

-- Make cash_balance nullable (FINAL PRODUCTION SCHEMA - optional, owner updates weekly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
    AND column_name = 'cash_balance' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE daily_metrics ALTER COLUMN cash_balance DROP NOT NULL;
    RAISE NOTICE 'Made cash_balance column nullable (optional in final schema)';
  END IF;
END $$;

-- Ensure unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_branch_metric_date'
  ) THEN
    ALTER TABLE daily_metrics ADD CONSTRAINT unique_branch_metric_date 
      UNIQUE (branch_id, metric_date);
  END IF;
END $$;

-- ============================================================
-- STEP 5: Create health_snapshots table (optional cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  health_score NUMERIC NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  alerts_json JSONB,
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_branch_snapshot_date UNIQUE (branch_id, metric_date)
);

-- ============================================================
-- STEP 6: Create indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_branches_organization_id ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_id ON daily_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_date ON daily_metrics(branch_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_branch_id ON health_snapshots(branch_id);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_metric_date ON health_snapshots(metric_date);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_branch_date ON health_snapshots(branch_id, metric_date);

-- ============================================================
-- STEP 7: Enable RLS (if not already enabled)
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 8: Create/Update RLS Policies
-- ============================================================
-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read their organization's data" ON organizations;
DROP POLICY IF EXISTS "Users can read their organization's branches" ON branches;
DROP POLICY IF EXISTS "Users can read their organization's daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can insert their organization's daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can update their organization's daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can read their organization's health snapshots" ON health_snapshots;

-- Create policies
CREATE POLICY "Users can read their organization's data"
  ON organizations FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's branches"
  ON branches FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's daily metrics"
  ON daily_metrics FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can insert their organization's daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can update their organization's daily metrics"
  ON daily_metrics FOR UPDATE
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's health snapshots"
  ON health_snapshots FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

-- ============================================================
-- STEP 9: Migrate data from weekly_metrics (if exists)
-- ============================================================
DO $$
DECLARE
  weekly_count INTEGER;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'weekly_metrics') THEN
    SELECT COUNT(*) INTO weekly_count FROM weekly_metrics;
    
    IF weekly_count > 0 THEN
      -- Distribute weekly totals across 7 days using LATERAL join
      -- Use CTE to avoid issues with set-returning functions in WHERE clause
      INSERT INTO daily_metrics (branch_id, metric_date, revenue, cost, cash_balance)
      WITH expanded_weekly AS (
        SELECT 
          w.branch_id,
          (w.week_start_date + (day_offset || ' days')::interval)::DATE AS metric_date,
          COALESCE(w.revenue_7d, 0) / 7 AS revenue,
          COALESCE(w.costs_7d, 0) / 7 AS cost,
          w.cash_balance
        FROM weekly_metrics w
        CROSS JOIN LATERAL generate_series(0, 6) AS day_offset
      )
      SELECT 
        e.branch_id,
        e.metric_date,
        e.revenue,
        e.cost,
        e.cash_balance
      FROM expanded_weekly e
      WHERE NOT EXISTS (
        SELECT 1 FROM daily_metrics d 
        WHERE d.branch_id = e.branch_id 
        AND d.metric_date = e.metric_date
      )
      ON CONFLICT (branch_id, metric_date) DO NOTHING;
      
      RAISE NOTICE 'Migrated % weekly_metrics rows to daily_metrics', weekly_count;
    END IF;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run these after migration)
-- ============================================================
-- Check organizations have vertical_type
-- SELECT id, name, vertical_type FROM organizations;

-- Check branches have setup fields
-- SELECT id, name, business_type, rooms_available, monthly_fixed_cost FROM branches LIMIT 5;

-- Check daily_metrics structure
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'daily_metrics' 
-- ORDER BY ordinal_position;

-- Check data migration
-- SELECT COUNT(*) as daily_count FROM daily_metrics;
-- SELECT COUNT(*) as weekly_count FROM weekly_metrics_backup;

-- ============================================================
-- ROLLBACK (if needed)
-- ============================================================
-- If migration fails, restore from backups:
-- DROP TABLE IF EXISTS daily_metrics;
-- CREATE TABLE daily_metrics AS SELECT * FROM daily_metrics_backup;
-- (Adjust based on your backup strategy)
