/**
 * Alert Validation Test Runner
 * Programmatically validates all 16 alerts and recommendations for Accommodation and F&B.
 * Does NOT affect production — dev/test only.
 */

import {
  getTestCasesForBranchType,
  type AlertTestCase,
  type AlertTestOverrideMetrics,
  ALERT_TYPES,
} from './generate-alert-test-cases';

/** Minimal alert shape for validation (avoids coupling to core/app types). */
export interface AlertLike {
  id: string;
  severity: string;
  message?: string;
  type?: string;
  [key: string]: unknown;
}

/** Result of a single test case run. */
export interface AlertValidationCaseResult {
  name: string;
  passed: boolean;
  expectedAlerts: string[];
  triggeredAlerts: string[];
  severityOk: boolean;
  revenueImpactOk: boolean;
  recommendationOk: boolean;
  duplicateCheckOk: boolean;
  details?: string;
}

export interface AlertValidationResult {
  totalTests: number;
  passed: number;
  failed: number;
  failures: AlertValidationCaseResult[];
  branchType: 'accommodation' | 'fnb';
}

const VALID_SEVERITIES = ['informational', 'warning', 'critical'] as const;
const VALID_SEVERITIES_SET = new Set<string>(VALID_SEVERITIES);

/** Extract alert type from id (e.g. "liquidity-runway-risk-123" -> "liquidity-runway-risk"). */
function getAlertTypeFromId(id: string): string {
  const parts = id.split('-');
  const timestampPattern = /^\d+$/;
  const withoutTimestamp = parts.filter((p) => !timestampPattern.test(p));
  return withoutTimestamp.join('-') || id;
}

/** Check for duplicate alert types in list. */
function hasDuplicateAlerts(alerts: AlertLike[]): boolean {
  const types = alerts.map((a) => getAlertTypeFromId(a.id));
  return new Set(types).size !== types.length;
}

/** Recommendation map: alert type -> has non-empty recommendation. */
function checkRecommendation(alert: AlertLike): boolean {
  const msg = alert.message;
  if (msg === undefined || msg === null) return false;
  if (typeof msg !== 'string') return false;
  return msg.trim().length > 0;
}

/**
 * Run alert validation for a branch type.
 * @param branchType - 'accommodation' | 'fnb'
 * @param evaluate - Given override metrics, run the alert engine and return alerts (with branchId filtered if needed).
 */
export async function runAlertValidation(
  branchType: 'accommodation' | 'fnb',
  evaluate: (overrideMetrics: AlertTestOverrideMetrics) => Promise<AlertLike[]>
): Promise<AlertValidationResult> {
  const cases = getTestCasesForBranchType(branchType);
  const failures: AlertValidationCaseResult[] = [];
  let passed = 0;

  for (const tc of cases) {
    const result = await runOneCase(tc, evaluate);
    if (result.passed) {
      passed++;
    } else {
      failures.push(result);
    }
  }

  return {
    totalTests: cases.length,
    passed,
    failed: failures.length,
    failures,
    branchType,
  };
}

async function runOneCase(
  tc: AlertTestCase,
  evaluate: (overrideMetrics: AlertTestOverrideMetrics) => Promise<AlertLike[]>
): Promise<AlertValidationCaseResult> {
  let triggeredAlerts: AlertLike[] = [];
  try {
    triggeredAlerts = await evaluate(tc.overrideMetrics);
  } catch (e) {
    return {
      name: tc.name,
      passed: false,
      expectedAlerts: tc.expectedAlerts,
      triggeredAlerts: [],
      severityOk: false,
      revenueImpactOk: false,
      recommendationOk: false,
      duplicateCheckOk: false,
      details: `Evaluate threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const triggeredTypes = triggeredAlerts.map((a) => getAlertTypeFromId(a.id));
  const expectedSet = new Set(tc.expectedAlerts);
  const triggeredSet = new Set(triggeredTypes);

  const matchExpected =
    tc.expectedAlerts.length === triggeredTypes.length &&
    tc.expectedAlerts.every((e) => triggeredSet.has(e)) &&
    triggeredTypes.every((t) => expectedSet.has(t));

  let severityOk = true;
  let revenueImpactOk = true;
  let recommendationOk = true;

  for (const a of triggeredAlerts) {
    if (!VALID_SEVERITIES_SET.has(a.severity)) {
      severityOk = false;
    }
    const rev = (a as { revenueImpact?: number }).revenueImpact;
    if (rev !== undefined && rev !== null && (typeof rev !== 'number' || rev < 0 || Number.isNaN(rev))) {
      revenueImpactOk = false;
    }
    if (!checkRecommendation(a)) {
      recommendationOk = false;
    }
  }

  const duplicateCheckOk = !hasDuplicateAlerts(triggeredAlerts);
  const passed =
    matchExpected && severityOk && revenueImpactOk && recommendationOk && duplicateCheckOk;

  let details: string | undefined;
  if (!passed) {
    const parts: string[] = [];
    if (!matchExpected)
      parts.push(`expected [${tc.expectedAlerts.join(', ')}], got [${triggeredTypes.join(', ')}]`);
    if (!severityOk) parts.push('invalid severity');
    if (!revenueImpactOk) parts.push('revenueImpact NaN or < 0');
    if (!recommendationOk) parts.push('missing/empty recommendation');
    if (!duplicateCheckOk) parts.push('duplicate alerts');
    details = parts.join('; ');
  }

  return {
    name: tc.name,
    passed,
    expectedAlerts: tc.expectedAlerts,
    triggeredAlerts: triggeredTypes,
    severityOk,
    revenueImpactOk,
    recommendationOk,
    duplicateCheckOk,
    details,
  };
}

/** Cross-scenario test: Healthy / Stressed / Crisis — ensures Healthy has 0 critical, Stressed has warnings, Crisis has ≥1 critical. */
export interface ScenarioTestInput {
  healthy: AlertTestOverrideMetrics;
  stressed: AlertTestOverrideMetrics;
  crisis: AlertTestOverrideMetrics;
}

export interface ScenarioTestResult {
  healthy: { criticalCount: number; passed: boolean };
  stressed: { warningOrCritical: number; passed: boolean };
  crisis: { criticalCount: number; passed: boolean };
  allPassed: boolean;
}

export async function runCrossScenarioValidation(
  branchType: 'accommodation' | 'fnb',
  evaluate: (overrideMetrics: AlertTestOverrideMetrics) => Promise<AlertLike[]>,
  scenarioInputs: ScenarioTestInput
): Promise<ScenarioTestResult> {
  const [healthyAlerts, stressedAlerts, crisisAlerts] = await Promise.all([
    evaluate(scenarioInputs.healthy),
    evaluate(scenarioInputs.stressed),
    evaluate(scenarioInputs.crisis),
  ]);

  const critical = (arr: AlertLike[]) =>
    arr.filter((a) => a.severity === 'critical').length;
  const warningOrCritical = (arr: AlertLike[]) =>
    arr.filter((a) => a.severity === 'warning' || a.severity === 'critical').length;

  const healthyCritical = critical(healthyAlerts);
  const stressedWarn = warningOrCritical(stressedAlerts);
  const crisisCritical = critical(crisisAlerts);

  const healthyPassed = healthyCritical === 0;
  const stressedPassed = stressedWarn > 0;
  const crisisPassed = crisisCritical >= 1;

  return {
    healthy: { criticalCount: healthyCritical, passed: healthyPassed },
    stressed: { warningOrCritical: stressedWarn, passed: stressedPassed },
    crisis: { criticalCount: crisisCritical, passed: crisisPassed },
    allPassed: healthyPassed && stressedPassed && crisisPassed,
  };
}

/** Format validation result for console. */
export function formatValidationSummary(
  accommodation: AlertValidationResult,
  fnb: AlertValidationResult,
  scenarioAcc?: ScenarioTestResult,
  scenarioFnb?: ScenarioTestResult
): string {
  const lines: string[] = [
    '',
    'ALERT VALIDATION RESULTS',
    '========================',
    `Accommodation: ${accommodation.passed}/${accommodation.totalTests} passed`,
    `F&B: ${fnb.passed}/${fnb.totalTests} passed`,
  ];
  if (scenarioAcc || scenarioFnb) {
    lines.push('', 'Cross-scenario:');
    if (scenarioAcc) {
      lines.push(
        `  [Accommodation] Healthy: ${scenarioAcc.healthy.passed ? '✓' : '✗'} (critical: ${scenarioAcc.healthy.criticalCount}) | Stressed: ${scenarioAcc.stressed.passed ? '✓' : '✗'} | Crisis: ${scenarioAcc.crisis.passed ? '✓' : '✗'} (critical: ${scenarioAcc.crisis.criticalCount})`
      );
    }
    if (scenarioFnb) {
      lines.push(
        `  [F&B] Healthy: ${scenarioFnb.healthy.passed ? '✓' : '✗'} (critical: ${scenarioFnb.healthy.criticalCount}) | Stressed: ${scenarioFnb.stressed.passed ? '✓' : '✗'} | Crisis: ${scenarioFnb.crisis.passed ? '✓' : '✗'} (critical: ${scenarioFnb.crisis.criticalCount})`
      );
    }
  }
  if (accommodation.failed > 0 || fnb.failed > 0) {
    lines.push('', '--- Failures ---');
    for (const f of accommodation.failures) {
      lines.push(`[Accommodation] ${f.name}: ${f.details ?? 'unknown'}`);
    }
    for (const f of fnb.failures) {
      lines.push(`[F&B] ${f.name}: ${f.details ?? 'unknown'}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
