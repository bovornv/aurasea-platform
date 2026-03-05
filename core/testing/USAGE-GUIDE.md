# Mock Data Generator Usage Guide

Quick reference for using the decision engine mock data generator.

## Import

```typescript
import { 
  generateDecisionEngineScenario,
  generateAllScenarios,
  generateMultipleScenarios,
  getAvailableScenarioTypes,
  type DecisionEngineScenario
} from '@/core/testing/decision-engine-fixtures';
```

## Basic Usage

### Generate a Single Scenario

```typescript
// Generate a healthy branch scenario
const scenario = generateDecisionEngineScenario('healthy');

// Access the metrics
console.log(scenario.metrics.branchId); // 'test-healthy-001'
console.log(scenario.metrics.financials.cashBalanceTHB); // 5_000_000
console.log(scenario.metrics.modules.accommodation?.occupancyRateLast30DaysPct); // 78

// Check expected outcomes
console.log(scenario.expectedHealthScore); // { min: 85, max: 100 }
console.log(scenario.expectedAlerts); // { critical: 0, warning: 0, informational: 0 }
console.log(scenario.description); // 'Healthy Branch - Low risk...'
```

### Generate All Scenarios

```typescript
// Get all 16 scenarios at once
const allScenarios = generateAllScenarios();

allScenarios.forEach(scenario => {
  console.log(`${scenario.description}: Score ${scenario.expectedHealthScore.min}-${scenario.expectedHealthScore.max}`);
});
```

### Generate Multiple Specific Scenarios

```typescript
const scenarios = generateMultipleScenarios([
  'healthy',
  'margin',
  'cash',
  'corrupted'
]);

scenarios.forEach(scenario => {
  // Process each scenario
});
```

### List Available Scenario Types

```typescript
const types = getAvailableScenarioTypes();
// Returns: ['healthy', 'margin', 'capacity', 'cash', 'fnb_concentration', 'missing', 'corrupted', 'boundary_80', ...]
```

## Available Scenarios

### Core Scenarios
- `'healthy'` - Healthy branch (score 85-100)
- `'margin'` - Margin compression (score 60-75)
- `'capacity'` - Capacity underutilization (score 50-70)
- `'cash'` - Cash runway risk (score 20-50)
- `'fnb_concentration'` - F&B revenue concentration (score 70-85)
- `'missing'` - Missing data (score 0, confidence 0)
- `'corrupted'` - Extreme NaN values (score 0, no crash)

### Edge Cases
- `'boundary_80'` - Score at 80 threshold
- `'boundary_60'` - Score at 60 threshold
- `'boundary_40'` - Score at 40 threshold
- `'zero_values'` - Valid zeros (not missing)
- `'max_penalty'` - Maximum penalty (score ~20)
- `'partial_module'` - Only accommodation, no F&B
- `'stale_data'` - Very old data (low confidence)
- `'extreme_values'` - Very high valid values
- `'multiple_issues'` - Multiple alerts simultaneously

## Common Use Cases

### 1. Unit Testing

```typescript
import { generateDecisionEngineScenario } from '@/core/testing/decision-engine-fixtures';
import { calculateBranchHealthScore } from '@/core/sme-os/engine/health/branch-health-score';

describe('Health Score Calculation', () => {
  it('should calculate healthy branch score correctly', () => {
    const scenario = generateDecisionEngineScenario('healthy');
    const mockAlerts: AlertContract[] = []; // No alerts for healthy branch
    
    const result = calculateBranchHealthScore(mockAlerts);
    
    expect(result.score).toBeGreaterThanOrEqual(scenario.expectedHealthScore.min);
    expect(result.score).toBeLessThanOrEqual(scenario.expectedHealthScore.max);
  });
});
```

### 2. Integration Testing with Monitoring Service

```typescript
import { generateDecisionEngineScenario } from '@/core/testing/decision-engine-fixtures';
import { monitoringService } from '@/apps/web/app/services/monitoring-service';
import { operationalSignalsService } from '@/apps/web/app/services/operational-signals-service';

async function testScenario(scenarioType: string) {
  // 1. Generate scenario
  const scenario = generateDecisionEngineScenario(scenarioType);
  
  // 2. Save metrics to operational signals
  operationalSignalsService.saveMetrics(scenario.metrics);
  
  // 3. Run monitoring evaluation
  const setup = {
    isCompleted: true,
    businessType: 'hotel_with_fnb',
    // ... other setup fields
  };
  
  const { alerts, status } = await monitoringService.evaluate(setup, {
    businessType: 'hotel_with_fnb',
    scenario: 'good',
    version: '1.0',
  });
  
  // 4. Validate results
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  expect(criticalCount).toBe(scenario.expectedAlerts.critical);
  
  return { alerts, scenario };
}
```

### 3. Testing Edge Cases

```typescript
// Test NaN handling
const corrupted = generateDecisionEngineScenario('corrupted');
const safeCash = safeNumber(corrupted.metrics.financials.cashBalanceTHB, 0);
expect(Number.isNaN(safeCash)).toBe(false);

// Test missing data
const missing = generateDecisionEngineScenario('missing');
expect(missing.metrics.modules.accommodation).toBeUndefined();
expect(missing.expectedHealthScore.min).toBe(0);

// Test boundary conditions
const boundary80 = generateDecisionEngineScenario('boundary_80');
expect(boundary80.expectedHealthScore.min).toBeGreaterThanOrEqual(78);
expect(boundary80.expectedHealthScore.max).toBeLessThanOrEqual(82);
```

### 4. Batch Testing All Scenarios

```typescript
import { generateAllScenarios } from '@/core/testing/decision-engine-fixtures';

async function runAllScenarios() {
  const scenarios = generateAllScenarios();
  
  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.description} ===`);
    
    try {
      // Save and evaluate
      operationalSignalsService.saveMetrics(scenario.metrics);
      const { alerts } = await monitoringService.evaluate(setup, config);
      
      // Validate
      const healthScore = getHealthScoreHierarchy(alerts, scenario.metrics.groupId);
      const passed = 
        healthScore.healthScore >= scenario.expectedHealthScore.min &&
        healthScore.healthScore <= scenario.expectedHealthScore.max;
      
      console.log(`Score: ${healthScore.healthScore} (expected: ${scenario.expectedHealthScore.min}-${scenario.expectedHealthScore.max})`);
      console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    } catch (error) {
      console.error(`❌ ERROR: ${error.message}`);
    }
  }
}
```

### 5. Manual Testing in Browser Console

```javascript
// In browser console (development mode)
import { generateDecisionEngineScenario } from '@/core/testing/decision-engine-fixtures';

// Generate and inspect
const scenario = generateDecisionEngineScenario('cash');
console.log('Metrics:', scenario.metrics);
console.log('Expected Score:', scenario.expectedHealthScore);
console.log('Expected Alerts:', scenario.expectedAlerts);

// Use with monitoring service
const { alerts } = await monitoringService.evaluate(setup, config);
console.log('Actual Alerts:', alerts);
```

## Scenario Structure

Each scenario returns a `DecisionEngineScenario` object:

```typescript
interface DecisionEngineScenario {
  metrics: BranchMetrics;              // Mock branch metrics
  expectedHealthScore: {
    min: number;                       // Minimum expected score (0-100)
    max: number;                       // Maximum expected score (0-100)
  };
  expectedAlerts: {
    critical: number;                  // Expected critical alerts count
    warning: number;                   // Expected warning alerts count
    informational: number;             // Expected informational alerts count
  };
  expectedRevenueExposure?: {          // Optional revenue impact range
    min: number;
    max: number;
  };
  description: string;                 // Human-readable description
}
```

## Tips

1. **Always validate health scores are 0-100** - Never NaN or undefined
2. **Check alert counts match expectations** - Compare actual vs expected
3. **Test edge cases first** - Missing data, corrupted data, boundaries
4. **Use safeNumber utilities** - For all numeric operations on metrics
5. **Clear localStorage between tests** - Avoid cached data interference
6. **Run all scenarios** - Use `generateAllScenarios()` for comprehensive testing

## Examples

### Example 1: Test Margin Compression Alert

```typescript
const scenario = generateDecisionEngineScenario('margin');

// Expected: Margin compression alert with high impact
expect(scenario.expectedAlerts.critical).toBeGreaterThan(0);
expect(scenario.expectedHealthScore.max).toBeLessThan(75);
expect(scenario.metrics.financials.costsLast30DaysTHB).toBeGreaterThan(
  scenario.metrics.financials.revenueLast30DaysTHB * 0.9
);
```

### Example 2: Test Missing Data Handling

```typescript
const scenario = generateDecisionEngineScenario('missing');

// Should not crash, return safe defaults
expect(scenario.expectedHealthScore.min).toBe(0);
expect(scenario.expectedHealthScore.max).toBe(0);
expect(scenario.metrics.modules.accommodation).toBeUndefined();
expect(scenario.metrics.modules.fnb).toBeUndefined();
```

### Example 3: Test Boundary Conditions

```typescript
// Test all three boundary thresholds
['boundary_80', 'boundary_60', 'boundary_40'].forEach(type => {
  const scenario = generateDecisionEngineScenario(type);
  
  // Verify score is near the boundary
  const threshold = parseInt(type.split('_')[1]);
  expect(scenario.expectedHealthScore.min).toBeLessThanOrEqual(threshold + 2);
  expect(scenario.expectedHealthScore.max).toBeGreaterThanOrEqual(threshold - 2);
});
```

## Running Tests

```bash
# Run all scenario tests
npm test decision-engine-scenarios

# Run specific test
npm test -- --grep "Healthy Branch"

# Watch mode
npm run test:watch
```
