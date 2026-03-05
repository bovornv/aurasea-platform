# System Validation Implementation Summary

## Overview
Comprehensive validation layer has been implemented to ensure data integrity across Company and Branch Views. All validation runs automatically in development mode and can be triggered manually in production.

## Implementation Status: ✅ COMPLETE

### Core Validation Utilities

1. **`apps/web/app/utils/system-integrity-validator.ts`**
   - `validateSystemIntegrity()` - Orchestrates all validation checks
   - `validateBranchLevel()` - Validates branch-level calculations
   - `validateCompanyLevel()` - Validates company-level aggregation
   - `validateAggregationLogic()` - Ensures aggregation math is correct
   - `validateTrendCalculations()` - Validates trend derivation
   - `validateDebugPanelIntegrity()` - Ensures debug panel matches header
   - `autoFixDiscrepancies()` - Auto-corrects common issues

2. **`apps/web/app/utils/log-today-validator.ts`**
   - `validateLogTodaySubmission()` - Validates data submission and recalculation

3. **`apps/web/app/utils/scenario-page-validator.ts`**
   - `validateScenarioPage()` - Ensures scenario calculations are isolated

4. **`apps/web/app/hooks/use-system-validation.ts`**
   - React hook for automatic background validation
   - Runs every 60 seconds in development mode
   - Performs debug panel integrity checks

### Integration Points

All major pages now include automatic validation:

#### Company View Pages
- ✅ **Overview** (`apps/web/app/group/overview/page.tsx`)
  - Validates company health aggregation
  - Validates alert deduplication
  - Validates revenue exposure calculation

- ✅ **Alerts** (`apps/web/app/group/alerts/page.tsx`)
  - Validates cross-vertical alert detection
  - Validates alert union logic

- ✅ **Trends** (`apps/web/app/group/trends/page.tsx`)
  - Validates trend aggregation from branch data
  - Validates revenue-weighted health scores

#### Branch View Pages
- ✅ **Overview** (`apps/web/app/branch/overview/page.tsx`)
  - Validates branch health calculation
  - Validates alert consistency
  - Validates trend derivation

- ✅ **Alerts** (`apps/web/app/branch/alerts/page.tsx`)
  - Validates alert deduplication
  - Validates alert filtering by branch

- ✅ **Trends** (`apps/web/app/branch/trends/page.tsx`)
  - Validates trend data from daily_metrics
  - Validates data length consistency

- ✅ **Settings** (`apps/web/app/branch/settings/page.tsx`)
  - Validates settings persistence
  - Validates monitoring status

- ✅ **Log Today** (`apps/web/app/branch/log-today/page.tsx`)
  - Validates data submission
  - Validates recalculation triggers

- ✅ **Scenario** (`apps/web/app/branch/scenario/page.tsx`)
  - Validates alert uniqueness
  - Validates simulation isolation

### Validation Checks Performed

#### Branch Level
- ✅ Latest daily_metrics exists
- ✅ Last 30 days count >= 10
- ✅ Health score recalculates correctly
- ✅ Alerts match alert engine output
- ✅ Alert count matches UI
- ✅ Revenue exposure matches calculated exposure
- ✅ Trend data derived from daily_metrics only
- ✅ No weekly_metrics references
- ✅ No simulation logic contamination

#### Company Level
- ✅ Company health equals weighted average of branch health scores
- ✅ Single branch: Company health MUST equal branch health
- ✅ Company alerts = union of branch alerts (no duplicates)
- ✅ Top revenue leaks derived from branch data
- ✅ Recommended actions match active alerts
- ✅ Branch Performance Snapshot reflects actual branch count

#### Aggregation Logic
- ✅ Company revenue (30 days) = SUM(branch revenue) ± 0.1%
- ✅ Company alerts = Flatten(all branch alerts)
- ✅ Company risk exposure = SUM(branch exposure) ± 0.1%

#### Trend Calculations
- ✅ Uses daily_metrics only
- ✅ Respects selected period (30 / 90 days)
- ✅ Returns consistent data length
- ✅ Shows "insufficient data" if < 10 days
- ✅ Structured flag format: `{ insufficient: true, reason: "..." }`

#### Debug Panel Integrity
- ✅ Organization matches header
- ✅ Branch matches selected branch
- ✅ Health score matches Overview
- ✅ Alert count matches Alerts page
- ✅ Revenue exposure matches calculated exposure

### Database Constraints

SQL script created: `apps/web/app/lib/supabase/add-daily-metrics-constraints.sql`

Adds:
- ✅ UNIQUE constraint on `(branch_id, metric_date)`
- ✅ NOT NULL constraints on `branch_id` and `metric_date`
- ✅ Index for performance: `idx_daily_metrics_branch_date`

### Auto-Fix Capabilities

When discrepancies are detected, the system can:
- ✅ Recalculate health scores
- ✅ Recalculate alerts
- ✅ Recompute aggregation
- ✅ Clear stale cached values
- ✅ Refresh context state

### Usage

#### Development Mode (Automatic)
Validation runs automatically every 60 seconds on all pages with the `useSystemValidation` hook.

#### Manual Trigger
```typescript
import { validateSystemIntegrity } from '@/app/utils/system-integrity-validator';

const result = await validateSystemIntegrity();
if (!result.passed) {
  console.error('Validation failed:', result.errors);
}
```

#### Debug Panel Integrity Check
Runs automatically when debug panel mounts/updates. Logs `[CONTEXT MISMATCH ERROR]` if discrepancies found.

### Console Output

All validation results are logged to console with prefixes:
- `[SYSTEM VALIDATION]` - General validation messages
- `[CONTEXT MISMATCH ERROR]` - Debug panel integrity failures
- `[DATA VALIDATION PASSED]` - Log Today submission validation
- `[SCENARIO VALIDATION]` - Scenario page validation

### Next Steps

1. **Production Monitoring**: Consider adding telemetry/logging for validation failures in production
2. **Performance**: Monitor validation overhead (currently runs every 60s in dev)
3. **Alerting**: Consider alerting on persistent validation failures
4. **Metrics**: Track validation pass/fail rates over time

### Files Modified

- `apps/web/app/utils/system-integrity-validator.ts` (NEW)
- `apps/web/app/utils/log-today-validator.ts` (NEW)
- `apps/web/app/utils/scenario-page-validator.ts` (NEW)
- `apps/web/app/hooks/use-system-validation.ts` (NEW)
- `apps/web/app/lib/supabase/add-daily-metrics-constraints.sql` (NEW)
- `apps/web/app/components/debug-panel.tsx` (UPDATED - integrity check)
- `apps/web/app/group/overview/page.tsx` (UPDATED - validation hook)
- `apps/web/app/group/alerts/page.tsx` (UPDATED - validation hook)
- `apps/web/app/group/trends/page.tsx` (UPDATED - validation hook)
- `apps/web/app/branch/overview/page.tsx` (UPDATED - validation hook)
- `apps/web/app/branch/alerts/page.tsx` (UPDATED - validation hook)
- `apps/web/app/branch/trends/page.tsx` (UPDATED - validation hook)
- `apps/web/app/branch/settings/page.tsx` (UPDATED - validation hook)
- `apps/web/app/branch/log-today/page.tsx` (UPDATED - submission validation)
- `apps/web/app/branch/scenario/page.tsx` (UPDATED - scenario validation)
- `docs/system-validation-checklist.md` (UPDATED - integration points)

---

**Status**: All validation tasks completed. System is ready for production use with comprehensive integrity checks.
