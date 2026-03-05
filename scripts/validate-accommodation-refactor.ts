/**
 * Validation Script for Accommodation Monitoring Refactor
 * 
 * Tests all parts of the refactored system:
 * - PART 2: Intelligence Engine (5 alert types)
 * - PART 3: Confidence System
 * - PART 4: Health Score Simplification
 * - PART 5: Recommendation Engine
 * - PART 7: Simulation Engine
 * - PART 8: System Behavior Guarantee
 */

import { runAllSimulations } from '../apps/web/app/services/accommodation-simulation-engine';
import { getSafeAccommodationResult, validateSafeResult } from '../apps/web/app/services/accommodation-safe-wrapper';
import type { DailyMetric } from '../apps/web/app/models/daily-metrics';

console.log('='.repeat(60));
console.log('ACCOMMODATION MONITORING REFACTOR - VALIDATION');
console.log('='.repeat(60));
console.log('');

// Test branch ID
const testBranchId = 'br-test-001';

console.log('PART 7: Simulation Engine Validation');
console.log('-'.repeat(60));

const simulationResults = runAllSimulations(testBranchId);

console.log('\nHealthy Scenario:');
console.log(`  Health Score: ${simulationResults.healthy.healthScore}`);
console.log(`  Alerts: ${simulationResults.healthy.alertCount} (expected ${simulationResults.healthy.expectedAlertRange.min}-${simulationResults.healthy.expectedAlertRange.max})`);
console.log(`  ${simulationResults.healthy.validation.message}`);

console.log('\nStressed Scenario:');
console.log(`  Health Score: ${simulationResults.stressed.healthScore}`);
console.log(`  Alerts: ${simulationResults.stressed.alertCount} (expected ${simulationResults.stressed.expectedAlertRange.min}-${simulationResults.stressed.expectedAlertRange.max})`);
console.log(`  ${simulationResults.stressed.validation.message}`);

console.log('\nCrisis Scenario:');
console.log(`  Health Score: ${simulationResults.crisis.healthScore}`);
console.log(`  Alerts: ${simulationResults.crisis.alertCount} (expected ${simulationResults.crisis.expectedAlertRange.min}-${simulationResults.crisis.expectedAlertRange.max})`);
console.log(`  ${simulationResults.crisis.validation.message}`);

console.log('\nSummary:');
console.log(`  All Passed: ${simulationResults.summary.allPassed ? '✓' : '✗'}`);
console.log(`  Total Alerts: ${simulationResults.summary.totalAlerts}`);

console.log('\n' + '='.repeat(60));
console.log('PART 8: System Behavior Guarantee');
console.log('-'.repeat(60));

// Test with empty metrics
console.log('\nTest 1: Empty metrics array');
const emptyResult = getSafeAccommodationResult([], testBranchId);
console.log(`  Health Score: ${emptyResult.healthScore} (should be 0-100)`);
console.log(`  Confidence: ${emptyResult.confidence.confidenceLevel}`);
console.log(`  Alerts: ${emptyResult.alerts.length} (should be >= 0)`);
console.log(`  Recommendations: ${emptyResult.recommendations.length} (should be <= 3)`);
console.log(`  Valid: ${validateSafeResult(emptyResult) ? '✓' : '✗'}`);

// Test with null metrics
console.log('\nTest 2: Null metrics');
const nullResult = getSafeAccommodationResult(null, testBranchId);
console.log(`  Health Score: ${nullResult.healthScore} (should be 0-100)`);
console.log(`  Confidence: ${nullResult.confidence.confidenceLevel}`);
console.log(`  Alerts: ${nullResult.alerts.length} (should be >= 0)`);
console.log(`  Recommendations: ${nullResult.recommendations.length} (should be <= 3)`);
console.log(`  Valid: ${validateSafeResult(nullResult) ? '✓' : '✗'}`);

// Test with undefined metrics
console.log('\nTest 3: Undefined metrics');
const undefinedResult = getSafeAccommodationResult(undefined, testBranchId);
console.log(`  Health Score: ${undefinedResult.healthScore} (should be 0-100)`);
console.log(`  Confidence: ${undefinedResult.confidence.confidenceLevel}`);
console.log(`  Alerts: ${undefinedResult.alerts.length} (should be >= 0)`);
console.log(`  Recommendations: ${undefinedResult.recommendations.length} (should be <= 3)`);
console.log(`  Valid: ${validateSafeResult(undefinedResult) ? '✓' : '✗'}`);

// Test with real simulation data
console.log('\nTest 4: Real simulation data (crisis scenario)');
const crisisMetrics: DailyMetric[] = simulationResults.crisis.metrics;
const crisisResult = getSafeAccommodationResult(crisisMetrics, testBranchId);
console.log(`  Health Score: ${crisisResult.healthScore} (should be 0-100)`);
console.log(`  Confidence: ${crisisResult.confidence.confidenceLevel} (${(crisisResult.confidence.coverageRatio * 100).toFixed(1)}%)`);
console.log(`  Alerts: ${crisisResult.alerts.length} (should be >= 0)`);
console.log(`  Recommendations: ${crisisResult.recommendations.length} (should be <= 3)`);
console.log(`  Valid: ${validateSafeResult(crisisResult) ? '✓' : '✗'}`);

console.log('\n' + '='.repeat(60));
console.log('VALIDATION COMPLETE');
console.log('='.repeat(60));

// Final validation
const allTestsPassed = 
  validateSafeResult(emptyResult) &&
  validateSafeResult(nullResult) &&
  validateSafeResult(undefinedResult) &&
  validateSafeResult(crisisResult) &&
  simulationResults.summary.allPassed;

if (allTestsPassed) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!');
  process.exit(1);
}
