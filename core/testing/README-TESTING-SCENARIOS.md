# Testing Decision Engine Scenarios

This guide explains how to test the decision engine using the scenario fixtures.

## Quick Start

```typescript
import { generateDecisionEngineScenario } from '@/core/testing/decision-engine-fixtures';
import { monitoringService } from '@/apps/web/app/services/monitoring-service';
import { getHealthScoreHierarchy } from '@/apps/web/app/services/health-score-service';

// Generate a scenario
const scenario = generateDecisionEngineScenario('healthy');

// Test through monitoring service
const result = await monitoringService.evaluate(setup, {
  businessType: 'hotel_with_fnb',
  scenario: 'good',
  version: '1.0',
});
```

## Available Scenarios

### Core Scenarios
1. **`healthy`** - Healthy Branch (Low Risk)
2. **`margin`** - Margin Compression Case
3. **`capacity`** - Capacity Underutilization Case
4. **`cash`** - Cash Runway Risk Case
5. **`fnb_concentration`** - F&B Revenue Concentration Case
6. **`missing`** - Missing Data Case
7. **`corrupted`** - Extreme NaN Case

### Edge Case Scenarios
8. **`boundary_80`** - Health score exactly at 80 (Healthy/Stable boundary)
9. **`boundary_60`** - Health score exactly at 60 (Stable/At Risk boundary)
10. **`boundary_40`** - Health score exactly at 40 (At Risk/Critical boundary)
11. **`zero_values`** - Valid zeros (not missing, but actually zero)
12. **`max_penalty`** - Multiple critical alerts pushing score to minimum (20)
13. **`partial_module`** - Only accommodation module, no F&B data
14. **`stale_data`** - Very old data (beyond freshness threshold)
15. **`extreme_values`** - Very high but valid values (large numbers)
16. **`multiple_issues`** - Multiple different alert types triggering simultaneously

## Testing Methods

### Method 1: Unit Testing with Vitest

Run the test suite:

```bash
npm test decision-engine-scenarios
```

The test file (`decision-engine-scenarios.test.ts`) includes:
- Scenario generation validation
- Health score calculation tests
- Alert expectation validation
- Edge case handling
- NaN/invalid value safety tests

### Method 2: Integration Testing

Test through the full monitoring pipeline:

```typescript
import { generateDecisionEngineScenario } from '@/core/testing/decision-engine-fixtures';
import { operationalSignalsService } from '@/apps/web/app/services/operational-signals-service';
import { monitoringService } from '@/apps/web/app/services/monitoring-service';
import { getHealthScoreHierarchy } from '@/apps/web/app/services/health-score-service';

async function testScenario(scenarioType: string) {
  // 1. Generate scenario
  const scenario = generateDecisionEngineScenario(scenarioType);
  
  // 2. Save metrics to operational signals service
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
  
  // 4. Calculate health score
  const healthScore = getHealthScoreHierarchy(
    alerts,
    scenario.metrics.groupId
  );
  
  // 5. Validate expectations
  expect(healthScore.healthScore).toBeGreaterThanOrEqual(
    scenario.expectedHealthScore.min
  );
  expect(healthScore.healthScore).toBeLessThanOrEqual(
    scenario.expectedHealthScore.max
  );
  
  // Count alerts by severity
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  
  expect(criticalCount).toBe(scenario.expectedAlerts.critical);
  expect(warningCount).toBe(scenario.expectedAlerts.warning);
  
  return { alerts, healthScore, scenario };
}
```

### Method 3: Manual Testing in Browser

1. **Open the app in development mode**
2. **Open browser console**
3. **Run test script:**

```javascript
// Import the fixture generator (if available in browser context)
// Or use the test mode selector in the UI

// Navigate to branch overview page
// The monitoring service will automatically evaluate using current metrics
```

### Method 4: Programmatic Testing Script

Create a test script (`scripts/test-scenarios.ts`):

```typescript
import { generateAllScenarios } from '@/core/testing/decision-engine-fixtures';
import { monitoringService } from '@/apps/web/app/services/monitoring-service';
import { getHealthScoreHierarchy } from '@/apps/web/app/services/health-score-service';

async function runAllScenarios() {
  const scenarios = generateAllScenarios();
  
  for (const scenario of scenarios) {
    console.log(`\n=== Testing: ${scenario.description} ===`);
    
    try {
      // Save metrics
      operationalSignalsService.saveMetrics(scenario.metrics);
      
      // Evaluate
      const { alerts } = await monitoringService.evaluate(setup, {
        businessType: 'hotel_with_fnb',
        scenario: 'good',
        version: '1.0',
      });
      
      // Calculate health score
      const healthScore = getHealthScoreHierarchy(
        alerts,
        scenario.metrics.groupId
      );
      
      // Validate
      const passed = 
        healthScore.healthScore >= scenario.expectedHealthScore.min &&
        healthScore.healthScore <= scenario.expectedHealthScore.max;
      
      console.log(`Health Score: ${healthScore.healthScore} (expected: ${scenario.expectedHealthScore.min}-${scenario.expectedHealthScore.max})`);
      console.log(`Alerts: ${alerts.length} (expected: ${scenario.expectedAlerts.critical} critical, ${scenario.expectedAlerts.warning} warning)`);
      console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      
    } catch (error) {
      console.error(`❌ ERROR: ${error.message}`);
    }
  }
}

runAllScenarios();
```

## Testing Specific Scenarios

### Test Healthy Branch

```typescript
const healthy = generateDecisionEngineScenario('healthy');

// Expected:
// - Health score: 85-100
// - No critical alerts
// - Revenue exposure < 3%
```

### Test Margin Compression

```typescript
const margin = generateDecisionEngineScenario('margin');

// Expected:
// - Health score: 60-75
// - Critical margin compression alert
// - Revenue exposure: 150K-200K THB
```

### Test Cash Runway Risk

```typescript
const cash = generateDecisionEngineScenario('cash');

// Expected:
// - Health score: 20-50
// - Critical cash runway alert
// - High impact weighting
```

### Test Missing Data

```typescript
const missing = generateDecisionEngineScenario('missing');

// Expected:
// - Health score: 0
// - Confidence: 0
// - No crashes
```

### Test Corrupted Data

```typescript
const corrupted = generateDecisionEngineScenario('corrupted');

// Expected:
// - No crashes
// - safeNumber applied
// - Status: insufficient_data
```

## Validating Results

### Health Score Validation

```typescript
const healthScore = getHealthScoreHierarchy(alerts, groupId);

// Check score is valid
expect(healthScore.healthScore).toBeGreaterThanOrEqual(0);
expect(healthScore.healthScore).toBeLessThanOrEqual(100);
expect(Number.isNaN(healthScore.healthScore)).toBe(false);

// Check score matches expectations
expect(healthScore.healthScore).toBeGreaterThanOrEqual(
  scenario.expectedHealthScore.min
);
expect(healthScore.healthScore).toBeLessThanOrEqual(
  scenario.expectedHealthScore.max
);
```

### Alert Validation

```typescript
// Count alerts by severity
const criticalAlerts = alerts.filter(a => a.severity === 'critical');
const warningAlerts = alerts.filter(a => a.severity === 'warning');
const infoAlerts = alerts.filter(a => a.severity === 'informational');

// Validate counts
expect(criticalAlerts.length).toBe(scenario.expectedAlerts.critical);
expect(warningAlerts.length).toBe(scenario.expectedAlerts.warning);
expect(infoAlerts.length).toBe(scenario.expectedAlerts.informational);

// Validate alert structure
alerts.forEach(alert => {
  expect(alert.id).toBeDefined();
  expect(alert.severity).toBeOneOf(['critical', 'warning', 'informational']);
  expect(alert.message).toBeDefined();
  expect(alert.confidence).toBeGreaterThanOrEqual(0);
  expect(alert.confidence).toBeLessThanOrEqual(1);
});
```

### Revenue Exposure Validation

```typescript
if (scenario.expectedRevenueExposure) {
  // Calculate total revenue impact from alerts
  const totalRevenueImpact = alerts.reduce((sum, alert) => {
    const extended = alert as ExtendedAlertContract;
    return sum + (extended.revenueImpact || 0);
  }, 0);
  
  expect(totalRevenueImpact).toBeGreaterThanOrEqual(
    scenario.expectedRevenueExposure.min
  );
  expect(totalRevenueImpact).toBeLessThanOrEqual(
    scenario.expectedRevenueExposure.max
  );
}
```

## Edge Cases

### Testing NaN Handling

```typescript
const corrupted = generateDecisionEngineScenario('corrupted');

// All values should be handled safely
const safeCash = safeNumber(corrupted.metrics.financials.cashBalanceTHB, 0);
expect(Number.isNaN(safeCash)).toBe(false);
expect(isFinite(safeCash)).toBe(true);
```

### Testing Missing Data

```typescript
const missing = generateDecisionEngineScenario('missing');

// Should not crash
expect(() => {
  const healthScore = getHealthScoreHierarchy([], missing.metrics.groupId);
  expect(healthScore.healthScore).toBe(0);
}).not.toThrow();
```

## Running Tests

### Run All Scenario Tests

```bash
npm test decision-engine-scenarios
```

### Run Specific Scenario Test

```bash
npm test -- --grep "Healthy Branch"
```

### Watch Mode

```bash
npm run test:watch
```

## Best Practices

1. **Always validate health scores are 0-100**
2. **Check for NaN/undefined values**
3. **Verify alert counts match expectations**
4. **Test edge cases (missing data, corrupted data)**
5. **Use safeNumber utilities for all numeric operations**
6. **Clear localStorage between tests**
7. **Test both individual scenarios and batch scenarios**

## Troubleshooting

### Health Score Not Matching Expectations

- Check if alerts are being generated correctly
- Verify metrics are saved properly
- Ensure all required fields are present

### Alerts Not Appearing

- Check alert dependencies are satisfied
- Verify monitoring service is evaluating correctly
- Check alert suppression settings

### NaN Errors

- Use safeNumber utilities
- Check for corrupted data scenarios
- Validate all inputs before calculations

## Example: Complete Test Flow

```typescript
import { generateDecisionEngineScenario } from '@/core/testing/decision-engine-fixtures';
import { operationalSignalsService } from '@/apps/web/app/services/operational-signals-service';
import { monitoringService } from '@/apps/web/app/services/monitoring-service';
import { getHealthScoreHierarchy } from '@/apps/web/app/services/health-score-service';
import { safeNumber } from '@/apps/web/app/utils/safe-number';

describe('Complete Scenario Test', () => {
  it('should process healthy branch scenario correctly', async () => {
    // 1. Generate scenario
    const scenario = generateDecisionEngineScenario('healthy');
    
    // 2. Validate metrics structure
    expect(scenario.metrics.branchId).toBeDefined();
    expect(scenario.metrics.financials).toBeDefined();
    
    // 3. Save metrics
    operationalSignalsService.saveMetrics(scenario.metrics);
    
    // 4. Run monitoring
    const setup = { isCompleted: true, /* ... */ };
    const { alerts } = await monitoringService.evaluate(setup, {
      businessType: 'hotel_with_fnb',
      scenario: 'good',
      version: '1.0',
    });
    
    // 5. Calculate health score
    const healthScore = getHealthScoreHierarchy(
      alerts,
      scenario.metrics.groupId
    );
    
    // 6. Validate results
    expect(healthScore.healthScore).toBeGreaterThanOrEqual(85);
    expect(healthScore.healthScore).toBeLessThanOrEqual(100);
    expect(alerts.filter(a => a.severity === 'critical').length).toBe(0);
    
    // 7. Verify no NaN values
    expect(Number.isNaN(healthScore.healthScore)).toBe(false);
    expect(Number.isNaN(healthScore.confidence)).toBe(false);
  });
});
```
