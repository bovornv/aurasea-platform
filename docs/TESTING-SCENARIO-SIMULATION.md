# Testing Guide: Scenario Simulation Refactor

## ✅ Step 1: SQL Migration (COMPLETED)
- Migration executed successfully
- `data_mode` column added to `branches` table

## Step 2: Manual Testing Checklist

### 2.1 Navigate to Branch Settings
1. Open the app in browser
2. Switch to **Branch View** (if not already)
3. Navigate to **Settings** from the top menu
4. Scroll down to find **"Scenario & Data Mode"** section

**Expected Results:**
- ✅ Section appears between "Monitoring Configuration" and "User Access"
- ✅ Shows "Business Type" field (read-only, displays Accommodation/F&B/Hybrid)
- ✅ Shows "Data Mode" dropdown with 4 options:
  - Real Data (No Simulation)
  - Healthy Scenario
  - Stressed Scenario
  - Crisis Scenario
- ✅ Current selection shows "Real Data" by default

### 2.2 Test: Switch Real Data → Healthy Scenario

**Steps:**
1. Select "Healthy Scenario" from dropdown
2. **Confirmation modal should appear**
3. Verify modal message shows:
   - "Switching from Real Data to Healthy Scenario..."
   - Warning about overwriting data
4. Click **"Confirm"**
5. Wait for processing (should see "Processing..." message)
6. Page should reload automatically

**Expected Results:**
- ✅ Confirmation modal appears
- ✅ Loading state shows during generation
- ✅ Page reloads after completion
- ✅ Dashboard shows 40 days of simulated data
- ✅ Health score updates based on Healthy scenario
- ✅ Alerts reflect Healthy scenario state

**Verify in Database:**
```sql
SELECT id, name, data_mode FROM branches WHERE id = '<your-branch-id>';
-- Should show: data_mode = 'healthy'
```

**Verify Generated Data:**
```sql
SELECT COUNT(*) as days_count, 
       MIN(metric_date) as first_date, 
       MAX(metric_date) as last_date
FROM daily_metrics 
WHERE branch_id = '<your-branch-id>';
-- Should show: days_count = 40, dates span 40 days
```

### 2.3 Test: Switch Between Scenarios (Healthy → Stressed)

**Steps:**
1. Current mode should be "Healthy Scenario"
2. Select "Stressed Scenario" from dropdown
3. **Confirmation modal should appear**
4. Modal should show both scenario names
5. Click **"Confirm"**
6. Wait for processing

**Expected Results:**
- ✅ Confirmation modal appears
- ✅ Modal shows "Switching from Healthy Scenario to Stressed Scenario..."
- ✅ New 40 days generated
- ✅ Old data replaced
- ✅ Dashboard reflects Stressed scenario (lower health score, more alerts)

**Verify in Database:**
```sql
SELECT data_mode FROM branches WHERE id = '<your-branch-id>';
-- Should show: data_mode = 'stressed'
```

### 2.4 Test: Switch Scenario → Real Data

**Steps:**
1. Current mode should be "Stressed Scenario" (or any scenario)
2. Select "Real Data (No Simulation)" from dropdown
3. **No confirmation modal** (direct switch)
4. Processing should complete quickly

**Expected Results:**
- ✅ No confirmation modal (direct switch)
- ✅ All `daily_metrics` deleted for branch
- ✅ Dashboard shows empty/real data state
- ✅ `data_mode` set to `'real'`

**Verify in Database:**
```sql
-- Check data_mode
SELECT data_mode FROM branches WHERE id = '<your-branch-id>';
-- Should show: data_mode = 'real'

-- Check daily_metrics deleted
SELECT COUNT(*) FROM daily_metrics WHERE branch_id = '<your-branch-id>';
-- Should show: 0 (or only real user-entered data if any)
```

### 2.5 Test: Different Business Types

**Test Accommodation Branch:**
- Switch to Healthy Scenario
- Verify generated data includes: `revenue`, `rooms_sold`, `adr`, `cost`, `cash_balance`
- Verify occupancy calculations work

**Test F&B Branch:**
- Switch to Healthy Scenario
- Verify generated data includes: `revenue`, `customers`, `avg_ticket`, `top3MenuPct`, `cost`, `cash_balance`
- Verify revenue concentration alerts work

**Test Hybrid Branch:**
- Switch to Healthy Scenario
- Verify generated data includes both accommodation and F&B metrics
- Verify all calculations work correctly

### 2.6 Test: Error Handling

**Test Missing Branch Setup:**
1. Create a branch with no setup data (no `rooms_available`, `baseline_adr`, etc.)
2. Try to switch to a scenario
3. **Expected:** Error message should appear: "Branch setup data not available"

**Test Network Error:**
1. Disconnect internet
2. Try to switch scenario
3. **Expected:** Error message should appear with details

**Test Loading States:**
- Verify "Processing..." message appears during generation
- Verify dropdown is disabled during processing
- Verify error messages clear when retrying

### 2.7 Test: Company View Settings

**Steps:**
1. Switch to **Company View**
2. Navigate to **Settings**
3. Scroll through all sections

**Expected Results:**
- ✅ **NO** "Scenario & Data Mode" section
- ✅ Only shows Organization Switcher (dev mode) and Language selection
- ✅ Company View aggregates branch data correctly
- ✅ No scenario generation controls visible

## Step 3: Monitor Browser Console

**Open Browser DevTools Console** and check for:

### Expected Logs (Normal Operation):
```
[BranchScenario] Loading branch setup...
[SCENARIO_GEN] Generating 40 days of accommodation metrics...
[SCENARIO_GEN] Saved 40 metrics
[BranchDataMode] Updated branch data_mode to 'healthy'
```

### Error Logs (Should NOT appear):
- ❌ `[BranchScenario] Failed to load branch setup:`
- ❌ `[SCENARIO_GEN] Failed to generate scenario:`
- ❌ `[BranchDataMode] Failed to update:`
- ❌ `ReferenceError` or `TypeError`

### Warning Logs (Acceptable):
- ⚠️ `[BranchScenario] Only generated 39/40 days` (if one day fails, but should be rare)

## Step 4: Verify Dashboard Updates

After switching scenarios, verify:

1. **Branch Overview Page:**
   - Health score reflects scenario (Healthy = high, Crisis = low)
   - Alerts match scenario severity
   - Trends show 40 days of data
   - No blank sections

2. **Trends Page:**
   - Shows 40 days of trend data
   - Charts display correctly
   - No "Insufficient data" messages

3. **Alerts Page:**
   - Alerts match scenario:
     - Healthy: 0-1 alerts
     - Stressed: 2-3 alerts
     - Crisis: 4+ alerts

## Step 5: Data Integrity Checks

### Verify Generated Data Quality:
```sql
-- Check for gaps in dates
WITH date_series AS (
  SELECT generate_series(
    (SELECT MIN(metric_date) FROM daily_metrics WHERE branch_id = '<branch-id>'),
    (SELECT MAX(metric_date) FROM daily_metrics WHERE branch_id = '<branch-id>'),
    '1 day'::interval
  )::date AS expected_date
)
SELECT COUNT(*) as missing_days
FROM date_series
WHERE expected_date NOT IN (
  SELECT metric_date FROM daily_metrics WHERE branch_id = '<branch-id>'
);
-- Should return: 0 (no gaps)

-- Check required fields populated
SELECT 
  COUNT(*) as total_records,
  COUNT(revenue) as revenue_count,
  COUNT(CASE WHEN revenue > 0 THEN 1 END) as revenue_positive
FROM daily_metrics 
WHERE branch_id = '<branch-id>';
-- Should show: revenue_count = 40, revenue_positive = 40
```

## Troubleshooting

### Issue: Scenario section doesn't appear
- **Check:** Are you in Branch View (not Company View)?
- **Check:** Is the branch loaded? (check browser console)

### Issue: Confirmation modal doesn't appear
- **Check:** Are you switching from Real Data to Scenario?
- **Check:** Browser console for JavaScript errors

### Issue: Data not generating
- **Check:** Branch setup data exists (rooms_available, baseline_adr, etc.)
- **Check:** Browser console for error messages
- **Check:** Supabase connection is working

### Issue: Dashboard doesn't update
- **Check:** Page reloaded after scenario switch
- **Check:** Browser cache cleared
- **Check:** Database `data_mode` column updated

## Success Criteria

✅ All tests pass
✅ No console errors
✅ Data generates correctly (40 days)
✅ Dashboard updates reflect scenario
✅ Company View has no scenario controls
✅ Branch-specific scenario selection works
✅ Confirmation modals work correctly
✅ Error handling works gracefully

---

**Next Steps After Testing:**
- Document any issues found
- Verify production readiness
- Update user documentation if needed
