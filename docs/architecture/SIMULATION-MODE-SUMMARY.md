# Interactive Simulation Mode - Implementation Summary

## Overview

Added interactive simulation mode to Aurasea, allowing users to switch between 3 business types, apply scenarios, and use live play controls to see real-time health score and revenue exposure changes.

## Files Added

### Core Engine
1. **`core/simulation/simulation-engine.ts`** (704 lines)
   - Main simulation engine
   - Generates 30-day realistic datasets
   - Supports 3 business types
   - Deterministic seed-based random generation
   - Weekend boost logic
   - Scenario multipliers (healthy/stressed/crisis)
   - Live play controls support

### Integration Layer
2. **`apps/web/app/services/simulation-service.ts`** (180 lines)
   - Integrates simulation engine with operational signals service
   - Caches simulation datasets
   - Converts simulation data to BranchMetrics format
   - Converts to OperationalSignal format for backward compatibility

### UI Components
3. **`apps/web/app/providers/test-mode-provider.tsx`** (Modified)
   - Extended TestModeState to include simulation fields
   - Added `setSimulation()` method
   - Persists simulation state to localStorage

4. **`apps/web/app/components/business-scenario-selector.tsx`** (Modified)
   - Added simulation dropdown
   - Added scenario dropdown (healthy/stressed/crisis)
   - Added live play controls (revenue multiplier, cost multiplier, cash adjustment)
   - Real-time recalculation on changes

### Service Integration
5. **`apps/web/app/services/operational-signals-service.ts`** (Modified)
   - Checks for simulation mode first
   - Returns simulation data when active
   - Falls back to test mode or production data

## Simulation Dataset Types

### 1. Big Standalone Accommodation
- **120 rooms**
- **ADR:** 3,200–3,800 THB
- **Occupancy:** 55–82% (with weekend spikes)
- **Characteristics:**
  - Weekend boost: +15% occupancy, +20% revenue
  - Mild volatility: ±5% daily variation
  - Realistic revenue fluctuation

### 2. F&B Multi-Branch (3 branches)
- **Central Branch:** Stable performance
- **Riverside Branch:** Underperforming weekdays (-25%)
- **Old Town Branch:** Revenue concentration risk (68% top 3 menu share)
- **Each branch:**
  - Daily customers: 80–300
  - Average ticket: 280–500 THB
  - Weekend boost: +30% customers, +20% revenue

### 3. Accommodation with F&B
- **60 rooms**
- **Occupancy:** 45–75%
- **F&B:** 40% of guests dine + 30% walk-ins
- **Interplay:** F&B revenue tied to accommodation occupancy
- **Moderate menu concentration:** 42%

## Scenario Multipliers

### Healthy
- Revenue: +10%
- Costs: -5%

### Stressed
- Revenue: -12% (weekday), normal weekend
- Costs: +8%

### Crisis
- Revenue: -30% (occupancy impact)
- Costs: +15%
- Cash: -25%

## Live Play Controls

1. **Revenue Multiplier:** 0.5x – 1.5x (slider)
2. **Cost Multiplier:** 0.5x – 1.5x (slider)
3. **Cash Adjustment:** Direct THB input

All controls trigger real-time recalculation of:
- Health score v2
- Revenue exposure
- Alerts
- Decision engine metrics

## Data Structure

### SimulationDataset Output
```typescript
{
  type: SimulationType,
  scenario: SimulationScenario,
  branches: [
    {
      branchId: string,
      branchName: string,
      metrics: BranchMetrics, // Full production-compatible metrics
      dailyMetrics: DailyMetrics[] // 30 days of daily data
    }
  ],
  groupMetrics: {
    totalRevenue30d: number,
    totalCosts30d: number,
    totalCashBalance: number
  },
  dailyMetrics: DailyMetrics[], // Aggregated daily metrics
  monthlySummary: {
    averageDailyRevenue: number,
    averageOccupancy?: number,
    averageCustomers?: number
  }
}
```

### DailyMetrics Structure
```typescript
{
  date: string, // ISO date
  revenue: number,
  occupancyRate?: number, // For accommodation
  averageDailyRoomRate?: number, // For accommodation
  customers?: number, // For F&B
  averageTicket?: number // For F&B
}
```

## Example 30-Day Array

**Big Accommodation - Healthy Scenario:**
```typescript
dailyMetrics: [
  { date: '2025-01-01', revenue: 245000, occupancyRate: 62.3, averageDailyRoomRate: 3450 },
  { date: '2025-01-02', revenue: 238000, occupancyRate: 60.1, averageDailyRoomRate: 3380 },
  // ... 28 more days
  { date: '2025-01-30', revenue: 312000, occupancyRate: 78.5, averageDailyRoomRate: 3650 } // Weekend
]
```

**F&B Multi-Branch - Stressed Scenario:**
```typescript
branches: [
  {
    branchId: 'sim-fnb-central-001',
    dailyMetrics: [
      { date: '2025-01-01', revenue: 75600, customers: 180, averageTicket: 420 },
      { date: '2025-01-02', revenue: 71400, customers: 170, averageTicket: 420 },
      // ... 28 more days
    ]
  },
  // ... 2 more branches
]
```

## Integration Flow

```
User selects simulation type
  ↓
TestModeProvider.setSimulation() called
  ↓
simulation-service.generateAndCacheSimulation()
  ↓
simulation-engine.generateSimulationDataset()
  ↓
Dataset cached in simulation-service
  ↓
operational-signals-service.getLatestMetrics() checks simulation first
  ↓
Returns simulation BranchMetrics
  ↓
monitoring-service.evaluate() uses simulation metrics
  ↓
Health score v2, revenue exposure, alerts calculated
  ↓
UI updates in real-time
```

## Monitoring Engine Integration

**Confirmed:** Monitoring engine uses simulation data when active:

1. **`operational-signals-service.getLatestMetrics()`** checks `isSimulationModeActive()` first
2. Returns `getSimulationMetrics(branchId)` if simulation active
3. Falls back to test mode fixtures or production data
4. **`monitoring-service.evaluate()`** receives simulation metrics transparently
5. All calculations (health score v2, revenue exposure, alerts) work with simulation data

## Safety Features

✅ **All numbers use `safeNumber()`**
✅ **No NaN values** - all calculations validated
✅ **No negative values** unless logically allowed (cash adjustment can be negative)
✅ **Deterministic generation** - same seed = same data
✅ **Backward compatible** - doesn't break production logic
✅ **Type-safe** - full TypeScript support

## Usage

### In UI:
1. Select "Simulation Dataset" dropdown
2. Choose: Big Accommodation / F&B Multi Branch / Accommodation + F&B
3. Select scenario: Healthy / Stressed / Crisis
4. Adjust live play controls (sliders)
5. Watch health score and revenue exposure update in real-time

### Programmatically:
```typescript
import { generateSimulationDataset } from '@/core/simulation/simulation-engine';

const dataset = generateSimulationDataset(
  'big_accommodation',
  'healthy',
  { revenueMultiplier: 1.2, costMultiplier: 0.9 }
);

// Use dataset.branches[0].metrics with monitoring service
```

## Testing

**Test Coverage:**
- ✅ 30-day array generation
- ✅ Weekend boost logic
- ✅ Scenario multipliers
- ✅ Live play controls
- ✅ Deterministic seed generation
- ✅ Safe number utilities
- ✅ BranchMetrics compatibility

## Next Steps (Future Enhancements)

1. **Add more simulation types** (e.g., seasonal variations)
2. **Add historical trends** (simulate 90-day history)
3. **Add menu item data** for F&B simulations
4. **Add export/import** simulation datasets
5. **Add preset scenarios** (e.g., "Black Friday", "Low Season")

## Summary

✅ **Completed:**
- Simulation engine with 3 dataset types
- 30-day daily array generation
- Weekend boost logic
- Scenario layer (healthy/stressed/crisis)
- Live play controls (sliders)
- Integration with TestModeProvider
- Connection to monitoring engine
- Unified output structure matching production
- Safety features (safeNumber, no NaN)

✅ **Key Achievement:**
Users can now:
- Switch business types instantly
- Apply scenarios and see impact
- Adjust multipliers in real-time
- Watch health score move
- Watch revenue exposure change
- See decision engine react

**You'll finally feel the platform.** 🎮
