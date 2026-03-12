# Migration Guide: Unified Daily Metrics Architecture

## Overview

This migration standardizes all business types to use a single `daily_metrics` table, removing the separate `fnb_daily_metrics` table and deprecating `weekly_metrics`.

## Migration Steps

### Step 1: Run Database Migration

Run `migration-unify-daily-metrics.sql` in Supabase SQL Editor:

1. Adds unified fields to `daily_metrics`:
   - `revenue` (canonical field)
   - `cost` (canonical field, renamed from `total_operating_cost`)
   - `adr` (renamed from `avg_room_rate`)
   - F&B fields: `customers`, `avg_ticket`, `fnb_staff`, `promo_spend`
   - Accommodation fields: `rooms_available`, `staff_count`

2. Migrates data from `fnb_daily_metrics` to `daily_metrics`

3. Drops `fnb_daily_metrics` table

### Step 2: Verify Migration

Run verification queries:

```sql
-- Check unified structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'daily_metrics'
ORDER BY ordinal_position;

-- Verify fnb_daily_metrics is dropped
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'fnb_daily_metrics';
-- Should return no rows
```

### Step 3: Test Frontend

1. Navigate to branch metrics page
2. Submit today's metrics (accommodation and/or F&B)
3. Verify data saves correctly
4. Check browser console for `[DAILY_FETCH]` logs
5. Verify graphs display data correctly
6. Check alert engine triggers correctly

## Canonical Field Names

### Shared Financial Fields (Required)
- `revenue` - Daily revenue (THB)
- `cost` - Daily operating cost (THB)
- `cash_balance` - Cash balance (THB)

### Accommodation Fields (Nullable)
- `rooms_sold` - Rooms sold today
- `rooms_available` - Total rooms capacity
- `adr` - Average Daily Rate (THB)
- `staff_count` - Staff count

### F&B Fields (Nullable)
- `customers` - Customer count today
- `avg_ticket` - Average ticket size (THB)
- `fnb_staff` - Staff count
- `promo_spend` - Promotional spending (THB)

## Query Format

All queries use standardized format:

```typescript
supabase
  .from('daily_metrics')
  .select('*')
  .eq('branch_id', branchId)
  .gte('metric_date', startDate)
  .order('metric_date', { ascending: true })
```

## Data Guards

- Returns empty array if no data (no fallback to simulation)
- Returns empty array on error (no localStorage fallback)
- Shows empty state UI instead of timeout
- No fallback to weekly_metrics

## Removed/Deprecated

- ❌ `fnb_daily_metrics` table (dropped)
- ❌ `weekly_metrics` table (deprecated, not used)
- ❌ `saveFnbDailyMetric()` (deprecated, use `saveDailyMetric()`)
- ❌ `getFnbDailyMetrics()` (deprecated, use `getDailyMetrics()`)
- ❌ `calculateRollingMetricsWithFnb()` (deprecated, use `calculateRollingMetrics()`)

## Alert Engine Updates

All alerts now use unified fields:

- **Liquidity Runway**: `cash_balance / avg_daily_cost`
- **Demand Drop**: Compare 7-day average `revenue`
- **Capacity Utilization**: `rooms_sold / rooms_available`
- **Weekend Detection**: Derive from `metric_date` weekday (0=Sunday, 6=Saturday)

## Graph Updates

Graphs now fetch directly from `daily_metrics`:

```typescript
const dailyMetrics = await getDailyMetrics(branchId, 30);
// Returns: [{ date, revenue, cost, cash_balance, ... }, ...]
// Ordered by metric_date ASC
```

## Files Updated

- ✅ `models/daily-metrics.ts` - Unified model with all fields
- ✅ `services/db/daily-metrics-service.ts` - Unified service
- ✅ `services/db/metrics-service.ts` - Uses unified table
- ✅ `utils/rolling-metrics-calculator.ts` - Handles unified fields
- ✅ `services/accommodation-intelligence-engine.ts` - Uses canonical fields
- ✅ `services/fnb-health-engine.ts` - Uses unified fields
- ✅ `components/charts/revenue-last-30-days-chart.tsx` - Fetches from unified table
- ✅ `branch/[branchId]/metrics/page.tsx` - Saves to unified table
- ✅ `fnb/daily-entry/page.tsx` - Uses unified service

## Backward Compatibility

- `fnb-daily-metrics-service.ts` is deprecated but kept for compatibility
- Functions redirect to unified `daily-metrics-service.ts`
- Old field names (`total_sales`, `total_operating_cost`) are mapped automatically
