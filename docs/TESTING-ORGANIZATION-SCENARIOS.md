# Organization Scenario Testing - Verification Results

## ✅ Database Verification (Automated)

**Status:** PASSED

**Results:**
- ✅ 3 organizations found: Healthy Hotel Group, Stressed Hotel Group, Crisis Hotel Group
- ✅ Each organization has exactly 1 branch
- ✅ Each branch has 30 weekly metrics
- ✅ Total: 90 metrics across all branches
- ✅ Date range: 2025-07-28 to 2026-02-16

**Run verification:**
```bash
npx ts-node --project scripts/tsconfig.json scripts/verify-organization-scenarios.ts
```

## 📋 Manual Testing Checklist (Todos 10-14)

### Todo 10: Test Organization Switching ✅ READY

**Steps:**
1. Navigate to `http://localhost:3000/group/settings`
2. Find "Developer Scenario Switch" dropdown (dev mode only)
3. Verify dropdown shows 3 organizations
4. Switch from current organization to a different one
5. Verify page reloads automatically
6. Check browser console for logs:
   - `[OrganizationContext] Organization changed to: <orgId>`
   - `[CacheInvalidation] Cleared X cached items`

**Expected:**
- Page reloads within 1-2 seconds
- New organization data loads
- All metrics recalculate

### Todo 11: Verify Metrics Count ✅ READY

**Steps:**
1. Open Debug Panel (bottom right corner)
2. Check "Weekly Metrics" count
3. Switch organizations and verify count updates
4. For each organization, verify 30+ metrics loaded

**Expected Values:**
- Healthy Hotel Group: 30 metrics ✅
- Stressed Hotel Group: 30 metrics ✅
- Crisis Hotel Group: 30 metrics ✅
- Warning should NOT appear (count >= 30)

### Todo 12: Verify Health Scores ✅ READY

**Steps:**
1. Switch to Healthy Hotel Group
2. Check Debug Panel → Latest Health Score
3. Verify score > 80
4. Switch to Stressed Hotel Group
5. Verify score is between 50-80
6. Switch to Crisis Hotel Group
7. Verify score < 50

**Expected Values:**
- Healthy: > 80
- Stressed: 50-80
- Crisis: < 50

**Validation:**
- Check console for `[ENGINE_VALIDATION_PASSED]` or `[ENGINE_VALIDATION_FAILED]`
- Debug Panel shows validation status

### Todo 13: Verify Alerts ✅ READY

**Steps:**
1. Switch to Healthy Hotel Group
2. Check Debug Panel → Active Alerts
3. Verify NO `liquidity_runway` or `demand_drop` alerts
4. Switch to Stressed Hotel Group
5. Verify warning-level alerts present
6. Switch to Crisis Hotel Group
7. Verify BOTH `liquidity_runway` AND `demand_drop` alerts present

**Expected Patterns:**
- Healthy: 0 critical alerts (may have warnings)
- Stressed: Warning-level alerts
- Crisis: Both liquidity_runway + demand_drop alerts

### Todo 14: Verify Validation Logging ✅ READY

**Steps:**
1. Open browser console (F12)
2. Switch between organizations
3. Check for validation logs:
   - `[ENGINE_VALIDATION_PASSED]` - when scenario matches expectations
   - `[ENGINE_VALIDATION_FAILED]` - when scenario doesn't match

**Expected Logs:**
- Healthy: `[ENGINE_VALIDATION_PASSED]` with healthScore > 80, no critical alerts
- Stressed: `[ENGINE_VALIDATION_PASSED]` with healthScore 50-80, warnings present
- Crisis: `[ENGINE_VALIDATION_PASSED]` with healthScore < 50, both alerts present

## 🎯 Quick Test Flow

1. **Navigate to Settings:**
   ```
   http://localhost:3000/group/settings
   ```

2. **Open Debug Panel:**
   - Click "🐛 Debug Panel" button (bottom right)
   - Note current organization and metrics count

3. **Test Healthy Scenario:**
   - Select "Healthy Hotel Group" from dropdown
   - Wait for reload
   - Check Debug Panel: Health score > 80, no critical alerts
   - Check console: `[ENGINE_VALIDATION_PASSED]`

4. **Test Stressed Scenario:**
   - Select "Stressed Hotel Group" from dropdown
   - Wait for reload
   - Check Debug Panel: Health score 50-80, warnings present
   - Check console: `[ENGINE_VALIDATION_PASSED]`

5. **Test Crisis Scenario:**
   - Select "Crisis Hotel Group" from dropdown
   - Wait for reload
   - Check Debug Panel: Health score < 50, both alerts present
   - Check console: `[ENGINE_VALIDATION_PASSED]`

## 🔍 Troubleshooting

**If metrics count shows < 30:**
- Check browser console for errors
- Verify Supabase connection
- Run: `npm run seed:real-test` to reseed data

**If health scores don't match:**
- Check Debug Panel for actual values
- Review console logs for calculation errors
- Verify metrics are loading correctly

**If alerts don't match:**
- Check alert evaluation logic
- Verify metrics data quality
- Review console for alert generation errors

## 📊 Expected Results Summary

| Organization | Health Score | Alerts | Revenue Exposure | Metrics |
|-------------|--------------|--------|------------------|---------|
| Healthy Hotel Group | > 80 | None critical | < 10,000 THB | 30+ |
| Stressed Hotel Group | 50-80 | Warnings | > 10,000 THB | 30+ |
| Crisis Hotel Group | < 50 | Both critical | > 50,000 THB | 30+ |
