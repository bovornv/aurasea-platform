# Company View Aggregation Validation Checklist

## PART 10 — Validation Checklist

After implementation, verify all requirements:

### ✅ Company score matches revenue-weighted calculation
**File:** `core/calculate-company-score.ts`
- Formula: `weightedHealth = sum(branch.healthScore * branch.last30Revenue) / totalRevenue`
- Verified: Uses `last30Revenue` (preferred) or `revenue` (fallback)
- Verified: Falls back to simple average if `totalRevenue = 0`
- Verified: Guards against NaN/Infinity

### ✅ 1-branch company matches branch exactly
**File:** `core/calculate-company-score.ts` (line 68-75)
- Verified: Single branch check returns branch score directly
- Verified: No aggregation performed for single branch
- Verified: Exact match guaranteed

### ✅ No duplicate alerts
**Files:** 
- `apps/web/app/components/alerts/critical-alerts-snapshot.tsx` (PART 2)
- `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx` (PART 4)
- `apps/web/app/components/portfolio/portfolio-recommended-actions.tsx` (PART 5)
- Verified: Deduplication by `code + branchId` (keeps separate alerts per branch)
- Verified: No merging of alerts from different branches

### ✅ Revenue leaks sorted correctly
**File:** `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx`
- Verified: Sorted by `revenueImpact` descending
- Verified: Top 3 globally across all branches
- Verified: No duplicate alert types per branch
- Verified: No 0-impact leaks included

### ✅ Trends graph matches final card score
**Files:**
- `apps/web/app/components/portfolio/portfolio-health-overview.tsx` (lines 86-104, 189-220)
- `core/sme-os/engine/services/health-score-trend-service.ts` (PART 7)
- Verified: Last snapshot updated to match card score
- Verified: `endScore` matches last snapshot score
- Verified: Validation logging in development mode

### ✅ Risk tier calculated correctly
**File:** `apps/web/app/components/portfolio/portfolio-alert-summary.tsx`
- Verified: `revenueExposed = sum(alert.revenueImpact)`
- Verified: `riskRatio = revenueExposed / totalCompanyRevenue`
- Verified: Tier logic: <10% → Low, 10–25% → Moderate, ≥25% → High
- Verified: Shows "Insufficient Data" when `totalCompanyRevenue = 0`

### ✅ No blank sections
**Files:**
- `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx` - Shows "No concentration risk detected" when empty
- `apps/web/app/components/portfolio/portfolio-recommended-actions.tsx` - Shows "All branches stable." when empty
- `apps/web/app/components/portfolio/portfolio-alert-summary.tsx` - Shows "Insufficient Data" or "Company is operating within safe thresholds"
- Verified: All sections have fallback messages

### ✅ No NaN in console
**Files:** All aggregation files
- Verified: Guards added: `if (!isFinite(value) || isNaN(value)) return 0;`
- Verified: All calculations use safe number utilities
- Verified: Division by zero checks

### ✅ Single branch graph matches branch graph exactly
**File:** `apps/web/app/components/portfolio/portfolio-health-overview.tsx` (lines 107-163)
- Verified: Single branch uses branch trend directly (no aggregation)
- Verified: Validation compares snapshot counts and scores
- Verified: Console warnings if mismatch detected

### ✅ Revenue-weighted daily aggregation
**File:** `core/sme-os/engine/services/health-score-trend-service.ts` (lines 230-393)
- Verified: `aggregateBranchSnapshotsWithRevenueWeighting` function
- Verified: Uses `last30Revenue` (preferred) or `revenue30Days` (fallback)
- Verified: Handles missing branch days gracefully
- Verified: Falls back to simple average if no revenue data

### ✅ Data mode awareness
**File:** `apps/web/app/group/overview/page.tsx` (lines 278-322)
- Verified: Detects mixed data modes (real + simulated)
- Verified: Shows warning: "Mixed data modes across branches."
- Verified: Does not crash on mixed modes

## Validation Summary

All 10 parts completed and validated:
- ✅ PART 1: Company Health Overview
- ✅ PART 2: Critical Alerts Snapshot
- ✅ PART 3: Current Company Risks
- ✅ PART 4: Top 3 Revenue Leaks
- ✅ PART 5: Recommended Actions
- ✅ PART 6: Branch Performance Snapshot
- ✅ PART 7: Company Trends
- ✅ PART 8: Data Mode Awareness
- ✅ PART 9: Numerical Stability
- ✅ PART 10: Validation Checklist

## Key Files Modified

1. `core/calculate-company-score.ts` - Revenue-weighted calculation
2. `apps/web/app/components/alerts/critical-alerts-snapshot.tsx` - Deduplication by code+branchId
3. `apps/web/app/components/portfolio/portfolio-alert-summary.tsx` - Risk tier calculation
4. `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx` - Global top 3 sorting
5. `apps/web/app/components/portfolio/portfolio-recommended-actions.tsx` - Top 3 highest impact
6. `apps/web/app/services/group-aggregation-service.ts` - Aggregation with guards
7. `core/sme-os/engine/services/health-score-trend-service.ts` - Revenue-weighted daily aggregation
8. `apps/web/app/components/portfolio/portfolio-health-overview.tsx` - Graph validation
9. `apps/web/app/group/overview/page.tsx` - Data mode detection
10. `apps/web/app/components/branch-scenario-selector.tsx` - Fixed clearCache import
