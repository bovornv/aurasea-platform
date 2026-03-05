# Branch View Settings Page - Fix Validation

## Summary

All fixes for the Branch View → Settings page have been completed and validated.

## PART 1 — Monitoring Configuration Section ✅

### 1️⃣ Monitoring Status (Active / Inactive) ✅
**File:** `apps/web/app/branch/settings/page.tsx` (lines 311-387)

**Implementation:**
- Toggle updates `branches.monitoring_enabled` in database immediately
- When toggled ON:
  - Calls `invalidateBranchState(branch.id)`
  - Clears operational signals cache
  - Triggers `monitoringService.evaluate()` to recalculate health and refresh alerts
  - Dispatches `metricsUpdated` and `forceRecalculation` events
- When toggled OFF:
  - Calls `invalidateBranchState(branch.id)`
  - Clears all alert-related localStorage cache for the branch
  - Clears operational signals cache
  - Dispatches `alertsCleared` and `metricsUpdated` events

**Monitoring Service Integration:**
- File: `apps/web/app/services/monitoring-service.ts` (lines 578-612)
- Added check for `monitoring_enabled` before evaluation
- Returns empty alerts array if monitoring is disabled for the branch

**Validation:**
- ✅ Toggle updates DB immediately
- ✅ Triggers recalculation when ON
- ✅ Stops alert engine when OFF
- ✅ No alerts generated when monitoring disabled

### 2️⃣ Last Updated Timestamp ✅
**File:** `apps/web/app/services/db/branch-metrics-info-service.ts` (lines 13-76)

**Implementation:**
- Queries `MAX(metric_date)` from both `daily_metrics` and `fnb_daily_metrics`
- Returns the latest date across both tables
- Handles deprecated `fnb_daily_metrics` table gracefully (catches errors)

**Validation:**
- ✅ Reflects latest metric_date from both tables
- ✅ Does not show stale timestamp
- ✅ Handles missing tables gracefully

### 3️⃣ Data Freshness Requirement ✅
**File:** `apps/web/app/services/db/branch-metrics-info-service.ts` (lines 82-148)

**Implementation:**
- Calculates `coverageDays = COUNT(DISTINCT metric_date)` in last 30 days
- Queries both `daily_metrics` and `fnb_daily_metrics`
- Combines dates from both tables and counts distinct values
- Status colors:
  - 0 days: Red (#ef4444)
  - 1-6 days: Warning (#f59e0b)
  - ≥7 days: Green (#10b981)

**Validation:**
- ✅ Calculates from both tables
- ✅ Shows correct status colors
- ✅ Not hardcoded (uses actual data)

### 4️⃣ Alert Sensitivity Level Dropdown ✅
**File:** `apps/web/app/branch/settings/page.tsx` (lines 389-434)

**Implementation:**
- Dropdown options: Low, Medium, High
- Updates `branches.alert_sensitivity` in database
- Triggers recalculation with new sensitivity

**Alert Engine Integration:**
- File: `apps/web/app/services/monitoring-service.ts` (lines 856-857, 1867)
- Fetches `alert_sensitivity` from branch settings
- Passes to `translateToSMEOS(hospitalityData, alertSensitivity)`
- File: `apps/web/app/adapters/hospitality-adapter.ts` (lines 71-144)
- Includes `alertSensitivity` in `businessContext.alertSensitivity`
- File: `core/sme-os/engine/rules/cost-pressure.ts` (lines 73-74)
- Alert rules read `input?.businessContext?.alertSensitivity`
- File: `core/sme-os/config/threshold-profiles.ts` (lines 125-153)
- `getThresholds()` applies sensitivity adjustment:
  - Low: +10% threshold tolerance (multiply by 1.1)
  - High: -10% threshold tolerance (multiply by 0.9)
  - Medium: No adjustment (default thresholds)

**Validation:**
- ✅ Dropdown updates DB
- ✅ Sensitivity affects alert thresholds
- ✅ Low = +10% tolerance, High = -10% tolerance
- ✅ Medium = default thresholds

## PART 2 — Hide Branch ID ✅

**Validation:**
- ✅ Branch ID not displayed in settings page UI
- ✅ Only used internally for API calls
- ✅ No console logging of Branch ID
- ✅ Database field remains intact (not deleted)

## PART 3 — Scenario & Data Mode Section ✅

**File:** `apps/web/app/components/branch-scenario-selector.tsx`

### Dropdown Options ✅
- Real Data (No Simulation)
- Healthy Scenario
- Stressed Scenario
- Crisis Scenario

### Behavior Validation ✅

**Real Data:**
- Sets `branches.data_mode = 'real'`
- Calls `switchToRealData(branchId)` to delete simulated data
- Clears simulation flags
- Triggers refresh

**Scenarios (Healthy/Stressed/Crisis):**
- Sets `branches.data_mode` accordingly
- Generates 40 days of data using `generateBranchScenario()`
- Uses correct generator based on `branchBusinessType` (accommodation/fnb/hybrid)
- Overwrites only that branch's data
- Triggers recalculation

**Confirmation Modal:**
- Shows when switching away from Real Data
- Message: "This will overwrite existing daily data for this branch. Continue?"
- Requires confirmation before proceeding

**Prevent Double Generation:**
- File: `apps/web/app/components/branch-scenario-selector.tsx` (lines 167-170)
- Checks: `if (currentDataMode === newMode) return;`
- Does nothing if selected mode equals current mode

**After Mode Change:**
- Calls `invalidateBranchState(branchId)`
- Calls `operationalSignalsService.clearCache()`
- Clears alerts cache from localStorage
- Dispatches events: `metricsUpdated`, `forceRecalculation`, `scenarioSwitched`, `alertsCleared`
- Calls `router.refresh()` (no full page reload)

**Validation:**
- ✅ All 4 dropdown options work
- ✅ Confirmation modal shows correctly
- ✅ No duplicate generation
- ✅ Proper cache clearing
- ✅ No full page reload

## PART 4 — Validation Checklist ✅

- ✅ Monitoring toggle updates DB
- ✅ Sensitivity level affects alert thresholds
- ✅ Last updated reflects real data (from both tables)
- ✅ Data coverage calculates correctly (from both tables)
- ✅ Branch ID hidden from UI
- ✅ Scenario dropdown works for all 4 options
- ✅ No duplicate generation
- ✅ No console errors
- ✅ No weekly_metrics dependency

## Files Modified

1. `apps/web/app/branch/settings/page.tsx` - Monitoring toggle, sensitivity dropdown
2. `apps/web/app/services/monitoring-service.ts` - Alert sensitivity integration, monitoring_enabled check
3. `apps/web/app/services/db/branch-metrics-info-service.ts` - Last updated and coverage from both tables
4. `apps/web/app/components/branch-scenario-selector.tsx` - Already implemented correctly
5. `apps/web/app/adapters/hospitality-adapter.ts` - Alert sensitivity in businessContext
6. `core/sme-os/config/threshold-profiles.ts` - Sensitivity adjustment logic
7. `core/sme-os/engine/rules/cost-pressure.ts` - Uses alert sensitivity (example)

## Notes

- All functionality is working as specified
- No layout changes made (only logic fixes)
- User Access section was not modified
- Alert formulas remain unchanged (only threshold values adjusted)
- No weekly_metrics dependency found
