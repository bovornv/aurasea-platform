# F&B Monitoring Engine Refactor

## Overview

Ultra-simple daily input model for F&B monitoring. System computes weekly aggregates automatically from daily rows. Works with incomplete data. Early warnings > accounting precision.

## PART 1 — REMOVED WEEKLY AGGREGATES

**Removed from UI and engine:**
- `revenue_30d` input
- `costs_30d` input
- `revenue_7d` input
- `costs_7d` input
- `avg_ticket_size` input
- `top3_menu_share` input

**System now computes these automatically from daily rows.**

## PART 2 — NEW DATABASE MODEL

**Table: `fnb_daily_metrics`**

```sql
CREATE TABLE fnb_daily_metrics (
  id UUID PRIMARY KEY,
  branch_id TEXT NOT NULL,
  date DATE NOT NULL,
  total_customers INTEGER NOT NULL,
  total_sales NUMERIC NOT NULL,
  total_operating_cost NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  staff_on_duty INTEGER, -- optional
  promo_spend NUMERIC, -- optional
  created_at TIMESTAMP,
  UNIQUE(branch_id, date)
);
```

## PART 3 — HEALTH ENGINE LOGIC

**Computed Metrics (from daily data):**
- `avg_ticket = total_sales / total_customers`
- 7-day and 14-day rolling averages
- Margin calculations
- Cash runway (days)

**Alert Rules:**
1. **Demand Drop**: 7-day avg customers < previous 7-day by 15%
2. **Revenue Downtrend**: 14-day sales downtrend >10%
3. **Margin Compression**: margin <10%
4. **Low Cash Runway**: cash_balance / avg_daily_cost < 14 days
5. **Weekend Concentration**: Sat+Sun revenue >55% of weekly
6. **Data Gap**: Missing >3 days in last 7

## PART 4 — CONFIDENCE SYSTEM

**Coverage Ratio:**
```
coverage_ratio = actual_days_last_30 / 30
```

**Confidence Levels:**
- ≥90% → High
- 70-89% → Medium
- 50-69% → Low
- <50% → Very Low

**Score Application:**
```
final_score = raw_score × coverage_ratio
```

## PART 5 — UI SIMPLIFICATION

**New F&B Daily Entry Page:** `/fnb/daily-entry`

**Fields (5 total, 4 required):**
1. Total Customers (Today) *
2. Total Sales (Today) *
3. Total Operating Cost (Today) *
4. Current Cash Balance *
5. Staff on Duty (optional)

**Old pages marked for deprecation:**
- `/hospitality/data-entry-fnb` → Redirect to `/fnb/daily-entry`
- `/update-data/cafe-restaurant` → Redirect to `/fnb/daily-entry`
- `/cafe/update-operational-data` → Redirect to `/fnb/daily-entry`

## PART 6 — SIMULATION

**Script:** `scripts/seed-fnb-daily-metrics.ts`

**Usage:**
```bash
npm run seed:fnb-daily
```

**Generates 40 days of daily rows for:**
- Healthy scenario: stable customers, positive margin, growing sales
- Stressed scenario: flat customers, shrinking margin
- Crisis scenario: declining customers, negative margin, low cash

## PART 7 — GUARANTEES

**System guarantees:**
- ✅ Never freezes when days missing
- ✅ Always computes health score (even with 0 data)
- ✅ Always shows max 3 alerts (prioritized by severity)
- ✅ Always generates at least 1 recommendation when alert exists

## Files Created/Updated

### New Files:
- `apps/web/app/lib/supabase/migration-add-fnb-daily-metrics.sql`
- `apps/web/app/services/db/fnb-daily-metrics-service.ts`
- `apps/web/app/services/fnb-health-engine.ts`
- `apps/web/app/fnb/daily-entry/page.tsx`
- `scripts/seed-fnb-daily-metrics.ts`

### Updated Files:
- `apps/web/app/lib/supabase/schema.sql` - Added fnb_daily_metrics table
- `package.json` - Added `seed:fnb-daily` script

### Files to Update (PART 1 - Remove Weekly Aggregates):
- `apps/web/app/hospitality/data-entry-fnb/page.tsx` - Mark deprecated, redirect
- `apps/web/app/update-data/cafe-restaurant/page.tsx` - Mark deprecated, redirect
- `apps/web/app/cafe/update-operational-data/page.tsx` - Mark deprecated, redirect
- `apps/web/app/branch/[branchId]/metrics/page.tsx` - Remove F&B weekly fields
- `apps/web/app/services/db/metrics-service.ts` - Remove F&B weekly fields from DB format
- `core/simulation/simulation-engine.ts` - Update F&B simulation to use daily metrics

## Integration Points

### Monitoring Service
Update `apps/web/app/services/monitoring-service.ts` to:
1. Check if branch has F&B module
2. Load daily metrics using `getFnbDailyMetrics()`
3. Use `evaluateFnbHealth()` instead of old weekly aggregate logic
4. Merge F&B alerts with accommodation alerts

### Branch Metrics Model
Update `apps/web/app/models/branch-metrics.ts`:
- Remove `modules.fnb.totalCustomersLast7Days`
- Remove `modules.fnb.averageTicketPerCustomerTHB` (compute from daily)
- Remove `modules.fnb.top3MenuRevenueShareLast30DaysPct` (compute from daily)
- Keep `modules.fnb.totalStaffFnb` (still needed)

## Migration Path

1. **Run migration:** Execute `migration-add-fnb-daily-metrics.sql` in Supabase
2. **Seed test data:** Run `npm run seed:fnb-daily`
3. **Update monitoring:** Integrate new F&B health engine
4. **Redirect old pages:** Point to new `/fnb/daily-entry` page
5. **Remove old fields:** Clean up weekly aggregate fields from models/services

## Validation

After seeding, validate:
- Healthy scenario: Health score > 80, no critical alerts
- Stressed scenario: Health score 50-80, warning alerts
- Crisis scenario: Health score < 50, critical alerts (demand drop, margin compression, low cash)
