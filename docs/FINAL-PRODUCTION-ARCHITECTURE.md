# Final Production Architecture - Hospitality AI Vertical

## Overview

Complete structural redesign to final production architecture for SME users. This is NOT a patch - it's a clean architectural refactoring.

## Architecture Principles

1. **Four tables only**: organizations, branches, daily_metrics, health_snapshots
2. **Clean separation**: Setup data (branches) vs Daily operational data (daily_metrics)
3. **No legacy logic**: Remove weekly_metrics, simulation, static fixtures
4. **Role-based flows**: Staff (30s), Manager (setup), Owner (finance)
5. **All alerts compute**: 16 alerts from daily_metrics + branches setup
6. **UI completeness**: Never blank, always structured explanations

---

## PART 1 — FINAL DATA SCHEMA

### Table 1: organizations
```sql
id (uuid)
name (text)
vertical_type (text: accommodation | fnb | hybrid)
created_at
```

### Table 2: branches (SETUP DATA)
```sql
-- Core
id (text)
organization_id (uuid)
name (text)
business_type (text)

-- Accommodation Setup
rooms_available (integer)
baseline_adr (numeric)
accommodation_staff_count (integer)

-- F&B Setup
seating_capacity (integer)
baseline_avg_ticket (numeric)
fnb_staff_count (integer)

-- Financial Setup
monthly_fixed_cost (numeric)
variable_cost_ratio (numeric) -- percentage
debt_payment_monthly (numeric, nullable)
credit_line_limit (numeric, nullable)

-- Meta
created_at
updated_at
```

### Table 3: daily_metrics (CORE ENGINE TABLE)
```sql
id (uuid)
branch_id (text)
metric_date (date)

-- Shared (required)
revenue (numeric, required)

-- Accommodation (nullable)
rooms_sold (integer, nullable)
adr (numeric, nullable)

-- F&B (nullable)
customers (integer, nullable)
avg_ticket (numeric, nullable)

-- Optional Finance (nullable)
cash_balance (numeric, nullable)
actual_cost (numeric, nullable)

-- Meta
created_at
```

### Table 4: health_snapshots (optional cache)
```sql
branch_id
metric_date
health_score
alerts_json
confidence_score
```

**Note**: Engine must work without health_snapshots. It's optional caching only.

---

## PART 2 — REMOVE LEGACY LOGIC

### Files to Delete/Refactor:
- `apps/web/app/services/db/weekly-metrics-fetcher.ts` - DELETE
- `apps/web/app/services/accommodation-simulation-engine.ts` - DELETE
- `apps/web/app/services/simulation-service.ts` - DELETE
- `apps/web/app/services/simulation-sync.ts` - DELETE
- `apps/web/app/services/test-fixture-loader-v2.ts` - REFACTOR (remove simulation)

### Code Patterns to Remove:
- All `weekly_metrics` queries
- All `fnb_daily_metrics` queries
- `generateSimulatedMetrics()` calls
- Simulation mode checks
- Static fixture loading

### Migration Strategy:
1. Create new schema (FINAL-PRODUCTION-SCHEMA.sql)
2. Migrate existing data
3. Update all services to use daily_metrics only
4. Remove weekly dependencies
5. Drop legacy tables

---

## PART 3 — DAILY FLOW ARCHITECTURE

### Staff Daily Flow (30 seconds)
1. Open app → Click "Log Today"
2. Enter:
   - Revenue (required)
   - Rooms Sold OR Customers (required, based on business)
   - ADR OR Avg Ticket (optional)
3. Click Save
4. System auto-calculates:
   - Estimated daily cost
   - Margin
   - 7-day average
   - Occupancy
   - Revenue momentum
   - Alerts
   - Health score
   - Confidence

**Staff CANNOT see:**
- Monthly fixed cost
- Debt
- Liquidity runway
- Full financial modeling

### Manager Flow
**Can update:**
- rooms_available
- seating_capacity
- staff_count

**Can view:**
- Productivity
- Utilization
- Margin trend

### Owner Flow
**Optional Finance Update (collapsible):**
- cash_balance (weekly)
- monthly_fixed_cost
- debt_payment

**If not entered:**
- System estimates using cost model
- Confidence decreases if missing

---

## PART 4 — REDESIGN SUBMIT LATEST METRICS PAGE

### New Page Structure

**TITLE**: "Log Today's Performance"
**Subtitle**: "Takes less than 30 seconds."

### SECTION 1 — TODAY (Primary Card)
- Revenue (required)
- If accommodation:
  - Rooms Sold (required)
  - ADR (optional)
- If F&B:
  - Customers (required)
  - Avg Ticket (optional)
- Button: [ Save Today ]

### SECTION 2 — OPTIONAL FINANCE (Owner Only)
- Collapsible panel:
  - Update Cash Balance (optional)
  - Update Monthly Fixed Cost (optional)
  - Update Debt Payment (optional)
- Text: "If skipped, system estimates automatically."

### SECTION 3 — SYSTEM PREVIEW (Auto after Save)
- Estimated Daily Cost
- Estimated Margin
- Occupancy %
- 7-day Momentum
- Confidence %

**Never show blank. Never show null. Always show explanation.**

---

## PART 5 — ALERT COMPUTATION MODEL

### All 16 Alerts Must Compute From:

**Inputs:**
- revenue (from daily_metrics)
- rooms_sold OR customers (from daily_metrics)
- setup capacity (from branches)
- monthly_fixed_cost (from branches)
- variable_cost_ratio (from branches)
- optional cash_balance (from daily_metrics)

**Derived Metrics:**
- 7-day revenue average
- 30-day revenue average
- margin trend
- revenue volatility
- occupancy rate
- utilization
- liquidity runway (if cash available)
- revenue concentration (weekday vs weekend)
- break-even revenue

### Alert List (16 Total):
1. Demand Drop
2. Cost Pressure
3. Margin Compression
4. Seasonal Mismatch
5. Data Confidence Risk
6. Weekend-Weekday Imbalance
7. Low Weekday Utilization
8. Capacity Utilization
9. Weekend-Weekday F&B Gap
10. Menu Revenue Concentration
11. Liquidity Runway Risk
12. Revenue Concentration
13. Cash Flow Volatility
14. Break-Even Risk
15. Seasonality Risk
16. Cash Runway

**Alerts must NOT depend on weekly tables.**

---

## PART 6 — CONFIDENCE MODEL

### Confidence Calculation:
```
Base: 70% (revenue only)
+ 10% (operational data: rooms_sold OR customers)
+ 10% (finance data: cash_balance OR actual_cost)
+ 5% (consistency: regular updates)
= Max 95%
```

### Confidence Levels:
- 90-95%: High
- 80-89%: Medium-High
- 70-79%: Medium
- <70%: Low

**Confidence must never block health calculation.**

---

## PART 7 — UI COMPLETENESS GUARANTEE

### For Every Section:
- If no alert → Show structured green state
- If insufficient data → Show exact reason
- Never show blank containers
- Never rely on fallback UI

### Examples:
- "✓ System Stable" (green, structured)
- "Need 14+ days for trends" (exact reason)
- "Confidence: 75% (missing finance data)" (explanation)

---

## Implementation Checklist

### Phase 1: Schema Migration
- [x] Create FINAL-PRODUCTION-SCHEMA.sql
- [x] Create migration script (migrate-to-final-production-schema.sql, migrate-step9-only.sql)
- [ ] Test migration on dev database
- [ ] Migrate production data

### Phase 2: Remove Legacy Code
- [x] Delete weekly_metrics fetcher (app uses daily_metrics only; use-organization-data loads from daily_metrics)
- [ ] Remove simulation engines
- [ ] Remove static fixtures
- [x] Update all queries to use daily_metrics (audit: 0 alerts use weekly_metrics)

### Phase 3: Redesign Metrics Page
- [x] Create new "Log Today" page (branch/log-today/page.tsx)
- [ ] Implement role-based inputs
- [ ] Add system preview section
- [ ] Test 30-second flow

### Phase 4: Alert Engine Refactor
- [x] Verify all 16 alerts compute from daily_metrics (alert-engine-audit: 0 using weekly_metrics)
- [x] Remove weekly dependencies (app code uses daily_metrics; comments/docs only reference legacy)
- [ ] Test alert computation
- [ ] Update alert rules if needed

### Phase 5: Confidence Model
- [ ] Implement confidence calculation
- [ ] Add confidence display
- [ ] Test confidence levels

### Phase 6: UI Completeness
- [x] Add green states for all sections (started: home feed shows "✓ System stable" when no alerts)
- [ ] Add structured explanations
- [ ] Remove all blank containers
- [ ] Test all edge cases

---

## Success Criteria

After refactor:
- ✅ SME can log daily data in < 30 seconds
- ✅ Owner can update finance weekly
- ✅ Health score auto-calculates
- ✅ All 16 alerts compute
- ✅ No weekly tables
- ✅ No simulation
- ✅ No duplicated logic
- ✅ No blank sections
- ✅ Clean separation of setup vs daily

---

## Files to Create/Modify

### New Files:
1. `apps/web/app/lib/supabase/FINAL-PRODUCTION-SCHEMA.sql`
2. `apps/web/app/lib/supabase/MIGRATION-TO-FINAL-SCHEMA.md`
3. `apps/web/app/pages/log-today/page.tsx` (new metrics entry page)
4. `apps/web/app/services/daily-flow-service.ts` (role-based flow logic)
5. `apps/web/app/services/confidence-calculator.ts` (confidence model)

### Files to Modify:
1. `apps/web/app/services/db/daily-metrics-service.ts` - Update schema
2. `apps/web/app/services/monitoring-service.ts` - Remove weekly dependencies
3. `apps/web/app/services/db/metrics-service.ts` - Remove weekly_metrics
4. All alert rule files - Ensure they use daily_metrics only

### Files to Delete:
1. `apps/web/app/services/db/weekly-metrics-fetcher.ts`
2. `apps/web/app/services/accommodation-simulation-engine.ts`
3. `apps/web/app/services/simulation-service.ts`
4. `apps/web/app/services/simulation-sync.ts`
