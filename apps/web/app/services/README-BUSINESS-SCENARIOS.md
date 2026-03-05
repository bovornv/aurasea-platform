# Business Scenario Testing System

## Overview

The Business Scenario Testing System enables deterministic testing across business types and scenarios. All alerts, health scores, and recommendations recompute correctly when switching scenarios.

## Business Types (7)

- `cafe_single` - Single café branch
- `cafe_multi_branch` - Multi-branch café group
- `restaurant_single` - Single restaurant branch
- `restaurant_multi_branch` - Multi-branch restaurant group
- `hotel_no_fnb` - Hotel without F&B operations
- `hotel_with_fnb` - Hotel with F&B (café/restaurant)
- `hotel_group` - Multi-branch hotel group

## Scenarios (3)

- `good` - Healthy performance (high health score, minimal alerts)
- `mixed` - Moderate performance (warning alerts, moderate health score)
- `bad` - Struggling performance (critical alerts, low health score)

## Scenario Key Format

Each scenario is identified by a canonical key:
```
${businessType}__${scenario}
```

Examples:
- `cafe_single__good`
- `hotel_with_fnb__mixed`
- `restaurant_multi_branch__bad`

## UI Components

### Business Scenario Selector

Replaces the old single-dropdown TEST_MODE switcher with:

1. **Business Type Dropdown** - Select from 7 business types
2. **Scenario Dropdown** - Select Good/Mixed/Bad (only visible when business type is selected)
3. **Update Data Button** - Reloads data with current scenario selection

The selector is only visible in development mode (`NODE_ENV !== 'production'`).

## Data Loading

### Scenario Registry

The `ScenarioRegistry` (`scenario-registry.ts`) maps scenarioKeys to fixture files:

```typescript
'cafe_single__good' → 'cafe-single-good.json'
'hotel_with_fnb__mixed' → 'hotel-with-fnb-mixed.json'
```

### Fixture Bundles

Each fixture bundle includes:
- `organizationId` - Organization identifier
- `branches[]` - Array of branch data:
  - `branchId`, `branchName`, `branchType`
  - `dailyRevenue[]` - 31+ days of revenue data
  - `menuRevenueDistribution[]` - Menu item data (for F&B)
- `verticalFlags` - Metadata:
  - `hasHotel` - Contains hotel branches
  - `hasFnb` - Contains F&B branches
  - `isMixed` - Contains both hotel and F&B

## Engine Execution

On scenario change or "Update Data" click:

1. **Clear Derived State**
   - Fixture cache cleared
   - Operational signals reset
   - Alert evaluation state cleared

2. **Reload Fixtures**
   - Load fixture bundle using scenarioKey
   - Convert to operational signals
   - Convert to hospitality input

3. **Re-run SME-OS Rules**
   - Hotel rules (demand drop, cost pressure, etc.)
   - F&B rules (low weekday utilization, weekend gap, menu concentration)
   - All rules execute on fresh data

4. **Recompute Metrics**
   - Branch health scores
   - Group health score (for multi-branch)
   - Active alerts
   - Recommendations

5. **Force React Re-render**
   - Page reload ensures all components update
   - No stale memoized data

## Strict Rules

- ✅ **No Math.random** - All fixtures use deterministic data
- ✅ **No Reused Results** - Each scenarioKey loads unique fixture
- ✅ **No Memoization Across scenarioKey** - Cache cleared on change
- ✅ **Scenario Change MUST Change Outputs** - Different scenarios produce different results

## Debugging

On every scenario load, the system logs:

```
[TEST_MODE] Scenario loaded: cafe_single__good
[TEST_MODE] - Branches: 1
[TEST_MODE] - Vertical flags: { hasHotel: false, hasFnb: true, isMixed: false }
```

Additional logging available in browser console for:
- Number of alerts triggered
- Health scores (branch + group)
- Alert types and severities

## Usage

### Via UI (Recommended)

1. Select Business Type from dropdown
2. Select Scenario (Good/Mixed/Bad)
3. Click "Update Data" button
4. Page reloads with new scenario data

### Via URL

```
http://localhost:3000/hospitality?businessType=cafe_single&scenario=good
http://localhost:3000/hospitality?businessType=hotel_with_fnb&scenario=mixed
```

## Acceptance Criteria

✅ `cafe_single__good ≠ cafe_single__bad` - Different scenarios produce different results  
✅ `hotel_with_fnb__mixed` shows uneven branch health - Mixed scenarios show variance  
✅ `hotel_group__bad` triggers multiple alerts - Bad scenarios trigger critical alerts  
✅ Switching scenario always updates numbers and alerts - No stale data

## Files

- `scenario-registry.ts` - Registry mapping scenarioKeys to fixtures
- `test-fixture-loader-v2.ts` - V2 loader for scenarioKey format
- `test-fixture-loader.ts` - Legacy loader (backward compatible)
- `business-scenario-selector.tsx` - UI component with two dropdowns
- `core/sme-os/tests/fixtures/*.json` - All 21 fixture files

## Migration Notes

The old single-dropdown `ScenarioSwitcher` has been replaced by `BusinessScenarioSelector`. Legacy scenario formats (e.g., `?scenario=cafe-good`) are still supported for backward compatibility, but new scenarios should use the `businessType` + `scenario` format.
