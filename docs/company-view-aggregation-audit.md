# Company View Aggregation Logic Audit

## Summary

All 10 parts of the Company View aggregation audit have been completed. This document summarizes the fixes and validations implemented.

## PART 1 — Company Health Overview ✅

**Fixed:** Revenue-weighted health score calculation

**Implementation:**
- File: `core/calculate-company-score.ts`
- Formula: `weightedHealth = sum(branch.healthScore * branch.last30Revenue) / totalRevenue`
- Fallback: If `totalRevenue = 0`, use simple average
- Single branch: Company score equals branch score exactly
- Guards: No NaN, no division by zero

**Validation:**
- ✅ Company score matches revenue-weighted calculation
- ✅ 1-branch company matches branch exactly
- ✅ No NaN in calculations
- ✅ No division by zero

## PART 2 — Critical Alerts Snapshot (Company) ✅

**Fixed:** Deduplication by `code + branchId`

**Implementation:**
- File: `apps/web/app/components/alerts/critical-alerts-snapshot.tsx`
- Deduplication: `const uniqueAlerts = Array.from(new Map(allAlerts.map(a => [a.code + a.branchId, a])).values());`
- Rules: Do NOT merge alerts from different branches
- Includes: BranchId reference, severity, impact
- Sorting: By financial impact descending

**Validation:**
- ✅ No duplicate alerts
- ✅ BranchId reference included
- ✅ Sorted by financial impact

## PART 3 — Current Company Risks ✅

**Fixed:** Revenue exposure calculation and risk tier

**Implementation:**
- File: `apps/web/app/components/portfolio/portfolio-alert-summary.tsx`
- Calculation:
  - `revenueExposed = sum(alert.revenueImpact)`
  - `riskRatio = revenueExposed / totalCompanyRevenue`
  - Tier: <10% → Low, 10–25% → Moderate, ≥25% → High
- Shows: Number of branches with risk, % revenue exposed, critical alert count, risk tier
- Guard: If `totalCompanyRevenue = 0` → show "Insufficient Data"

**Validation:**
- ✅ Risk tier calculated correctly
- ✅ Revenue exposure calculated correctly
- ✅ Shows "Insufficient Data" when needed

## PART 4 — Top 3 Revenue Leaks (Company Level) ✅

**Fixed:** Combine all branch leaks, sort globally

**Implementation:**
- File: `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx`
- Rules:
  - Combine all branch revenue leaks
  - Sort by `revenueImpact` descending
  - Return top 3 globally
  - No duplicate alert types per branch (`code + branchId`)
  - No 0-impact leaks
  - Rolling 30-day calculation only

**Validation:**
- ✅ Revenue leaks sorted correctly
- ✅ No duplicates per branch
- ✅ No 0-impact leaks

## PART 5 — Recommended Actions (Company) ✅

**Fixed:** Top 3 highest impact alerts

**Implementation:**
- File: `apps/web/app/components/portfolio/portfolio-recommended-actions.tsx`
- Logic:
  - Collect top 3 highest impact alerts across branches
  - Generate: Action summary, Branch reference, Estimated improvement
  - No duplicates
  - Not empty if alerts exist
  - If no alerts: Show "All branches stable."

**Validation:**
- ✅ No duplicates
- ✅ Not empty if alerts exist
- ✅ Shows "All branches stable." when appropriate

## PART 6 — Branch Performance Snapshot ✅

**Validated:** Per-branch display

**Implementation:**
- File: `apps/web/app/components/portfolio/portfolio-branch-table.tsx`
- Displays per branch:
  - Health Score
  - Revenue (30 days) - matches branch-level rolling calculation
  - Margin
  - Risk level (Low/Moderate/High)
  - Trend direction (up/down/stable)

**Validation:**
- ✅ Trend arrow correct
- ✅ Revenue matches branch-level rolling calculation
- ✅ No stale data
- ✅ No mismatch with branch overview

## PART 7 — Company Trends Page ✅

**Fixed:** Revenue-weighted daily aggregation

**Implementation:**
- File: `core/sme-os/engine/services/health-score-trend-service.ts`
- File: `apps/web/app/components/portfolio/portfolio-health-overview.tsx`
- Rules:
  - Aggregate daily branch health scores weighted by revenue
  - Use rolling daily aggregation, not static snapshots
  - Handle missing branch days gracefully
  - Same last-point value as Company Health Score card
  - If 1 branch only: Graph matches branch graph exactly

**Validation:**
- ✅ Trends graph matches final card score
- ✅ Single branch graph matches branch graph exactly
- ✅ Revenue-weighted aggregation working

## PART 8 — Data Mode Awareness ✅

**Fixed:** Handle mixed modes

**Implementation:**
- File: `apps/web/app/group/overview/page.tsx`
- Detection: Check data modes across branches
- Warning: Show "Mixed data modes across branches." if real + simulated
- Behavior: Do not crash, aggregate both modes

**Validation:**
- ✅ Mixed modes detected
- ✅ Warning displayed
- ✅ No crashes

## PART 9 — Numerical Stability ✅

**Fixed:** NaN/Infinity guards

**Implementation:**
- Added guards throughout:
  - `if (!isFinite(value) || isNaN(value)) return 0;`
  - Division by zero checks
  - Safe number utilities

**Files Updated:**
- `core/calculate-company-score.ts`
- `apps/web/app/services/group-aggregation-service.ts`
- `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx`
- `apps/web/app/components/portfolio/portfolio-recommended-actions.tsx`
- `apps/web/app/components/portfolio/portfolio-alert-summary.tsx`
- `core/sme-os/engine/services/health-score-trend-service.ts`

**Validation:**
- ✅ No NaN propagation
- ✅ No Infinity
- ✅ No division by zero

## PART 10 — Validation Checklist ✅

**All Validations Pass:**

- ✅ Company score matches revenue-weighted calculation
- ✅ 1-branch company matches branch exactly
- ✅ No duplicate alerts
- ✅ Revenue leaks sorted correctly
- ✅ Trends graph matches final card score
- ✅ Risk tier calculated correctly
- ✅ No blank sections
- ✅ No NaN in console
- ✅ No division by zero errors
- ✅ Single branch graph matches branch graph exactly

## Files Modified

1. `core/calculate-company-score.ts` - PART 1, PART 9
2. `apps/web/app/components/alerts/critical-alerts-snapshot.tsx` - PART 2
3. `apps/web/app/components/portfolio/portfolio-alert-summary.tsx` - PART 3, PART 9
4. `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx` - PART 4, PART 9
5. `apps/web/app/components/portfolio/portfolio-recommended-actions.tsx` - PART 5, PART 9
6. `apps/web/app/components/portfolio/portfolio-branch-table.tsx` - PART 6 (validated)
7. `apps/web/app/components/portfolio/portfolio-health-overview.tsx` - PART 7 (validated)
8. `apps/web/app/services/group-aggregation-service.ts` - PART 1, PART 2, PART 4, PART 9
9. `apps/web/app/group/overview/page.tsx` - PART 3, PART 8 (validated)
10. `core/sme-os/engine/services/health-score-trend-service.ts` - PART 7, PART 9 (validated)

## Notes

- All aggregation math uses revenue-weighted calculations
- All deduplication uses `code + branchId` to preserve branch separation
- All calculations include numerical stability guards
- Single branch companies correctly match branch-level data
- Mixed data modes are detected and handled gracefully
