/**
 * App-side alert validation runner — wires test cases to monitoring service.
 * Dev-only; does NOT affect production.
 */

import {
  runAlertValidation,
  runCrossScenarioValidation,
  formatValidationSummary,
  type AlertValidationResult,
  type AlertLike,
} from '../../../../lib/testing/run-alert-validation';
import {
  type AlertTestOverrideMetrics,
  SCENARIO_TEST_INPUTS,
} from '../../../../lib/testing/generate-alert-test-cases';
import { buildBranchMetricsFromOverride } from './alert-validation-adapter';
import { monitoringService } from '../services/monitoring-service';

const MINIMAL_SETUP = { isCompleted: true, businessType: 'hotel_resort' as const };

/**
 * Run alert validation for a branch type using the real monitoring service.
 */
export async function runAppAlertValidation(
  branchType: 'accommodation' | 'fnb'
): Promise<AlertValidationResult> {
  return runAlertValidation(branchType, (override) => runEvaluate(branchType, override));
}

/**
 * Run validation for both branch types plus cross-scenario (Healthy/Stressed/Crisis) and log summary.
 */
export async function runFullAlertValidation(): Promise<{
  accommodation: AlertValidationResult;
  fnb: AlertValidationResult;
  scenarioAcc: import('../../../../lib/testing/run-alert-validation').ScenarioTestResult;
  scenarioFnb: import('../../../../lib/testing/run-alert-validation').ScenarioTestResult;
  summary: string;
}> {
  const evaluateAcc = (override: AlertTestOverrideMetrics) =>
    runEvaluate('accommodation', override);
  const evaluateFnb = (override: AlertTestOverrideMetrics) =>
    runEvaluate('fnb', override);

  const [accommodation, fnb, scenarioAcc, scenarioFnb] = await Promise.all([
    runAlertValidation('accommodation', evaluateAcc),
    runAlertValidation('fnb', evaluateFnb),
    runCrossScenarioValidation('accommodation', evaluateAcc, SCENARIO_TEST_INPUTS.accommodation),
    runCrossScenarioValidation('fnb', evaluateFnb, SCENARIO_TEST_INPUTS.fnb),
  ]);

  const summary = formatValidationSummary(accommodation, fnb, scenarioAcc, scenarioFnb);
  if (typeof console !== 'undefined' && console.log) {
    console.log(summary);
  }
  return { accommodation, fnb, scenarioAcc, scenarioFnb, summary };
}

async function runEvaluate(
  branchType: 'accommodation' | 'fnb',
  override: AlertTestOverrideMetrics
): Promise<AlertLike[]> {
  const metrics = buildBranchMetricsFromOverride(branchType, override);
  const result = await monitoringService.evaluate(
    MINIMAL_SETUP as any,
    undefined,
    undefined,
    metrics
  );
  return (result.alerts || []).map((a) => ({
    id: a.id,
    severity: a.severity,
    message: a.message,
    type: a.type,
    revenueImpact: (a as any).revenueImpact,
  }));
}
