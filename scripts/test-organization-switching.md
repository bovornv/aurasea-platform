# Organization Switching Test Plan

## Test Steps for Todos 10-14

### Todo 10: Test Organization Switching

**Steps:**
1. Navigate to `/group/settings`
2. Locate "Developer Scenario Switch" dropdown
3. Verify dropdown shows 3 organizations:
   - Healthy Hotel Group
   - Stressed Hotel Group  
   - Crisis Hotel Group
4. Switch from current organization to a different one
5. Verify page reloads automatically
6. Check console for logs:
   - `[OrganizationContext] Organization changed to: <orgId>`
   - `[OrganizationContext] Cached state cleared - full recalculation triggered`
   - `[CacheInvalidation] Cleared X cached items`

**Expected Behavior:**
- Page reloads within 1-2 seconds
- New organization data loads
- All metrics recalculate

### Todo 11: Verify Metrics Count

**Steps:**
1. Open Debug Panel (bottom right)
2. Check "Weekly Metrics" count
3. Switch organizations and verify count updates
4. For each organization, verify:
   - Healthy Hotel Group: 30+ metrics
   - Stressed Hotel Group: 30+ metrics
   - Crisis Hotel Group: 30+ metrics

**Expected Values:**
- Each organization should show 30+ metrics loaded
- Warning should disappear when count >= 30

### Todo 12: Verify Health Scores

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

### Todo 13: Verify Alerts

**Steps:**
1. Switch to Healthy Hotel Group
2. Check Debug Panel → Active Alerts
3. Verify no `liquidity_runway` or `demand_drop` alerts
4. Switch to Stressed Hotel Group
5. Verify warning-level alerts present
6. Switch to Crisis Hotel Group
7. Verify both `liquidity_runway` AND `demand_drop` alerts present

**Expected Patterns:**
- Healthy: 0 critical alerts (may have warnings)
- Stressed: Warning-level alerts
- Crisis: Both liquidity_runway + demand_drop alerts

### Todo 14: Verify Validation Logging

**Steps:**
1. Open browser console
2. Switch between organizations
3. Check for validation logs:
   - `[ENGINE_VALIDATION_PASSED]` - when scenario matches expectations
   - `[ENGINE_VALIDATION_FAILED]` - when scenario doesn't match

**Expected Logs:**
- Healthy: `[ENGINE_VALIDATION_PASSED]` with healthScore > 80
- Stressed: `[ENGINE_VALIDATION_PASSED]` with healthScore 50-80
- Crisis: `[ENGINE_VALIDATION_PASSED]` with healthScore < 50 and both alerts

## Manual Testing Checklist

- [ ] Settings page loads with Developer Scenario Switch visible
- [ ] Dropdown shows all 3 organizations
- [ ] Switching organization triggers page reload
- [ ] Debug Panel shows correct organization after switch
- [ ] Metrics count shows 30+ for each organization
- [ ] Health scores match expected ranges
- [ ] Alerts match expected patterns
- [ ] Console shows validation logs
- [ ] Overview page updates with new organization data
- [ ] No errors in console
