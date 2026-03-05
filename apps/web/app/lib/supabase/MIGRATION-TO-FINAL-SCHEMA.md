# Migration to Final Production Schema

## Overview

This migration transforms the Hospitality AI vertical to its final production architecture with 4 tables only.

## Migration Steps

### Step 1: Backup Current Data
```sql
-- Backup existing data
CREATE TABLE weekly_metrics_backup AS SELECT * FROM weekly_metrics;
CREATE TABLE fnb_daily_metrics_backup AS SELECT * FROM fnb_daily_metrics;
```

### Step 2: Create New Schema
Run `FINAL-PRODUCTION-SCHEMA.sql` to create the new tables.

### Step 3: Migrate Organizations
```sql
-- Add vertical_type if missing
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vertical_type TEXT;
UPDATE organizations SET vertical_type = 'hybrid' WHERE vertical_type IS NULL;
ALTER TABLE organizations ALTER COLUMN vertical_type SET NOT NULL;
```

### Step 4: Migrate Branches
```sql
-- Add new setup fields
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
ALTER TABLE branches ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

### Step 5: Migrate Daily Metrics
```sql
-- Ensure daily_metrics has correct structure
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS revenue NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS rooms_sold INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS adr NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS customers INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS avg_ticket NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS cash_balance NUMERIC;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS actual_cost NUMERIC;

-- Migrate from weekly_metrics (distribute weekly totals)
-- This is a simplified migration - adjust based on your data
INSERT INTO daily_metrics (branch_id, metric_date, revenue, cost, cash_balance)
SELECT 
  branch_id,
  week_start_date + (generate_series(0, 6) || ' days')::interval AS metric_date,
  revenue_7d / 7 AS revenue,
  costs_7d / 7 AS cost,
  cash_balance
FROM weekly_metrics
ON CONFLICT (branch_id, metric_date) DO NOTHING;
```

### Step 6: Create Health Snapshots Table
```sql
-- Already created in FINAL-PRODUCTION-SCHEMA.sql
-- This is optional - engine works without it
```

### Step 7: Drop Legacy Tables (AFTER VERIFICATION)
```sql
-- Only after confirming all data is migrated and system works
-- DROP TABLE IF EXISTS weekly_metrics;
-- DROP TABLE IF EXISTS fnb_daily_metrics;
```

## Rollback Plan

If issues occur:
1. Restore from backups
2. Revert code changes
3. Restore previous schema

## Verification Checklist

- [ ] All organizations have vertical_type
- [ ] All branches have setup fields populated
- [ ] Daily metrics migrated successfully
- [ ] Health snapshots table created (optional)
- [ ] All indexes created
- [ ] RLS policies applied
- [ ] Application works with new schema
- [ ] Legacy tables can be dropped
