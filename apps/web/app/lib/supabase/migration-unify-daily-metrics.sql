-- Migration: Unify daily_metrics table - Remove fnb_daily_metrics, standardize fields
-- Run this in your Supabase SQL Editor
-- 
-- This migration:
-- 1. Adds unified fields to daily_metrics (revenue, cost, F&B fields)
-- 2. Migrates data from fnb_daily_metrics if it exists
-- 3. Drops fnb_daily_metrics table
-- 4. Updates constraints and indexes

-- PART 1: Add new unified columns to daily_metrics (if they don't exist)

-- Add revenue column (canonical field)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' AND column_name = 'revenue'
  ) THEN
    ALTER TABLE daily_metrics ADD COLUMN revenue NUMERIC;
    -- Calculate revenue from existing rooms_sold * avg_room_rate for existing rows
    UPDATE daily_metrics 
    SET revenue = rooms_sold * avg_room_rate 
    WHERE revenue IS NULL AND rooms_sold IS NOT NULL AND avg_room_rate IS NOT NULL;
  END IF;
END $$;

-- Add cost column (canonical field, rename from total_operating_cost)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' AND column_name = 'cost'
  ) THEN
    -- If total_operating_cost exists, copy to cost, then drop old column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'daily_metrics' AND column_name = 'total_operating_cost'
    ) THEN
      ALTER TABLE daily_metrics ADD COLUMN cost NUMERIC;
      UPDATE daily_metrics SET cost = total_operating_cost WHERE cost IS NULL;
      ALTER TABLE daily_metrics DROP COLUMN total_operating_cost;
    ELSE
      ALTER TABLE daily_metrics ADD COLUMN cost NUMERIC;
    END IF;
  END IF;
END $$;

-- Rename avg_room_rate to adr (canonical field name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' AND column_name = 'avg_room_rate'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' AND column_name = 'adr'
  ) THEN
    ALTER TABLE daily_metrics RENAME COLUMN avg_room_rate TO adr;
  END IF;
END $$;

-- Add accommodation fields (if they don't exist)
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS rooms_available INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS staff_count INTEGER;

-- Add F&B fields (if they don't exist)
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS customers INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS avg_ticket NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS fnb_staff INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS promo_spend NUMERIC;

-- PART 2: Migrate data from fnb_daily_metrics to daily_metrics (if fnb_daily_metrics exists)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'fnb_daily_metrics'
  ) THEN
    -- Migrate F&B data to daily_metrics
    INSERT INTO daily_metrics (
      branch_id,
      metric_date,
      revenue,
      cost,
      cash_balance,
      customers,
      avg_ticket,
      fnb_staff,
      promo_spend,
      created_at
    )
    SELECT 
      branch_id,
      metric_date,
      total_sales as revenue, -- Map total_sales -> revenue
      total_operating_cost as cost, -- Map total_operating_cost -> cost
      cash_balance,
      total_customers as customers, -- Map total_customers -> customers
      CASE 
        WHEN total_customers > 0 THEN total_sales / total_customers 
        ELSE NULL 
      END as avg_ticket, -- Calculate avg_ticket
      staff_on_duty as fnb_staff, -- Map staff_on_duty -> fnb_staff
      promo_spend,
      created_at
    FROM fnb_daily_metrics
    ON CONFLICT (branch_id, metric_date) 
    DO UPDATE SET
      revenue = EXCLUDED.revenue,
      cost = EXCLUDED.cost,
      cash_balance = EXCLUDED.cash_balance,
      customers = EXCLUDED.customers,
      avg_ticket = EXCLUDED.avg_ticket,
      fnb_staff = EXCLUDED.fnb_staff,
      promo_spend = EXCLUDED.promo_spend;
    
    RAISE NOTICE 'Migrated data from fnb_daily_metrics to daily_metrics';
  ELSE
    RAISE NOTICE 'fnb_daily_metrics table does not exist, skipping migration';
  END IF;
END $$;

-- PART 3: Make revenue and cost NOT NULL (after migration)
-- First, ensure all rows have values
UPDATE daily_metrics SET revenue = 0 WHERE revenue IS NULL;
UPDATE daily_metrics SET cost = 0 WHERE cost IS NULL;

-- Then make them NOT NULL
ALTER TABLE daily_metrics ALTER COLUMN revenue SET NOT NULL;
ALTER TABLE daily_metrics ALTER COLUMN cost SET NOT NULL;

-- PART 4: Drop fnb_daily_metrics table (after migration)
DROP TABLE IF EXISTS fnb_daily_metrics CASCADE;

-- PART 5: Verify the unified structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'daily_metrics'
ORDER BY ordinal_position;
