# Post-Migration Testing Guide

## ✅ Migration Complete!

The database migration has been successfully executed. Now let's verify everything works.

## Step 1: Database Verification

Run the verification queries in `apps/web/app/lib/supabase/verify-migration.sql` or run these key checks:

### Quick Verification (Run in Supabase SQL Editor)

```sql
-- 1. Check schema structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
ORDER BY ordinal_position;

-- 2. Verify cost column (should exist, should be nullable)
SELECT column_name, is_nullable
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
AND column_name = 'cost';

-- 3. Check data exists
SELECT COUNT(*) as daily_count FROM daily_metrics;
SELECT COUNT(*) as branch_count FROM branches;

-- 4. Sample data check
SELECT branch_id, metric_date, revenue, cost, cash_balance
FROM daily_metrics
ORDER BY metric_date DESC
LIMIT 5;
```

**Expected Results:**
- ✅ `cost` column exists and is nullable
- ✅ `revenue` column exists and is NOT NULL
- ✅ Data exists in `daily_metrics` (if migrated from weekly_metrics)
- ✅ No `actual_cost` column

## Step 2: Application Testing Checklist

### 2.1 Test Daily Metrics Entry (Staff Flow)

**Path:** `/branch/log-today`

**How to access:**
- Direct URL: `http://localhost:3000/branch/log-today` (or your domain)
- Navigation: Click "Log Today" in the branch navigation menu
- Or navigate directly in browser address bar

- [ ] Page loads without errors
- [ ] Can enter revenue (or auto-calculates from rooms/customers)
- [ ] Can enter operational data (rooms sold OR customers)
- [ ] Optional finance section is collapsible (Owner only)
- [ ] Submit button works
- [ ] Success message appears
- [ ] Redirects to branch overview after save
- [ ] **Time check:** Should take < 30 seconds

**Browser Console Check:**
- [ ] No errors about missing columns
- [ ] `[DailyMetricsService]` logs show successful save
- [ ] No 400/406 errors

### 2.2 Test Branch Overview

**Path:** `/branch/overview`

- [ ] Page loads without errors
- [ ] Health score displays (or shows "No data yet" message)
- [ ] Critical Alerts Snapshot shows alerts OR green "System Stable" message
- [ ] Top Revenue Leaks shows leaks OR green "No concentration risk" message
- [ ] Performance Movement shows trends OR informative message about data needed
- [ ] No blank sections
- [ ] All sections have structured explanations

**Browser Console Check:**
- [ ] `[DAILY_FETCH]` logs show data retrieval
- [ ] No errors about `weekly_metrics`
- [ ] Health score calculates successfully

### 2.3 Test Trends Page

**Path:** `/branch/trends`

- [ ] Page loads without errors
- [ ] Shows trends if 10+ days of data exist
- [ ] Shows informative message if insufficient data
- [ ] Revenue trend displays correctly
- [ ] Cost trend displays correctly
- [ ] Margin trend displays correctly
- [ ] Occupancy trend displays (if accommodation)

**Browser Console Check:**
- [ ] `[DAILY_FETCH]` logs show 40 days fetched
- [ ] No errors about insufficient data when data exists

### 2.4 Test Alerts Page

**Path:** `/branch/alerts` or `/group/alerts`

- [ ] Page loads without errors
- [ ] Shows active alerts OR "System stable" message
- [ ] Alert details are correct
- [ ] Revenue impact displays correctly
- [ ] Can navigate to alert details

**Browser Console Check:**
- [ ] `[MonitoringService]` logs show alert evaluation
- [ ] All 18 alert types can compute (check logs)

### 2.5 Test Group/Owner Overview

**Path:** `/group/overview`

- [ ] Page loads without errors
- [ ] Portfolio health overview displays
- [ ] Branch comparison works
- [ ] Cross-vertical alerts display
- [ ] No blank sections

### 2.6 Test Health Score Calculation

**Verify:**
- [ ] Health score calculates from `daily_metrics` only
- [ ] No dependencies on `weekly_metrics`
- [ ] Score updates after saving new daily metrics
- [ ] Score matches between card and graph

**Browser Console Check:**
- [ ] `[HealthScoreService]` logs show calculation
- [ ] No warnings about missing weekly data

## Step 3: Data Flow Verification

### 3.1 End-to-End Flow Test

1. **Save Daily Metric**
   - Go to `/branch/log-today`
   - Enter today's data
   - Submit

2. **Verify Save**
   - Check Supabase: `SELECT * FROM daily_metrics WHERE metric_date = CURRENT_DATE;`
   - Should see new row with today's data

3. **Verify Signals Generation**
   - Check browser console for `[OperationalSignals]` logs
   - Should see signals generated from daily_metrics

4. **Verify Alerts**
   - Go to `/branch/alerts`
   - Should see alerts computed from the new data

5. **Verify Health Score**
   - Go to `/branch/overview`
   - Health score should update

## Step 4: Error Handling Tests

### 4.1 Missing Data Scenarios

- [ ] Branch with no daily_metrics shows appropriate messages
- [ ] Branch with < 14 days shows "insufficient data" messages
- [ ] Branch with no alerts shows green status messages

### 4.2 Edge Cases

- [ ] Saving with only revenue (no cost) - should estimate cost
- [ ] Saving with only operational data (no finance) - should work
- [ ] Saving duplicate date - should update existing record

## Step 5: Performance Tests

### 5.1 With 40+ Days of Data

- [ ] Branch overview loads in < 2 seconds
- [ ] Trends page loads in < 3 seconds
- [ ] Alerts evaluation completes in < 1 second
- [ ] No timeout errors

### 5.2 Query Performance

**Check Supabase Dashboard → Database → Query Performance:**

- [ ] `daily_metrics` queries use indexes
- [ ] No slow queries (> 1 second)
- [ ] Indexes are being used (check query plans)

## Step 6: Browser Console Verification

### Expected Logs (No Errors)

✅ Good logs to see:
- `[DAILY_FETCH] Data coverage: ...`
- `[DailyMetricsService] Saved daily metric`
- `[OperationalSignals] Generated X signals from daily_metrics`
- `[MonitoringService] Evaluated alerts`
- `[HealthScoreService] Calculated health score`

❌ Bad logs (should NOT see):
- `column 'weekly_metrics' does not exist`
- `column 'actual_cost' does not exist`
- `column 'date' does not exist` (should be `metric_date`)
- `406 Not Acceptable` errors
- `Failed to fetch weekly_metrics`

## Step 7: Network Tab Verification

**Open DevTools → Network → Filter: "supabase"**

### Expected Queries:

✅ Good queries:
```
GET /rest/v1/daily_metrics?select=*&branch_id=eq.xxx&metric_date=gte.2025-...
POST /rest/v1/daily_metrics
```

❌ Bad queries (should NOT see):
```
GET /rest/v1/weekly_metrics
GET /rest/v1/fnb_daily_metrics
```

## Common Issues & Fixes

### Issue: "column 'cost' does not exist"
**Fix:** Migration may not have completed. Check if column exists:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'daily_metrics' AND column_name = 'cost';
```

### Issue: "column 'actual_cost' does not exist"
**Fix:** Good! This means migration worked. The column was renamed to `cost`.

### Issue: Health score shows 0 or null
**Fix:** Check if daily_metrics has data:
```sql
SELECT COUNT(*) FROM daily_metrics WHERE branch_id = 'your-branch-id';
```

### Issue: Alerts not generating
**Fix:** Check browser console for `[MonitoringService]` errors. Verify signals are being generated.

### Issue: Trends page shows "insufficient data" with 40+ days
**Fix:** Check if health score snapshots exist. The override logic should handle this, but verify:
```sql
SELECT COUNT(*) FROM health_snapshots WHERE branch_id = 'your-branch-id';
```

## Success Criteria

- [x] Migration script executed successfully
- [ ] All verification queries pass
- [ ] Daily metrics can be saved
- [ ] Daily metrics can be retrieved
- [ ] Health scores calculate correctly
- [ ] Alerts generate correctly
- [ ] Trends display correctly
- [ ] No errors in browser console
- [ ] No references to `weekly_metrics` in network requests
- [ ] All UI sections show structured explanations (no blanks)

## Next Steps After Testing

Once all tests pass:

1. **Monitor for 24-48 hours**
   - Watch for any errors in logs
   - Verify daily metrics continue to save
   - Check health scores update correctly

2. **Cleanup (after 30 days)**
   - Drop backup tables if everything is stable
   - Drop legacy `weekly_metrics` table (if not needed)

3. **Documentation**
   - Update team on new schema
   - Document any custom setup needed

---

**Status:** Ready for Testing ✅

Run through this checklist and report any issues!
