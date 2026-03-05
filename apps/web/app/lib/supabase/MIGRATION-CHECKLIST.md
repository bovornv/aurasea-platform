# Migration Checklist: Rename `date` to `metric_date`

## ✅ Pre-Migration Status

All frontend code has been updated to use `metric_date`:
- ✅ `daily-metrics-service.ts` - uses `metric_date` in all queries
- ✅ `fnb-daily-metrics-service.ts` - uses `metric_date` in all queries  
- ✅ `daily-metrics.ts` model - maps `metric_date` (DB) ↔ `date` (app)
- ✅ Schema updated to reflect `metric_date`
- ✅ Debug logging added: `[DAILY_FETCH]` console logs

## 🔧 Migration Steps

### Step 1: Run Migration in Supabase

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `migration-rename-date-to-metric-date.sql`
3. Click "Run" to execute the migration

**Migration file location:**
```
apps/web/app/lib/supabase/migration-rename-date-to-metric-date.sql
```

### Step 2: Verify Migration Success

Run this query in Supabase SQL Editor to verify:

```sql
-- Check daily_metrics table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
  AND column_name = 'metric_date';

-- Check fnb_daily_metrics table  
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fnb_daily_metrics' 
  AND column_name = 'metric_date';

-- Verify constraints exist
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE constraint_name IN (
  'unique_branch_metric_date',
  'unique_fnb_branch_metric_date'
);

-- Verify indexes exist
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN (
  'idx_daily_metrics_metric_date',
  'idx_daily_metrics_branch_metric_date',
  'idx_fnb_daily_metrics_metric_date',
  'idx_fnb_daily_metrics_branch_metric_date'
);
```

**Expected Results:**
- Both tables should show `metric_date` column (DATE type)
- Both unique constraints should exist
- All 4 indexes should exist

### Step 3: Test Frontend

After migration, test the application:

1. **Check Browser Console:**
   - Look for `[DAILY_FETCH]` logs showing successful queries
   - No errors about "column does not exist"
   - No 400/406 errors

2. **Test Daily Metrics Entry:**
   - Navigate to branch metrics page
   - Submit today's metrics
   - Verify save succeeds

3. **Test Metrics Retrieval:**
   - View branch overview page
   - Check that health scores load correctly
   - Verify graphs display data

4. **Verify Query Format:**
   - Open browser DevTools → Network tab
   - Filter for Supabase requests
   - Look for queries like:
     ```
     GET .../daily_metrics?select=*&branch_id=eq.xxx&order=metric_date.asc
     ```
   - Should see `metric_date` in query params, NOT `date`

## 🐛 Troubleshooting

### Error: "column 'date' does not exist"
- **Cause:** Migration not run yet
- **Fix:** Run the migration SQL script

### Error: "column 'metric_date' does not exist"  
- **Cause:** Migration failed or table doesn't exist
- **Fix:** Check if tables exist, then re-run migration

### Error: "duplicate key value violates unique constraint"
- **Cause:** Old constraint still exists
- **Fix:** Migration should have dropped old constraints, but you can manually drop:
  ```sql
  ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS unique_branch_date;
  ALTER TABLE fnb_daily_metrics DROP CONSTRAINT IF EXISTS unique_fnb_branch_date;
  ```

### 406 Not Acceptable Error
- **Cause:** RLS policies might be blocking queries
- **Fix:** Verify RLS policies are enabled and allow SELECT/INSERT/UPDATE

## ✅ Post-Migration Verification

After successful migration:

- [ ] Migration SQL executed without errors
- [ ] `metric_date` column exists in both tables
- [ ] Constraints and indexes recreated successfully
- [ ] Frontend queries work (check browser console)
- [ ] No "column does not exist" errors
- [ ] Daily metrics can be saved
- [ ] Daily metrics can be retrieved
- [ ] Health scores calculate correctly
- [ ] Graphs display data correctly

## 📝 Notes

- The app model still uses `date` internally (this is correct)
- The mapping functions handle conversion: `metric_date` (DB) ↔ `date` (app)
- Old migration files (`migration-add-daily-metrics.sql`) still reference `date` - this is fine, they're historical
- The main `schema.sql` file has been updated to reflect `metric_date`
