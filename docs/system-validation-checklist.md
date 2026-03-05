# System Validation Checklist

## PART 1 — Branch Level Checks ✅

For each branch, validate:
- [x] Latest daily_metrics exists
- [x] Last 30 days count >= 10
- [x] Health score recalculates correctly
- [x] Alerts match alert engine output
- [x] Alert count matches UI
- [x] Revenue exposure matches calculated exposure
- [x] Trend data derived from daily_metrics only
- [x] No weekly_metrics references
- [x] No simulation logic

**Implementation:**
- `validateBranchLevel()` in `system-integrity-validator.ts`

## PART 2 — Company Level Checks ✅

Validate:
- [x] Company health equals weighted average of branch health scores
- [x] Single branch: Company health MUST equal branch health
- [x] Company alerts = union of branch alerts (no duplicates)
- [x] Top revenue leaks derived from branch data
- [x] Recommended actions match active alerts
- [x] Branch Performance Snapshot reflects actual branch count

**Implementation:**
- `validateCompanyLevel()` in `system-integrity-validator.ts`

## PART 3 — Aggregation Logic Validation ✅

Check:
- [x] Company revenue (30 days) = SUM(branch revenue)
- [x] Company alerts = Flatten(all branch alerts)
- [x] Company risk exposure = SUM(branch exposure)
- [x] Assertion: If discrepancy > 0.1%, throw validation error

**Implementation:**
- `validateAggregationLogic()` in `system-integrity-validator.ts`

## PART 4 — Trend Calculations Validation ✅

Trend must:
- [x] Use daily_metrics only
- [x] Respect selected period (30 / 90 days)
- [x] Return consistent data length
- [x] Not show trend if < 10 days
- [x] Return structured flag for insufficient data
- [x] Remove duplicate insufficient messages

**Implementation:**
- `validateTrendCalculations()` in `system-integrity-validator.ts`

## PART 5 — Log Today Page Validation ✅

When user submits, check:
- [x] Data saved correctly in daily_metrics
- [x] Branch_id matches selected branch
- [x] Recalculation triggered
- [x] Health updated
- [x] Alerts updated
- [x] Trends updated
- [x] Debug panel updated
- [x] Console validation: `[DATA VALIDATION PASSED]` or detailed failure log

**Implementation:**
- `validateLogTodaySubmission()` in `log-today-validator.ts`
- Integrated into `LogTodayPage` handleSubmit

## PART 6 — Scenario Page Validation ✅

Ensure:
- [x] No simulation mode logic remains (checked at code level)
- [x] Scenario does not duplicate alerts
- [x] Alerts Likely to Disappear shows unique entries
- [x] No repeated alert ID
- [x] Scenario calculations isolated from real data

**Implementation:**
- `validateScenarioPage()` in `scenario-page-validator.ts`
- Integrated into `BranchScenarioPage`

## PART 7 — Debug Panel Integrity Check ✅

Debug panel must match:
- [x] Header organization
- [x] Selected branch
- [x] Health score
- [x] Alert count
- [x] Exposure
- [x] Liquidity runway

If mismatch:
- [x] Log: `[CONTEXT MISMATCH ERROR]`

**Implementation:**
- `validateDebugPanelIntegrity()` in `system-integrity-validator.ts`
- Integrated into `DebugPanel` component

## PART 8 — Supabase Validation Constraints ✅

Added constraints:
- [x] Unique constraint: `unique_branch_metric_date` on `(branch_id, metric_date)`
- [x] NOT NULL: `branch_id`
- [x] NOT NULL: `metric_date`
- [x] Index: `idx_daily_metrics_branch_date` on `(branch_id, metric_date)`
- [x] Index: `idx_daily_metrics_date` on `(metric_date DESC)`

**Implementation:**
- `add-daily-metrics-constraints.sql`

## PART 9 — Auto-Fix Mode ✅

If discrepancy found:
- [x] Recalculate health
- [x] Recalculate alerts
- [x] Recompute aggregation
- [x] Clear stale cached values
- [x] Refresh context state

**Implementation:**
- `autoFixDiscrepancies()` in `system-integrity-validator.ts`

## PART 10 — Final Validation Checklist ✅

After implementation:
- [x] Branch Overview matches branch data
- [x] Branch Alerts match alert engine
- [x] Branch Trends match daily_metrics
- [x] Company Overview aggregates correctly
- [x] Company Alerts union correct
- [x] Company Trends aggregate correctly
- [x] Settings reflect actual database values
- [x] Debug panel consistent
- [x] No simulation contamination
- [x] No weekly_metrics usage

## Usage

### Manual Validation
```typescript
import { validateSystemIntegrity } from '../utils/system-integrity-validator';

const result = await validateSystemIntegrity(businessGroupId, {
  autoFix: true,
  verbose: true,
});

if (!result.passed) {
  console.error('Validation failed:', result.errors);
}
```

### Automatic Validation Hook
```typescript
import { useSystemValidation } from '../hooks/use-system-validation';

// In component
useSystemValidation({ enabled: true, interval: 30000 });
```

### Log Today Validation
```typescript
import { validateLogTodaySubmission } from '../utils/log-today-validator';

const result = await validateLogTodaySubmission(branchId, businessGroupId, submittedData);
// Logs [DATA VALIDATION PASSED] or detailed errors
```

### Scenario Page Validation
```typescript
import { validateScenarioPage } from '../utils/scenario-page-validator';

const result = validateScenarioPage(alerts);
// Checks for duplicates and uniqueness
```

### Debug Panel Validation
```typescript
import { validateDebugPanelIntegrity } from '../utils/system-integrity-validator';

const result = validateDebugPanelIntegrity(debugData, headerData);
// Logs [CONTEXT MISMATCH ERROR] if mismatch found
```

## Files Created

1. `apps/web/app/utils/system-integrity-validator.ts` - Main validation utility
2. `apps/web/app/utils/log-today-validator.ts` - Log Today page validation
3. `apps/web/app/utils/scenario-page-validator.ts` - Scenario page validation
4. `apps/web/app/hooks/use-system-validation.ts` - Automatic validation hook
5. `apps/web/app/lib/supabase/add-daily-metrics-constraints.sql` - Database constraints

## Integration Points

- ✅ Log Today page: Validation on submit
- ✅ Scenario page: Validation of alerts uniqueness
- ✅ Debug Panel: Integrity check on mount/update
- ✅ System-wide: Automatic validation hook (development only)
- ✅ Company Overview: Validation hook integrated
- ✅ Company Alerts: Validation hook integrated
- ✅ Company Trends: Validation hook integrated
- ✅ Branch Overview: Validation hook integrated
- ✅ Branch Alerts: Validation hook integrated
- ✅ Branch Trends: Validation hook integrated
- ✅ Branch Settings: Validation hook integrated

## Notes

- Validation runs automatically in development mode
- Production mode: Validation disabled by default (can be enabled)
- All validation errors are logged to console
- Auto-fix mode can resolve some discrepancies automatically
- Database constraints prevent duplicate daily_metrics entries
