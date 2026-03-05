# Accommodation Monitoring Refactor

## Overview

Complete refactoring of Accommodation Monitoring for AuraSea Intelligence Platform to make it extremely simple, tolerant to incomplete data, and focused on early warnings + smart suggestions.

**Core Principles:**
- Accuracy is secondary
- Usability and clarity are priority
- System never crashes
- Always produces outputs (even with missing data)

## PART 1 — Minimal Daily Input Model

### Schema: `daily_metrics` table

**Required fields (only 4):**
- `rooms_sold` (integer)
- `avg_room_rate` (numeric)
- `total_operating_cost` (numeric)
- `cash_balance` (numeric)

**Computed:**
- `daily_revenue = rooms_sold * avg_room_rate`

**Migration:** `apps/web/app/lib/supabase/migration-add-daily-metrics.sql`

## PART 2 — Intelligence Engine (Simple Rule-Based AI)

### Alert Types

1. **Demand Softening**
   - Rule: 7-day avg rooms_sold < previous 7-day avg by 15%
   - Recommendation: "Consider limited-time weekday promotions or OTA visibility boost."

2. **Revenue Downtrend**
   - Rule: 14-day revenue trend downward > 10%
   - Recommendation: "Check ADR positioning vs competitors."

3. **Low Cash Runway**
   - Rule: cash_balance / avg_daily_cost < 14 days
   - Recommendation: "Delay capex and consider short-term occupancy campaign."

4. **Cost Spike**
   - Rule: 7-day avg cost > 14-day avg cost by 20%
   - Recommendation: "Review variable expenses or staff scheduling."

5. **Missing Monitoring Data**
   - Rule: No update in last 3 days
   - Recommendation: "Update daily metrics to improve accuracy."

**File:** `apps/web/app/services/accommodation-intelligence-engine.ts`

## PART 3 — Confidence System

### Coverage Calculation

```
coverage_ratio = actual_days / 30
```

### Confidence Levels

- `>= 90%` → High
- `70–89%` → Medium
- `50–69%` → Low
- `< 50%` → Very Low

### Data Gap Warning

If coverage < 60%:
- Display banner: "Insights based on limited data."
- System still generates insights

**File:** `apps/web/app/services/accommodation-confidence.ts`

## PART 4 — Health Score Simplification

### Components (Total = 100)

- **Demand Stability** (0–40)
- **Cost Control** (0–30)
- **Liquidity Safety** (0–30)

### Insufficient Data Handling

If coverage < 60%:
```
final_score = raw_score × coverage_ratio
```

### Guarantees

- Never returns null
- Never returns undefined
- Never freezes UI
- Always returns 0-100

**File:** `apps/web/app/services/accommodation-health-score.ts`

## PART 5 — Smart Recommendation Engine

### Features

- Extracts recommendations from alerts
- Max 3 recommendations
- Prioritized by severity (critical > warning > informational)
- Short and actionable

**File:** `apps/web/app/services/accommodation-recommendations.ts`

## PART 6 — UI Principles

### Overview Must Show Only

- Health Score
- Confidence
- 3 Active Alerts (max)
- 3 Recommendations (max)

### Charts

- Simple 30-day revenue + cost trend line only
- Avoid complex financial charts

## PART 7 — Simulation Engine

### Features

- Generates 40 days of daily rows
- Supports 3 scenarios: Healthy, Stressed, Crisis
- Randomly drops days to test confidence system
- Auto-validates expected alert count

### Validation Rules

- **Healthy** → 0–1 alerts
- **Stressed** → 1–3 alerts
- **Crisis** → 3–5 alerts

**File:** `apps/web/app/services/accommodation-simulation-engine.ts`

## PART 8 — System Behavior Guarantee

### Guarantees

- Never depends on perfect data
- Never crashes when days missing
- Always produces:
  - health score (0-100)
  - confidence
  - alerts (even if low confidence)
  - recommendations (max 3)

**File:** `apps/web/app/services/accommodation-safe-wrapper.ts`

## Usage

### Save Daily Metric

```typescript
import { saveDailyMetric } from './services/db/daily-metrics-service';

await saveDailyMetric({
  branchId: 'br-001',
  date: '2026-01-24',
  roomsSold: 45,
  avgRoomRate: 2500,
  totalOperatingCost: 80000,
  cashBalance: 5000000,
});
```

### Get Safe Results

```typescript
import { getSafeAccommodationResult } from './services/accommodation-safe-wrapper';
import { getDailyMetrics } from './services/db/daily-metrics-service';

const metrics = await getDailyMetrics('br-001', 30);
const result = getSafeAccommodationResult(metrics, 'br-001');

console.log('Health Score:', result.healthScore);
console.log('Confidence:', result.confidence.confidenceLevel);
console.log('Alerts:', result.alerts.length);
console.log('Recommendations:', result.recommendations);
```

### Run Simulation

```typescript
import { runAllSimulations } from './services/accommodation-simulation-engine';

const results = runAllSimulations('br-001');
console.log('Healthy:', results.healthy.validation.message);
console.log('Stressed:', results.stressed.validation.message);
console.log('Crisis:', results.crisis.validation.message);
console.log('All Passed:', results.summary.allPassed);
```

## Files Created

1. `apps/web/app/lib/supabase/migration-add-daily-metrics.sql` - Database schema
2. `apps/web/app/models/daily-metrics.ts` - TypeScript models
3. `apps/web/app/services/db/daily-metrics-service.ts` - Database service
4. `apps/web/app/services/accommodation-intelligence-engine.ts` - Alert rules
5. `apps/web/app/services/accommodation-confidence.ts` - Confidence system
6. `apps/web/app/services/accommodation-health-score.ts` - Health score calculation
7. `apps/web/app/services/accommodation-recommendations.ts` - Recommendation extraction
8. `apps/web/app/services/accommodation-simulation-engine.ts` - Simulation engine
9. `apps/web/app/services/accommodation-safe-wrapper.ts` - Safe wrapper (guarantees)

## Next Steps

1. Run migration: `migration-add-daily-metrics.sql` in Supabase SQL Editor
2. Create UI components for daily metric input
3. Integrate safe wrapper into accommodation overview page
4. Test simulation engine with all 3 scenarios
5. Validate system never crashes with missing data
