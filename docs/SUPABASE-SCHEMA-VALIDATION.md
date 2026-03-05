# Supabase Schema Validation

## Issue
The `daily_metrics` table may have missing or inconsistent schema, causing undefined values in health score calculations.

## Required Schema

The `daily_metrics` table must include:

```sql
-- Required columns with NOT NULL constraints and defaults
ALTER TABLE daily_metrics 
  ALTER COLUMN revenue SET NOT NULL,
  ALTER COLUMN revenue SET DEFAULT 0;

ALTER TABLE daily_metrics 
  ALTER COLUMN cost SET NOT NULL,
  ALTER COLUMN cost SET DEFAULT 0;

ALTER TABLE daily_metrics 
  ALTER COLUMN cash_balance SET NOT NULL,
  ALTER COLUMN cash_balance SET DEFAULT 0;

ALTER TABLE daily_metrics 
  ALTER COLUMN rooms_sold SET NOT NULL,
  ALTER COLUMN rooms_sold SET DEFAULT 0;

ALTER TABLE daily_metrics 
  ALTER COLUMN metric_date SET NOT NULL;

ALTER TABLE daily_metrics 
  ALTER COLUMN branch_id SET NOT NULL;
```

## Migration Script

**File**: `apps/web/app/lib/supabase/fix-daily-metrics-schema.sql`

```sql
-- Fix daily_metrics schema to ensure all required fields have defaults
-- This prevents undefined values from causing health score calculation errors

-- Add NOT NULL constraints with defaults
ALTER TABLE daily_metrics 
  ALTER COLUMN revenue SET DEFAULT 0,
  ALTER COLUMN revenue SET NOT NULL;

ALTER TABLE daily_metrics 
  ALTER COLUMN cost SET DEFAULT 0,
  ALTER COLUMN cost SET NOT NULL;

ALTER TABLE daily_metrics 
  ALTER COLUMN cash_balance SET DEFAULT 0,
  ALTER COLUMN cash_balance SET NOT NULL;

ALTER TABLE daily_metrics 
  ALTER COLUMN rooms_sold SET DEFAULT 0,
  ALTER COLUMN rooms_sold SET NOT NULL;

-- Update existing NULL values to defaults
UPDATE daily_metrics 
SET revenue = 0 
WHERE revenue IS NULL;

UPDATE daily_metrics 
SET cost = 0 
WHERE cost IS NULL;

UPDATE daily_metrics 
SET cash_balance = 0 
WHERE cash_balance IS NULL;

UPDATE daily_metrics 
SET rooms_sold = 0 
WHERE rooms_sold IS NULL;

-- Ensure metric_date and branch_id are NOT NULL (should already be enforced)
ALTER TABLE daily_metrics 
  ALTER COLUMN metric_date SET NOT NULL;

ALTER TABLE daily_metrics 
  ALTER COLUMN branch_id SET NOT NULL;
```

## How to Apply

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to SQL Editor

2. **Run the Migration**
   - Copy the SQL from `apps/web/app/lib/supabase/fix-daily-metrics-schema.sql`
   - Paste into SQL Editor
   - Click "Run"

3. **Verify**
   - Check that columns have defaults:
   ```sql
   SELECT column_name, data_type, column_default, is_nullable
   FROM information_schema.columns 
   WHERE table_name = 'daily_metrics' 
   AND column_name IN ('revenue', 'cost', 'cash_balance', 'rooms_sold', 'metric_date', 'branch_id');
   ```

## Code Changes

The code has been updated to handle missing columns gracefully:
- `apps/web/app/services/db/daily-metrics-service.ts` - Validates schema and logs missing fields
- `core/sme-os/engine/health/money-weighted-health-score.ts` - Uses safe number utilities
- `apps/web/app/services/health-score-service.ts` - Validates metrics before calculation
