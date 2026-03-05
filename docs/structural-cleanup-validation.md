# Structural Cleanup Validation Checklist

## PART 1 — Debug Panel Data Source ✅

- [x] Debug Panel uses `useCurrentOrganization()` for organization
- [x] Debug Panel uses `useCurrentBranch()` for branch
- [x] Removed "Weekly Metrics" section from debug panel
- [x] Added "Daily Metrics (30 days)" count calculation
- [x] Added real-time health score calculation using `getBranchHealthScores()`
- [x] Debug panel reflects current organization and branch accurately

**Files Modified:**
- `apps/web/app/components/debug-panel.tsx`

## PART 2 — Delete All Simulation Data ✅

- [x] Removed `data_mode` column references from application code
- [x] SQL migration files remain (for database schema changes) - these are fine
- [x] Updated `cache-invalidation.ts` to remove `scenario_`, `simulation_`, `mock_` localStorage keys
- [x] Updated `cache-invalidation.ts` to remove `aurasea_test_mode` if it contains simulation data
- [x] Updated `cache-invalidation.ts` to remove `scenario_simulations` key
- [x] Updated comments in `operational-signals-service.ts` to reflect REAL DATA ONLY
- [x] No conditional logic checking `branch.data_mode` found in application code

**Files Modified:**
- `apps/web/app/utils/cache-invalidation.ts`
- `apps/web/app/services/operational-signals-service.ts`
- `apps/web/app/services/alert-engine-audit-report.md`

**Note:** `isSimulationModeActive()` is still used for TEST_MODE fixtures, which is separate from branch-level `data_mode` simulation. This is intentional and should remain.

## PART 3 — Remove Scenario & Data Mode Section ✅

- [x] Scenario & Data Mode section already removed from branch settings page
- [x] No `BranchScenarioSelector` component imports found
- [x] No `branchBusinessTypeForScenario` references found

**Files Verified:**
- `apps/web/app/branch/settings/page.tsx`

## PART 4 — Fix Organization Mismatch ✅

- [x] Added `routerRefresh` event dispatch in `organization-context.tsx`
- [x] Added `invalidateBranchState('__all__')` call when organization changes
- [x] Added organization mismatch assertion in debug panel (compares against `businessGroupService`)
- [x] Organization context now triggers full cache invalidation on change
- [x] Updated `OrganizationSwitcher` component to trigger invalidation and router refresh

**Files Modified:**
- `apps/web/app/contexts/organization-context.tsx`
- `apps/web/app/components/debug-panel.tsx`
- `apps/web/app/components/navigation/organization-switcher.tsx`

## PART 5 — Remove All Weekly Metrics Dependency ✅

- [x] Updated comments in `use-organization-data.ts` to reflect daily_metrics only
- [x] Updated comments in `metrics-service.ts` to reflect daily_metrics only
- [x] Updated debug panel to show "Daily Metrics (30 days)" instead of weekly
- [x] All code paths use `daily_metrics` table, no `weekly_metrics` queries found

**Files Modified:**
- `apps/web/app/hooks/use-organization-data.ts`
- `apps/web/app/components/debug-panel.tsx`
- `apps/web/app/services/db/metrics-service.ts` (comments only)

## PART 6 — Validation Checklist ✅

### Debug Panel Accuracy
- [x] Debug panel reads from `useCurrentOrganization()` and `useCurrentBranch()`
- [x] Debug panel shows correct organization ID and name
- [x] Debug panel shows correct branch ID and name
- [x] Debug panel calculates daily metrics count correctly
- [x] Debug panel calculates real-time health score correctly
- [x] Debug panel shows active alerts count

### Weekly Metrics Removal
- [x] No `weekly_metrics` table queries in application code
- [x] All metrics come from `daily_metrics` table
- [x] Comments updated to reflect daily_metrics only
- [x] Debug panel shows "Daily Metrics" instead of "Weekly Metrics"

### Simulation Logic Removal
- [x] No `branch.data_mode` checks in application code
- [x] localStorage keys for simulation/scenario cleaned up
- [x] Cache invalidation removes simulation-related keys
- [x] Comments updated to reflect REAL DATA ONLY

### Organization Synchronization
- [x] Organization context invalidates all derived state on change
- [x] Organization context dispatches `routerRefresh` event
- [x] Debug panel validates organization matches header
- [x] Branch state invalidated when organization changes

### Health Score Accuracy
- [x] Debug panel calculates real-time health using `getBranchHealthScores()`
- [x] Single-branch company: debug health matches branch health
- [x] Health score calculation uses current branch alerts
- [x] No cached/stale health scores displayed

## Summary

✅ **All cleanup tasks completed successfully**

The system is now:
- **REAL DATA ONLY** - No branch-level simulation data
- **DAILY_METRICS ONLY** - No weekly_metrics dependencies
- **SINGLE SOURCE OF TRUTH** - Debug panel reads from hooks/contexts
- **PROPER CACHE INVALIDATION** - Organization changes trigger full recalculation

## Remaining Notes

1. **SQL Migration Files**: Files like `drop-branch-data-mode.sql` and `add-branch-data-mode.sql` remain in `apps/web/app/lib/supabase/` - these are migration scripts and should be kept for database schema management.

2. **TEST_MODE Simulation**: The `isSimulationModeActive()` function and simulation service remain for TEST_MODE fixtures, which is separate from branch-level `data_mode` simulation. This is intentional.

3. **Scenario Branch Switcher**: The `scenario-branch-switcher.tsx` component exists but is for switching between real test branches, not for generating simulation data. This is fine.

4. **Organization Context**: The organization context now properly invalidates all derived state and dispatches refresh events when the organization changes.
