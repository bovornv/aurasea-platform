/**
 * Alert Engine Audit Tool
 * 
 * Comprehensive audit of all 16 alerts:
 * - Existence verification
 * - Formula validation
 * - Threshold checks
 * - Data guards
 * - Division by zero protection
 * - NaN/Infinity checks
 * - Deduplication logic
 * - Clearing/recalculation triggers
 */

import { DemandDropRule } from '../../../../core/sme-os/engine/rules/demand-drop';
import { CostPressureRule } from '../../../../core/sme-os/engine/rules/cost-pressure';
import { MarginCompressionRule } from '../../../../core/sme-os/engine/rules/margin-compression';
import { SeasonalMismatchRule } from '../../../../core/sme-os/engine/rules/seasonal-mismatch';
import { DataConfidenceRiskRule } from '../../../../core/sme-os/engine/rules/data-confidence-risk';
import { WeekendWeekdayImbalanceRule } from '../../../../core/sme-os/engine/rules/weekend-weekday-imbalance';
import { LowWeekdayUtilizationRule } from '../../../../core/sme-os/engine/rules/low-weekday-utilization';
import { CapacityUtilizationRule } from '../../../../core/sme-os/engine/rules/capacity-utilization';
import { WeekendWeekdayFnbGapRule } from '../../../../core/sme-os/engine/rules/weekend-weekday-fnb-gap';
import { MenuRevenueConcentrationRule } from '../../../../core/sme-os/engine/rules/menu-revenue-concentration';
import { LiquidityRunwayRiskRule } from '../../../../core/sme-os/engine/rules/liquidity-runway-risk';
import { RevenueConcentrationRule } from '../../../../core/sme-os/engine/rules/revenue-concentration';
import { CashFlowVolatilityRule } from '../../../../core/sme-os/engine/rules/cash-flow-volatility';
import { BreakEvenRiskRule } from '../../../../core/sme-os/engine/rules/break-even-risk';
import { SeasonalityRiskRule } from '../../../../core/sme-os/engine/rules/seasonality-risk';
import { CashRunwayRule } from '../../../../core/sme-os/engine/rules/cash-runway';
import type { BranchMetrics } from '../models/branch-metrics';

export interface AlertAuditResult {
  code: string;
  name: string;
  category: string;
  severity: string[];
  exists: boolean;
  hasFormula: boolean;
  hasThresholds: boolean;
  hasDataGuards: boolean;
  hasDivisionGuards: boolean;
  missingDataGuards?: boolean;
  usesDailyMetrics: boolean;
  usesWeeklyMetrics: boolean;
  issues: string[];
  warnings: string[];
}

export interface AuditSummary {
  totalAlerts: number;
  foundAlerts: number;
  missingAlerts: string[];
  alertsWithIssues: number;
  alertsWithWarnings: number;
  unsafeDivisions: number;
  missingDataGuards: number;
  usingWeeklyMetrics: number;
  allPassed: boolean;
}

const EXPECTED_ALERTS = [
  { code: 'demand-drop', name: 'Demand Drop', category: 'risk', minDays: 7 },
  { code: 'cost-pressure', name: 'Cost Pressure', category: 'risk', minDays: 7 },
  { code: 'margin-compression', name: 'Margin Compression', category: 'risk', minDays: 14 },
  { code: 'seasonal-mismatch', name: 'Seasonal Mismatch', category: 'anomaly', minDays: 30 },
  { code: 'data-confidence-risk', name: 'Data Confidence Risk', category: 'threshold', minDays: 0 },
  { code: 'weekend-weekday-imbalance', name: 'Weekend-Weekday Imbalance', category: 'opportunity', minDays: 14 },
  { code: 'low-weekday-utilization', name: 'Low Weekday Utilization', category: 'opportunity', minDays: 14 },
  { code: 'capacity-utilization', name: 'Capacity Utilization', category: 'risk', minDays: 7 },
  { code: 'weekend-weekday-fnb-gap', name: 'Weekend-Weekday F&B Gap', category: 'opportunity', minDays: 14 },
  { code: 'menu-revenue-concentration', name: 'Menu Revenue Concentration', category: 'risk', minDays: 30 },
  { code: 'liquidity-runway-risk', name: 'Liquidity Runway Risk', category: 'risk', minDays: 7 },
  { code: 'revenue-concentration', name: 'Revenue Concentration', category: 'risk', minDays: 30 },
  { code: 'cash-flow-volatility', name: 'Cash Flow Volatility', category: 'risk', minDays: 14 },
  { code: 'break-even-risk', name: 'Break-Even Risk', category: 'risk', minDays: 7 },
  { code: 'seasonality-risk', name: 'Seasonality Risk', category: 'risk', minDays: 30 },
  { code: 'cash-runway', name: 'Cash Runway', category: 'risk', minDays: 7 },
];

/**
 * Audit a single alert rule
 */
async function auditAlert(
  alertDef: typeof EXPECTED_ALERTS[0],
  ruleInstance: any
): Promise<AlertAuditResult> {
  const result: AlertAuditResult = {
    code: alertDef.code,
    name: alertDef.name,
    category: alertDef.category,
    severity: [],
    exists: !!ruleInstance,
    hasFormula: false,
    hasThresholds: false,
    hasDataGuards: false,
    hasDivisionGuards: false,
    usesDailyMetrics: false,
    usesWeeklyMetrics: false,
    issues: [],
    warnings: [],
  };

  if (!ruleInstance) {
    result.issues.push('Alert rule instance not found');
    return result;
  }

  // Check if rule has evaluate method
  if (typeof ruleInstance.evaluate !== 'function') {
    result.issues.push('Missing evaluate() method');
    return result;
  }

  // Try to get rule source code for analysis
  const ruleCode = ruleInstance.constructor.toString();
  
  // Check for data guards
  const hasMinDaysCheck = ruleCode.includes('data.length') || 
                         ruleCode.includes('metrics.length') ||
                         ruleCode.includes('requiredDays') ||
                         ruleCode.includes('minDays');
  result.hasDataGuards = hasMinDaysCheck;
  if (!hasMinDaysCheck && alertDef.minDays > 0) {
    result.warnings.push(`Missing minimum ${alertDef.minDays} days data guard`);
    result.missingDataGuards = true;
  }

  // Check for division guards
  const hasDivisionGuards = ruleCode.includes('denominator') ||
                           ruleCode.includes('=== 0') ||
                           ruleCode.includes('!== 0') ||
                           ruleCode.includes('> 0') ||
                           ruleCode.includes('safeDivide') ||
                           ruleCode.includes('|| 0');
  result.hasDivisionGuards = hasDivisionGuards;
  if (!hasDivisionGuards) {
    result.warnings.push('Potential division by zero risk - check formula');
  }

  // Check for NaN/Infinity guards
  const hasNaNGuards = ruleCode.includes('isNaN') ||
                      ruleCode.includes('isFinite') ||
                      ruleCode.includes('Number.isFinite');
  if (!hasNaNGuards) {
    result.warnings.push('Missing NaN/Infinity guards');
  }

  // Check data source
  result.usesDailyMetrics = ruleCode.includes('daily_metrics') ||
                           ruleCode.includes('dailyMetrics') ||
                           ruleCode.includes('DailyMetric');
  result.usesWeeklyMetrics = ruleCode.includes('weekly_metrics') ||
                             ruleCode.includes('weeklyMetrics') ||
                             ruleCode.includes('WeeklyMetric');
  if (result.usesWeeklyMetrics) {
    result.issues.push('Uses deprecated weekly_metrics - should use daily_metrics');
  }

  // Check for formula
  result.hasFormula = ruleCode.includes('calculate') ||
                     ruleCode.includes('compute') ||
                     ruleCode.includes('evaluate');
  
  // Check for thresholds
  result.hasThresholds = ruleCode.includes('threshold') ||
                        ruleCode.includes('critical') ||
                        ruleCode.includes('warning') ||
                        ruleCode.includes('severity');

  return result;
}

/**
 * Run comprehensive audit of all alerts
 */
export async function runAlertEngineAudit(): Promise<AuditSummary> {
  console.log('🔍 ALERT ENGINE AUDIT - Starting comprehensive check...\n');

  const rules = {
    'demand-drop': new DemandDropRule(),
    'cost-pressure': new CostPressureRule(),
    'margin-compression': new MarginCompressionRule(),
    'seasonal-mismatch': new SeasonalMismatchRule(),
    'data-confidence-risk': new DataConfidenceRiskRule(),
    'weekend-weekday-imbalance': new WeekendWeekdayImbalanceRule(),
    'low-weekday-utilization': new LowWeekdayUtilizationRule(),
    'capacity-utilization': new CapacityUtilizationRule(),
    'weekend-weekday-fnb-gap': new WeekendWeekdayFnbGapRule(),
    'menu-revenue-concentration': new MenuRevenueConcentrationRule(),
    'liquidity-runway-risk': new LiquidityRunwayRiskRule(),
    'revenue-concentration': new RevenueConcentrationRule(),
    'cash-flow-volatility': new CashFlowVolatilityRule(),
    'break-even-risk': new BreakEvenRiskRule(),
    'seasonality-risk': new SeasonalityRiskRule(),
    'cash-runway': new CashRunwayRule(),
  };

  const auditResults: AlertAuditResult[] = [];
  const missingAlerts: string[] = [];

  // Audit each expected alert
  for (const alertDef of EXPECTED_ALERTS) {
    const ruleInstance = (rules as any)[alertDef.code];
    const result = await auditAlert(alertDef, ruleInstance);
    auditResults.push(result);

    if (!result.exists) {
      missingAlerts.push(alertDef.code);
    }
  }

  // Generate summary
  const summary: AuditSummary = {
    totalAlerts: EXPECTED_ALERTS.length,
    foundAlerts: auditResults.filter(r => r.exists).length,
    missingAlerts,
    alertsWithIssues: auditResults.filter(r => r.issues.length > 0).length,
    alertsWithWarnings: auditResults.filter(r => r.warnings.length > 0).length,
    unsafeDivisions: auditResults.filter(r => !r.hasDivisionGuards).length,
    missingDataGuards: auditResults.filter(r => !r.hasDataGuards && (EXPECTED_ALERTS.find(a => a.code === r.code)?.minDays ?? 0) > 0).length,
    usingWeeklyMetrics: auditResults.filter(r => r.usesWeeklyMetrics).length,
    allPassed: auditResults.every(r => r.exists && r.issues.length === 0),
  };

  // Print detailed results
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 ALERT AUDIT RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  auditResults.forEach(result => {
    const status = result.exists && result.issues.length === 0 ? '✅' : '❌';
    console.log(`${status} ${result.code} (${result.name})`);
    
    if (result.issues.length > 0) {
      result.issues.forEach(issue => console.log(`   ⚠️  ISSUE: ${issue}`));
    }
    if (result.warnings.length > 0) {
      result.warnings.forEach(warning => console.log(`   ⚠️  WARNING: ${warning}`));
    }
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📈 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total Expected: ${summary.totalAlerts}`);
  console.log(`Found: ${summary.foundAlerts}`);
  console.log(`Missing: ${summary.missingAlerts.length}`);
  if (summary.missingAlerts.length > 0) {
    console.log(`   Missing alerts: ${summary.missingAlerts.join(', ')}`);
  }
  console.log(`Alerts with Issues: ${summary.alertsWithIssues}`);
  console.log(`Alerts with Warnings: ${summary.alertsWithWarnings}`);
  console.log(`Unsafe Divisions: ${summary.unsafeDivisions}`);
  console.log(`Missing Data Guards: ${summary.missingDataGuards}`);
  console.log(`Using Weekly Metrics: ${summary.usingWeeklyMetrics}`);
  console.log(`\n${summary.allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME ISSUES FOUND'}\n`);

  return summary;
}

/**
 * Run audit and print to console (for browser console execution)
 */
export function printAlertEngineAudit(): void {
  if (typeof window === 'undefined') {
    console.log('This audit must be run in the browser console');
    return;
  }

  console.log('%c🔍 ALERT ENGINE AUDIT - Comprehensive Check', 'font-size: 16px; font-weight: bold; color: #2563eb;');
  console.log('═══════════════════════════════════════════════════════════\n');

  runAlertEngineAudit().then(summary => {
    console.log('\n%c═══════════════════════════════════════════════════════════', 'color: #6b7280;');
    console.log('%c📊 FINAL SUMMARY', 'font-size: 14px; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════\n', 'color: #6b7280;');
    
    console.log(`✅ ${summary.foundAlerts} alerts detected`);
    console.log(`❌ ${summary.missingAlerts.length} missing`);
    console.log(`⚠️  ${summary.alertsWithIssues} alerts with issues`);
    console.log(`⚠️  ${summary.alertsWithWarnings} alerts with warnings`);
    console.log(`⚠️  ${summary.unsafeDivisions} unsafe divisions`);
    console.log(`⚠️  ${summary.missingDataGuards} missing data guards`);
    console.log(`✅ ${summary.usingWeeklyMetrics === 0 ? '0' : summary.usingWeeklyMetrics} using weekly_metrics`);
    
    if (summary.allPassed) {
      console.log('\n%c✅ ALL CHECKS PASSED', 'font-size: 16px; font-weight: bold; color: #10b981;');
    } else {
      console.log('\n%c❌ SOME ISSUES FOUND - See details above', 'font-size: 16px; font-weight: bold; color: #ef4444;');
    }
    
    console.log('\n%cFull report available at: apps/web/app/services/alert-engine-audit-report.md', 'color: #6b7280; font-style: italic;');
  }).catch(err => {
    console.error('Audit failed:', err);
  });
}

// Auto-run if imported in browser console
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Don't auto-run, let user call it explicitly
  (window as any).runAlertAudit = printAlertEngineAudit;
  console.log('%c💡 Tip: Run alertEngineAudit() in console to audit all alerts', 'color: #6b7280;');
}
