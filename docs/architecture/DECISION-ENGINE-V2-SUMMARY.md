# Financial Decision Engine v2 - Implementation Summary

## Overview

Upgraded Aurasea from Alert Platform → Financial Decision Engine. The system now provides money-weighted health scores and revenue exposure analysis instead of flat alert penalties.

## Architecture Changes

### 1. Health Score v2 (Money-Weighted)

**File:** `core/sme-os/engine/health/money-weighted-health-score.ts`

**Algorithm:**
- Calculate `monthlyRevenue` from `branchMetrics.financials.revenueLast30DaysTHB`
- Calculate `totalRevenueExposure` from revenue exposure engine
- Compute `exposureRatio = totalExposure / monthlyRevenue`
- Health score formula: `score = clamp(100 - (exposureRatio * 100), 0, 100)`

**Example:**
- 150k issue on 2M revenue = 7.5% penalty → score = 92.5
- 10k issue on 2M revenue = 0.5% penalty → score = 99.5

**Key Features:**
- Health score reflects financial severity
- Uses `safeNumber()` utilities for all calculations
- Returns safe fallback (score = 0) if monthlyRevenue <= 0

### 2. Unified Revenue Leak Engine

**File:** `core/sme-os/engine/services/revenue-exposure-engine.ts`

**Function:** `calculateRevenueExposure(branchMetrics, alerts)`

**Returns:**
```typescript
{
  totalMonthlyLeakage: number, // Total revenue exposure in THB/month
  leakageByCategory: {
    demand: number,      // Demand drop, low utilization
    margin: number,     // Margin compression, cost pressure
    cost: number,       // Cost inefficiencies
    utilization: number, // Capacity underutilization
    cash: number,       // Cash runway, liquidity risks
    concentration: number, // Revenue concentration risks
    seasonality: number,  // Seasonal mismatches
  },
  exposurePercent: number, // Percentage of monthly revenue (0-100)
}
```

**Key Features:**
- Aggregates revenue impact from all alerts
- Categorizes leaks by type (demand, margin, cost, etc.)
- Calculates exposure as percentage of monthly revenue
- Uses `safeNumber()` and `safeSum()` for all calculations

### 3. Action → Impact Projection

**File:** `core/sme-os/engine/services/health-improvement-calculator.ts`

**Function:** `calculateHealthImprovement(branchMetrics, revenueRecovered)`

**Returns:**
```typescript
{
  revenueRecovered: number,      // Revenue recovery in THB/month
  healthScoreIncrease: number,   // Health score increase (0-100)
}
```

**Formula:**
- `healthScoreIncrease = (revenueRecovered / monthlyRevenue) * 100`

**Integration:**
- Each alert now includes `projectedRecovery` and `projectedHealthIncrease`
- Attached automatically via `attachHealthImprovement()` helper

### 4. Refactored Monitoring Pipeline

**File:** `apps/web/app/services/monitoring-service.ts`

**Changes:**
- Updated `evaluate()` return type to include `decision` object
- Calculates revenue exposure using `calculateRevenueExposure()`
- Calculates money-weighted health score using `calculateMoneyWeightedHealthScore()`
- Attaches health improvement projections to all alerts
- Returns unified decision object:

```typescript
{
  alerts: ExtendedAlertContract[],
  status: MonitoringStatus,
  suppressionInfo: AlertSuppressionInfo,
  decision?: {
    totalExposure: number,        // Total revenue exposure in THB/month
    exposurePercent: number,       // Exposure as percentage (0-100)
    healthScoreV2: number,         // Money-weighted health score (0-100)
    improvementPotential: number,  // Total potential health score increase
  }
}
```

### 5. Updated Alert Contracts

**File:** `apps/web/app/services/monitoring-service.ts`

**Extended `ExtendedAlertContract` with:**
```typescript
{
  // ... existing fields
  projectedRecovery?: number,        // Projected revenue recovery in THB/month
  projectedHealthIncrease?: number,  // Projected health score increase (0-100)
}
```

### 6. Updated Health Score Service

**File:** `apps/web/app/services/health-score-service.ts`

**Changes:**
- Uses money-weighted health score v2 when metrics available
- Falls back to legacy health score if metrics unavailable
- Maintains backward compatibility
- Stores health scores using existing `storeHealthScore()` function

### 7. Top 3 Revenue Leaks

**File:** `apps/web/app/components/portfolio/portfolio-revenue-leaks.tsx`

**Status:** Already correctly sorted by `revenueImpact` (monthlyImpact) DESC

No changes needed - component already implements correct sorting.

## Files Changed

### New Files
1. `core/sme-os/engine/services/revenue-exposure-engine.ts` - Unified revenue leak engine
2. `core/sme-os/engine/health/money-weighted-health-score.ts` - Money-weighted health score v2
3. `core/sme-os/engine/services/health-improvement-calculator.ts` - Health improvement calculator
4. `core/testing/decision-engine-v2.test.ts` - Test suite for v2 engine
5. `docs/architecture/DECISION-ENGINE-V2-SUMMARY.md` - This summary

### Modified Files
1. `apps/web/app/services/monitoring-service.ts` - Integrated new engines, added decision object
2. `apps/web/app/services/health-score-service.ts` - Uses v2 when metrics available
3. `core/testing/decision-engine-fixtures.ts` - Already complete (16 scenarios)

## New Engine Flow

```
1. Monitoring Service evaluates alerts
   ↓
2. Calculate Revenue Exposure (categorize by leak type)
   ↓
3. Calculate Money-Weighted Health Score (exposure ratio → score)
   ↓
4. Attach Health Improvement Projections to alerts
   ↓
5. Return unified decision object with:
   - alerts (with projectedRecovery, projectedHealthIncrease)
   - decision (totalExposure, exposurePercent, healthScoreV2, improvementPotential)
```

## Example Output

### Decision Object Example

```typescript
{
  alerts: [
    {
      id: 'margin-compression-1',
      severity: 'critical',
      revenueImpact: 150000,
      projectedRecovery: 150000,
      projectedHealthIncrease: 7.5,
      // ... other alert fields
    },
    {
      id: 'capacity-utilization-1',
      severity: 'warning',
      revenueImpact: 50000,
      projectedRecovery: 50000,
      projectedHealthIncrease: 2.5,
      // ... other alert fields
    }
  ],
  decision: {
    totalExposure: 200000,        // 200k THB/month total leakage
    exposurePercent: 10.0,        // 10% of monthly revenue
    healthScoreV2: 90.0,         // Money-weighted score
    improvementPotential: 10.0,  // +10 points if all issues fixed
  }
}
```

### Health Score Calculation Example

**Scenario:** Margin compression with 150k monthly impact on 2M revenue

```
monthlyRevenue = 2,000,000 THB
totalExposure = 150,000 THB
exposureRatio = 150,000 / 2,000,000 = 0.075
exposurePercent = 7.5%
penalty = 0.075 * 100 = 7.5
healthScoreV2 = 100 - 7.5 = 92.5
```

**Result:** Health score = 92.5 (reflects financial severity)

## Testing

**Test Suite:** `core/testing/decision-engine-v2.test.ts`

**Coverage:**
- ✅ Revenue exposure calculation
- ✅ Money-weighted health score calculation
- ✅ Health improvement projection
- ✅ Edge cases (missing data, corrupted data)
- ✅ Integration tests with decision-engine-fixtures

**Test Results:** 17 tests passing

**Scenarios Tested:**
- Healthy branch (no alerts)
- Margin compression (150k on 2M revenue)
- Small issue (10k on 2M revenue)
- Missing data
- Corrupted data

## Defensive Programming

**All revenue math uses:**
- `safeNumber()` - Safe numeric conversion
- `safeDivide()` - Safe division (prevents divide by zero)
- `safeClamp()` - Clamps values to valid ranges
- `safeSum()` - Safe array summation

**Guards:**
- If `monthlyRevenue <= 0`: return safe fallback (score = 0)
- If `branchMetrics` is null/undefined: return safe defaults
- If `alerts` is null/undefined: return safe defaults
- All calculations check for NaN/Infinity

## Compatibility

**Backward Compatibility:**
- Health score service falls back to legacy system if metrics unavailable
- Existing UI components continue to work
- TypeScript types remain compatible
- No breaking changes to existing APIs

**Migration Path:**
- New system activates automatically when metrics available
- Legacy system used as fallback
- No manual migration required

## Risk Areas

### Low Risk
- ✅ All calculations use defensive programming
- ✅ Tests cover edge cases
- ✅ Backward compatibility maintained
- ✅ No UI changes required

### Medium Risk
- ⚠️ Health score values may differ from legacy system (expected behavior)
- ⚠️ Components using health scores may need to handle new decision object
- ⚠️ Revenue exposure calculation depends on alert `revenueImpact` field

### Mitigation
- Health score service uses v2 when available, falls back to legacy
- Decision object is optional in monitoring service return type
- Revenue impact already calculated in monitoring service for most alerts

## Next Steps

1. **Monitor Health Score Differences**
   - Compare v2 scores vs legacy scores
   - Validate financial accuracy

2. **UI Integration** (Future)
   - Display `decision.exposurePercent` in UI
   - Show `projectedHealthIncrease` for each alert
   - Display `improvementPotential` in dashboard

3. **Alert Revenue Impact** (Future)
   - Ensure all alerts calculate `revenueImpact`
   - Standardize revenue impact calculation across alert types

## Summary

✅ **Completed:**
- Money-weighted health score v2
- Unified revenue leak engine
- Action → impact projection
- Monitoring pipeline refactored
- Health score service updated
- Comprehensive test suite

✅ **Key Achievement:**
Evolved from "You have 5 alerts" → "You are losing ฿180,000/month. Fixing this improves score by +9."

This is SaaS differentiation. 🚀
