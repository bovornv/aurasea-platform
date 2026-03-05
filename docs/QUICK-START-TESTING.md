# Quick Start Testing Guide

## ✅ Prerequisites Completed
- [x] SQL migration executed (`add-branch-data-mode.sql`)
- [x] Component implemented and compiles
- [x] Branch Settings page updated

## 🚀 Quick Test (5 minutes)

### Step 1: Open Branch Settings
1. Start your dev server: `npm run dev`
2. Open browser: `http://localhost:3000`
3. Switch to **Branch View** (if not already)
4. Click **Settings** in top menu
5. Scroll to **"Scenario & Data Mode"** section

**✅ Check:** Section appears with Business Type and Data Mode dropdown

### Step 2: Test Scenario Switch
1. Select **"Healthy Scenario"** from dropdown
2. **✅ Check:** Confirmation modal appears
3. Click **"Confirm"**
4. **✅ Check:** "Processing..." message appears
5. **✅ Check:** Page reloads automatically

### Step 3: Verify Dashboard
1. After reload, check **Branch Overview** page
2. **✅ Check:** Health score shows (should be high for Healthy scenario)
3. **✅ Check:** Trends page shows 40 days of data
4. **✅ Check:** No blank sections

### Step 4: Verify Database
Run in Supabase SQL Editor:
```sql
-- Check data_mode was updated
SELECT id, name, data_mode FROM branches WHERE id = '<your-branch-id>';

-- Check 40 days generated
SELECT COUNT(*) as days, 
       MIN(metric_date) as first_date, 
       MAX(metric_date) as last_date
FROM daily_metrics 
WHERE branch_id = '<your-branch-id>';
```

**✅ Expected:**
- `data_mode = 'healthy'`
- `days = 40`
- Date range spans 40 days

### Step 5: Test Switch Back to Real Data
1. Go back to **Settings**
2. Select **"Real Data (No Simulation)"**
3. **✅ Check:** No confirmation modal (direct switch)
4. **✅ Check:** Page reloads
5. **✅ Check:** Dashboard shows empty/real data state

## 🐛 Troubleshooting

### Issue: Section doesn't appear
- **Fix:** Make sure you're in Branch View (not Company View)
- **Fix:** Check browser console for errors

### Issue: Confirmation modal doesn't appear
- **Fix:** Only appears when switching FROM Real Data TO Scenario
- **Fix:** Check browser console for JavaScript errors

### Issue: "Branch setup data not available"
- **Fix:** Branch needs setup data (rooms_available, baseline_adr, etc.)
- **Fix:** Add setup data in branch configuration

### Issue: Data not generating
- **Fix:** Check browser console for `[SCENARIO_GEN]` errors
- **Fix:** Verify Supabase connection
- **Fix:** Check branch_id is correct

## 📊 Verification Queries

Run `verify-data-mode.sql` in Supabase for comprehensive checks:
- Column structure verification
- All branches status check
- Data mode distribution
- Daily metrics count per branch

## ✅ Success Criteria

- [ ] Scenario section appears in Branch Settings
- [ ] Confirmation modal works correctly
- [ ] 40 days of data generated successfully
- [ ] Dashboard updates reflect scenario
- [ ] Database `data_mode` column updated
- [ ] Switch back to Real Data works
- [ ] No console errors

---

**Time Estimate:** 5-10 minutes for basic test
**Full Test:** Follow `TESTING-SCENARIO-SIMULATION.md` for comprehensive testing
