# Monitoring Columns Migration Guide

## Issue
The `monitoring_enabled` and `alert_sensitivity` columns may not exist in the `branches` table, causing errors when the application tries to query them.

## Solution
Run the migration script to add these columns to your database.

## Migration Script
**File**: `apps/web/app/lib/supabase/add-monitoring-columns.sql`

```sql
-- Add monitoring configuration columns to branches table
-- - monitoring_enabled: boolean (default true)
-- - alert_sensitivity: TEXT ('low' | 'medium' | 'high', default 'medium')

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS alert_sensitivity TEXT DEFAULT 'medium' CHECK (alert_sensitivity IN ('low', 'medium', 'high'));

-- Update existing branches to have monitoring enabled by default
UPDATE branches 
SET monitoring_enabled = TRUE 
WHERE monitoring_enabled IS NULL;

-- Update existing branches to have medium sensitivity by default
UPDATE branches 
SET alert_sensitivity = 'medium' 
WHERE alert_sensitivity IS NULL;
```

## How to Apply

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to SQL Editor

2. **Run the Migration**
   - Copy the SQL from `apps/web/app/lib/supabase/add-monitoring-columns.sql`
   - Paste into SQL Editor
   - Click "Run"

3. **Verify**
   - Check that columns were added:
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'branches' 
   AND column_name IN ('monitoring_enabled', 'alert_sensitivity');
   ```

## Fallback Behavior

If the columns don't exist, the application will:
- Use `monitoring_enabled = true` (default)
- Use `alert_sensitivity = 'medium'` (default)
- Log a warning in development mode
- Continue functioning normally

## Code Changes

The code has been updated to handle missing columns gracefully:
- `apps/web/app/services/db/branch-monitoring-service.ts` - Returns defaults if columns don't exist
- `apps/web/app/services/monitoring-service.ts` - Handles errors gracefully

## Status

✅ **Code Updated**: Handles missing columns gracefully
⚠️ **Migration Required**: Run SQL script to add columns for full functionality
