# Organization-Based Scenario Testing

## Overview

The platform has been refactored to support real-data scenario testing using separate organizations instead of simulation mode. Each organization represents one scenario (healthy, stressed, crisis), and switching organizations triggers full recalculation of all derived metrics.

## Architecture

### PART 1: Real Data Guards

**Files:**
- `apps/web/app/utils/real-data-guard.ts`

**Features:**
- `isRealDataOnlyMode()` - Checks if real data only mode is enabled
- `checkRealDataGuard()` - Returns current data source state
- `enforceRealDataOnly()` - Hard stop if simulation is active while real data only is enabled

**Environment Variable:**
```bash
NEXT_PUBLIC_USE_REAL_DATA_ONLY=true
```

**Behavior:**
- When enabled, forces `simulationActive = false` and `testModeActive = false`
- Clears simulation state from localStorage
- Logs: `[DATA SOURCE CHECK] REAL_SUPABASE`
- Throws error if simulation is still active

### PART 2: Organization Context

**Files:**
- `apps/web/app/contexts/organization-context.tsx`
- `apps/web/app/hooks/use-organization-data.ts`

**Features:**
- Manages active organization ID
- Loads organizations from Supabase
- Loads branches and metrics for active organization
- Dispatches `organizationChanged` event on switch

**Usage:**
```typescript
const { activeOrganizationId, setActiveOrganizationId } = useOrganization();
const { branches, branchMetrics } = useOrganizationData();
```

### PART 3: Developer Organization Switcher

**Files:**
- `apps/web/app/components/organization-switcher-dev.tsx`
- `apps/web/app/settings/page.tsx`

**Location:**
- Settings page (`/settings`)
- Only visible in development mode

**Features:**
- Dropdown to switch between organizations
- Automatically reloads page on change
- Shows loading state during switch

### PART 4: Full Recalculation

**Files:**
- `apps/web/app/utils/cache-invalidation.ts`
- Updated hooks: `use-health-score.ts`, `use-hospitality-alerts.ts`

**Features:**
- `invalidateAllDerivedState()` - Clears all cached health scores, alerts, exposure
- `invalidateBranchState(branchId)` - Clears specific branch cache
- `invalidateOrganizationState(orgId)` - Clears organization-level cache

**Cache Keys Cleared:**
- `health_score_*`
- `alerts_*`
- `revenue_exposure_*`
- `company_health_*`
- `branch_health_*`
- `health_history_*`
- `trend_*`
- `metrics_cache_*`
- `signals_cache_*`

**Event Listeners:**
- `organizationChanged` - Triggers recalculation in all hooks
- `forceRecalculation` - Forces immediate recalculation

### PART 5: Validation Behavior

**Files:**
- `apps/web/app/utils/validation-logger.ts`
- Integrated into `group/overview/page.tsx` and `components/debug-panel.tsx`

**Expected Behavior:**

**healthy_hotel:**
- Health score > 80
- No `liquidity_runway` alert
- No `demand_drop` alert
- Revenue exposure near 0

**stressed_hotel:**
- Health score 50-80
- Warning-level alerts
- Moderate revenue exposure (> 10,000 THB)

**crisis_hotel:**
- Health score < 50
- `liquidity_runway` alert present
- `demand_drop` alert present
- Revenue exposure > 50,000 THB

**Logging:**
- `[ENGINE_VALIDATION_PASSED]` - When validation passes
- `[ENGINE_VALIDATION_FAILED]` - When validation fails (with details)

### PART 6: Hard Stop Enforcement

**Implementation:**
- `enforceRealDataOnly()` in `real-data-guard.ts`
- Called in `SimulationContext` before allowing simulation
- Throws error if simulation active while `useRealDataOnly = true`

**Error Message:**
```
Simulation must be disabled for real scenario testing.
Set NEXT_PUBLIC_USE_REAL_DATA_ONLY=true or clear simulation state.
```

### PART 7: Debug Panel

**Files:**
- `apps/web/app/components/debug-panel.tsx`

**Features:**
- Collapsible panel (bottom-right corner)
- Only visible in development mode
- Shows:
  - Active organization ID
  - Total weekly metrics loaded
  - Latest computed health score
  - Active alerts array
  - Revenue exposure
  - Liquidity runway months

**Integration:**
- Uses `useOrganization()` for organization data
- Uses `useOrganizationData()` for branches and metrics
- Uses `useHealthScore()` for health score
- Uses `useHospitalityAlerts()` for alerts
- Runs validation automatically

## Data Flow

1. **Organization Switch:**
   ```
   User selects organization → setActiveOrganizationId() →
   Clear cache → Dispatch 'organizationChanged' event →
   All hooks recalculate → UI updates
   ```

2. **Data Loading:**
   ```
   Organization ID → Load branches from Supabase →
   Load weekly_metrics for branches →
   Generate signals → Evaluate alerts →
   Calculate health scores → Display in UI
   ```

3. **Validation:**
   ```
   Health score + Alerts + Revenue exposure →
   validateOrganizationScenario() →
   Log validation result → Show in debug panel
   ```

## Usage

### Switching Organizations

1. Navigate to Settings page (`/settings`)
2. Find "Developer Scenario Switch" dropdown (dev mode only)
3. Select organization: `healthy_hotel`, `stressed_hotel`, or `crisis_hotel`
4. Page reloads automatically
5. All data recalculates from Supabase

### Viewing Debug Info

1. Click "🐛 Debug Panel" button (bottom-right)
2. Panel expands showing:
   - Current organization
   - Branches and metrics count
   - Health score
   - Alerts count
   - Revenue exposure
   - Liquidity runway

### Validation

Validation runs automatically when:
- Organization changes
- Health score updates
- Alerts update
- Revenue exposure changes

Check browser console for:
- `[ENGINE_VALIDATION_PASSED]` - Success
- `[ENGINE_VALIDATION_FAILED]` - Failure with details

## Environment Setup

**Required:**
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
NEXT_PUBLIC_USE_REAL_DATA_ONLY=true
NEXT_PUBLIC_DISABLE_TEST_MODE=true
```

## Database Setup

**Organizations:**
- `healthy_hotel` - Healthy Hotel Group
- `stressed_hotel` - Stressed Hotel Group
- `crisis_hotel` - Crisis Hotel Group

**Seed Data:**
Run `npm run seed:real-test` to populate organizations with test data.

## Troubleshooting

### Organization Not Loading
- Check Supabase connection
- Verify organization IDs match seeded data
- Check browser console for errors

### Validation Failing
- Check console for `[ENGINE_VALIDATION_FAILED]` details
- Verify metrics are loaded for organization
- Ensure alerts are being generated correctly

### Cache Not Clearing
- Check `organizationChanged` event is firing
- Verify cache invalidation is running
- Check localStorage for cached keys

### Simulation Still Active
- Check `NEXT_PUBLIC_USE_REAL_DATA_ONLY=true` is set
- Clear localStorage: `localStorage.removeItem('aurasea_test_mode')`
- Restart dev server

## Files Modified

**New Files:**
- `apps/web/app/utils/real-data-guard.ts`
- `apps/web/app/utils/cache-invalidation.ts`
- `apps/web/app/utils/validation-logger.ts`
- `apps/web/app/contexts/organization-context.tsx`
- `apps/web/app/hooks/use-organization-data.ts`
- `apps/web/app/components/organization-switcher-dev.tsx`

**Modified Files:**
- `apps/web/app/contexts/simulation-context.tsx` - Added real data guard
- `apps/web/app/hooks/use-health-score.ts` - Added organization change listener
- `apps/web/app/hooks/use-hospitality-alerts.ts` - Added organization change listener
- `apps/web/app/group/overview/page.tsx` - Added validation
- `apps/web/app/components/debug-panel.tsx` - Enhanced with real data
- `apps/web/app/layout.tsx` - Added OrganizationProvider
- `apps/web/.env.local` - Added `NEXT_PUBLIC_USE_REAL_DATA_ONLY=true`
