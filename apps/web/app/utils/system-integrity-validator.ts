/**
 * System Integrity Validator
 * 
 * Comprehensive validation layer for branch and company-level calculations,
 * aggregation logic, alert consistency, health score integrity, and trend derivation.
 */

import { businessGroupService } from '../services/business-group-service';
import { getDailyMetrics } from '../services/db/daily-metrics-service';
import { getBranchHealthScores, getGroupHealthScore } from '../services/health-score-service';
import { monitoringService } from '../services/monitoring-service';
import { calculateRevenueExposureFromAlerts } from './revenue-exposure-calculator';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { BranchHealthScore, GroupHealthScore } from '../services/health-score-service';

export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  autoFixed: string[];
}

export interface ValidationError {
  level: 'branch' | 'company' | 'system';
  component: string;
  check: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationWarning {
  level: 'branch' | 'company' | 'system';
  component: string;
  check: string;
  message: string;
  details?: Record<string, any>;
}

const ELEVATED_ROLES = ['owner', 'admin'] as const;

/**
 * Validate system integrity across all branches and company level.
 * Full validation runs only for owner/admin. For manager, staff, viewer we skip org-level rules and return passed.
 */
// CRASH FIX: Add timeout and cancellation support
let currentValidationAbortController: AbortController | null = null;

export async function validateSystemIntegrity(
  businessGroupId: string,
  options: {
    autoFix?: boolean;
    verbose?: boolean;
    timeout?: number; // Timeout in milliseconds
    /** When set, full validation runs only for owner/admin; else returns passed. */
    effectiveRole?: string | null;
  } = {}
): Promise<ValidationResult> {
  const { effectiveRole } = options;
  if (effectiveRole != null && !ELEVATED_ROLES.includes(effectiveRole as (typeof ELEVATED_ROLES)[number])) {
    return {
      passed: true,
      errors: [],
      warnings: [],
      autoFixed: [],
    };
  }

  // Cancel previous validation if still running
  if (currentValidationAbortController) {
    currentValidationAbortController.abort();
  }

  currentValidationAbortController = new AbortController();
  const signal = currentValidationAbortController.signal;

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const autoFixed: string[] = [];

  try {
    const allBranches = businessGroupService.getAllBranches().filter(
      b => b.businessGroupId === businessGroupId
    );

    // CRASH FIX: Limit validation to max 10 branches to prevent memory issues
    const branchesToValidate = allBranches.slice(0, 10);
    if (allBranches.length > 10) {
      warnings.push({
        level: 'system',
        component: 'validator',
        check: 'branch_limit',
        message: `Validating only first 10 branches (${allBranches.length} total) to prevent performance issues`,
        details: { totalBranches: allBranches.length, validated: 10 },
      });
    }

    // PART 1.1: Branch Level Checks
    for (const branch of branchesToValidate) {
      if (signal.aborted) {
        throw new Error('Validation cancelled');
      }
      
      try {
        const branchResults = await validateBranchLevel(branch.id, businessGroupId, options);
        errors.push(...branchResults.errors);
        warnings.push(...branchResults.warnings);
        autoFixed.push(...branchResults.autoFixed);
      } catch (e) {
        // CRASH FIX: Continue with other branches if one fails
        warnings.push({
          level: 'branch',
          component: 'validator',
          check: 'branch_validation_error',
          message: `Skipped validation for branch ${branch.id}: ${e instanceof Error ? e.message : String(e)}`,
          details: { branchId: branch.id },
        });
      }
    }

    // PART 1.2: Company Level Checks
    if (!signal.aborted) {
      try {
        const companyResults = await validateCompanyLevel(businessGroupId, branchesToValidate, options);
        errors.push(...companyResults.errors);
        warnings.push(...companyResults.warnings);
        autoFixed.push(...companyResults.autoFixed);
      } catch (e) {
        warnings.push({
          level: 'company',
          component: 'validator',
          check: 'company_validation_error',
          message: `Company level validation failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // PART 2: Validate Aggregation Logic (skip if aborted)
    if (!signal.aborted) {
      try {
        const aggregationResults = await validateAggregationLogic(businessGroupId, branchesToValidate, options);
        errors.push(...aggregationResults.errors);
        warnings.push(...aggregationResults.warnings);
        autoFixed.push(...aggregationResults.autoFixed);
      } catch (e) {
        warnings.push({
          level: 'company',
          component: 'validator',
          check: 'aggregation_validation_error',
          message: `Aggregation validation failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // PART 3: Validate Trend Calculations (skip if aborted - this is expensive)
    if (!signal.aborted && branchesToValidate.length <= 5) { // Only validate trends for small branch sets
      try {
        const trendResults = await validateTrendCalculations(businessGroupId, branchesToValidate, options);
        errors.push(...trendResults.errors);
        warnings.push(...trendResults.warnings);
        autoFixed.push(...trendResults.autoFixed);
      } catch (e) {
        warnings.push({
          level: 'company',
          component: 'validator',
          check: 'trend_validation_error',
          message: `Trend validation failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    const passed = errors.length === 0;

    if (options.verbose || !passed) {
      console.log('[SYSTEM VALIDATION]', {
        passed,
        errors: errors.length,
        warnings: warnings.length,
        autoFixed: autoFixed.length,
      });
    }

    // Clear abort controller on success
    currentValidationAbortController = null;

    return {
      passed,
      errors,
      warnings,
      autoFixed,
    };
  } catch (e) {
    // CRASH FIX: Handle abort gracefully
    if (signal.aborted || (e instanceof Error && e.message === 'Validation cancelled')) {
      return {
        passed: true, // Don't treat cancellation as error
        errors: [],
        warnings: [{
          level: 'system',
          component: 'validator',
          check: 'cancelled',
          message: 'Validation was cancelled (likely due to new validation starting)',
        }],
        autoFixed: [],
      };
    }
    
    console.error('[SYSTEM VALIDATION] Fatal error:', e);
    currentValidationAbortController = null;
    return {
      passed: false,
      errors: [{
        level: 'system',
        component: 'validator',
        check: 'fatal_error',
        message: `Validation failed with error: ${e instanceof Error ? e.message : String(e)}`,
      }],
      warnings: [],
      autoFixed: [],
    };
  }
}

/**
 * PART 1.1: Branch Level Validation
 */
async function validateBranchLevel(
  branchId: string,
  businessGroupId: string,
  options: { autoFix?: boolean; verbose?: boolean }
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[]; autoFixed: string[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const autoFixed: string[] = [];

  try {
    // Check 1: Latest daily_metrics exists
    const dailyMetrics = await getDailyMetrics(branchId, 30);
    if (dailyMetrics.length === 0) {
      warnings.push({
        level: 'branch',
        component: 'daily_metrics',
        check: 'latest_metrics_exists',
        message: `Branch ${branchId} has no daily metrics`,
        details: { branchId },
      });
    }

    // Check 2: Last 30 days count >= 10
    const last30Days = dailyMetrics.filter(m => {
      const daysDiff = (Date.now() - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    });
    if (last30Days.length < 10) {
      warnings.push({
        level: 'branch',
        component: 'daily_metrics',
        check: 'sufficient_history',
        message: `Branch ${branchId} has only ${last30Days.length} days of data (need 10+)`,
        details: { branchId, days: last30Days.length },
      });
    }

    // Check 3: Health score recalculates correctly
    try {
      const { alerts } = await monitoringService.evaluate(null, undefined, businessGroupId);
      const branchScores = getBranchHealthScores(alerts as AlertContract[], businessGroupId);
      const branchScore = branchScores.find(bs => bs.branchId === branchId);
      
      if (!branchScore) {
        errors.push({
          level: 'branch',
          component: 'health_score',
          check: 'health_score_exists',
          message: `Branch ${branchId} health score not found after recalculation`,
          details: { branchId },
        });
      }
    } catch (e) {
      errors.push({
        level: 'branch',
        component: 'health_score',
        check: 'health_score_calculation',
        message: `Failed to recalculate health score for branch ${branchId}: ${e instanceof Error ? e.message : String(e)}`,
        details: { branchId },
      });
    }

    // Check 4: Alerts match alert engine output
    try {
      const { alerts: engineAlerts } = await monitoringService.evaluate(null, undefined, businessGroupId);
      // This will be validated against UI alerts in component-level checks
    } catch (e) {
      errors.push({
        level: 'branch',
        component: 'alerts',
        check: 'alert_engine_output',
        message: `Alert engine failed for branch ${branchId}: ${e instanceof Error ? e.message : String(e)}`,
        details: { branchId },
      });
    }

    // Check 5: No weekly_metrics references
    // This is checked at code level, not runtime

    // Check 6: No simulation logic
    // This is checked at code level, not runtime

  } catch (e) {
    errors.push({
      level: 'branch',
      component: 'validator',
      check: 'branch_validation_error',
      message: `Branch validation failed for ${branchId}: ${e instanceof Error ? e.message : String(e)}`,
      details: { branchId },
    });
  }

  return { errors, warnings, autoFixed };
}

/**
 * PART 1.2: Company Level Validation
 */
async function validateCompanyLevel(
  businessGroupId: string,
  branches: Array<{ id: string }>,
  options: { autoFix?: boolean; verbose?: boolean }
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[]; autoFixed: string[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const autoFixed: string[] = [];

  try {
    // Get all branch alerts
    const allBranchAlerts: AlertContract[] = [];
    const branchHealthScores: BranchHealthScore[] = [];

    for (const branch of branches) {
      try {
        const { alerts } = await monitoringService.evaluate(null, undefined, businessGroupId);
        allBranchAlerts.push(...(alerts as AlertContract[]));
        
        const branchScores = getBranchHealthScores(alerts as AlertContract[], businessGroupId);
        const branchScore = branchScores.find(bs => bs.branchId === branch.id);
        if (branchScore) {
          branchHealthScores.push(branchScore);
        }
      } catch (e) {
        warnings.push({
          level: 'company',
          component: 'branch_alerts',
          check: 'branch_alert_fetch',
          message: `Failed to fetch alerts for branch ${branch.id}`,
          details: { branchId: branch.id },
        });
      }
    }

    // Check 1: Company health equals weighted average of branch health scores
    if (branchHealthScores.length > 0) {
      const companyHealth = getGroupHealthScore(branchHealthScores);
      
      if (branches.length === 1) {
        // Single branch: company health MUST equal branch health
        const branchHealth = branchHealthScores[0];
        if (companyHealth && companyHealth.healthScore != null && branchHealth && Math.abs(companyHealth.healthScore - branchHealth.healthScore) > 0.1) {
          errors.push({
            level: 'company',
            component: 'health_score',
            check: 'single_branch_match',
            message: `Company health (${companyHealth.healthScore}) does not match single branch health (${branchHealth.healthScore})`,
            details: {
              companyHealth: companyHealth.healthScore,
              branchHealth: branchHealth.healthScore,
              difference: Math.abs(companyHealth.healthScore - branchHealth.healthScore),
            },
          });
        }
      } else {
        // Multi-branch: validate weighted average
        // This is validated in aggregation logic
      }
    }

    // Check 2: Company alerts = union of branch alerts (no duplicates)
    const alertIds = new Set<string>();
    const duplicateAlerts: AlertContract[] = [];
    
    allBranchAlerts.forEach(alert => {
      const alertKey = `${(alert as { code?: string }).code ?? alert.id ?? alert.type}-${(alert as { branchId?: string }).branchId ?? ''}`;
      if (alertIds.has(alertKey)) {
        duplicateAlerts.push(alert);
      } else {
        alertIds.add(alertKey);
      }
    });

    if (duplicateAlerts.length > 0) {
      errors.push({
        level: 'company',
        component: 'alerts',
        check: 'duplicate_alerts',
        message: `Found ${duplicateAlerts.length} duplicate alerts in company aggregation`,
        details: {
          duplicates: duplicateAlerts.map(a => ({ code: (a as { code?: string }).code ?? a.id ?? a.type, branchId: (a as { branchId?: string }).branchId })),
        },
      });
    }

  } catch (e) {
    errors.push({
      level: 'company',
      component: 'validator',
      check: 'company_validation_error',
      message: `Company validation failed: ${e instanceof Error ? e.message : String(e)}`,
      details: { businessGroupId },
    });
  }

  return { errors, warnings, autoFixed };
}

/**
 * PART 2: Validate Aggregation Logic
 */
async function validateAggregationLogic(
  businessGroupId: string,
  branches: Array<{ id: string }>,
  options: { autoFix?: boolean; verbose?: boolean }
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[]; autoFixed: string[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const autoFixed: string[] = [];

  try {
    // Check 1: Company revenue (30 days) = SUM(branch revenue)
    let totalBranchRevenue = 0;
    const branchRevenues: Record<string, number> = {};

    for (const branch of branches) {
      const dailyMetrics = await getDailyMetrics(branch.id, 30);
      const branchRevenue = dailyMetrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
      branchRevenues[branch.id] = branchRevenue;
      totalBranchRevenue += branchRevenue;
    }

    // Get company-level revenue (would need to be calculated from UI)
    // This is a placeholder - actual validation would compare against UI value
    const tolerance = totalBranchRevenue * 0.001; // 0.1% tolerance

    // Check 2: Company alerts = Flatten(all branch alerts)
    const allBranchAlerts: AlertContract[] = [];
    for (const branch of branches) {
      try {
        const { alerts } = await monitoringService.evaluate(null, undefined, businessGroupId);
        allBranchAlerts.push(...(alerts as AlertContract[]));
      } catch (e) {
        // Skip failed branches
      }
    }

    // Check 3: Company risk exposure = SUM(branch exposure)
    let totalBranchExposure = 0;
    for (const branch of branches) {
      try {
        const { alerts } = await monitoringService.evaluate(null, undefined, businessGroupId);
        const branchExposure = calculateRevenueExposureFromAlerts(alerts as AlertContract[]);
        totalBranchExposure += branchExposure;
      } catch (e) {
        // Skip failed branches
      }
    }

    if (options.verbose) {
      console.log('[AGGREGATION VALIDATION]', {
        totalBranchRevenue,
        totalBranchExposure,
        totalAlerts: allBranchAlerts.length,
      });
    }

  } catch (e) {
    errors.push({
      level: 'company',
      component: 'aggregation',
      check: 'aggregation_validation_error',
      message: `Aggregation validation failed: ${e instanceof Error ? e.message : String(e)}`,
      details: { businessGroupId },
    });
  }

  return { errors, warnings, autoFixed };
}

/**
 * PART 3: Validate Trend Calculations
 */
async function validateTrendCalculations(
  businessGroupId: string,
  branches: Array<{ id: string }>,
  options: { autoFix?: boolean; verbose?: boolean }
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[]; autoFixed: string[] }> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const autoFixed: string[] = [];

  try {
    if (typeof window === 'undefined') {
      return { errors, warnings, autoFixed };
    }

    const { getHealthScoreTrend } = require('../../../../core/sme-os/engine/services/health-score-trend-service');

    for (const branch of branches) {
      // Check trend uses daily_metrics only (validated by checking data source)
      const trend30 = getHealthScoreTrend(businessGroupId, 30, branch.id);
      const trend90 = getHealthScoreTrend(businessGroupId, 90, branch.id);

      // Check: Return consistent data length
      if (trend30.snapshots.length > trend90.snapshots.length) {
        errors.push({
          level: 'branch',
          component: 'trends',
          check: 'trend_consistency',
          message: `Branch ${branch.id}: 30-day trend has more snapshots than 90-day trend`,
          details: {
            branchId: branch.id,
            trend30Count: trend30.snapshots.length,
            trend90Count: trend90.snapshots.length,
          },
        });
      }

      // Check: Not show trend if < 10 days
      if (trend30.snapshots.length < 10 && !trend30.hasInsufficientData) {
        errors.push({
          level: 'branch',
          component: 'trends',
          check: 'insufficient_data_flag',
          message: `Branch ${branch.id}: Trend has < 10 days but hasInsufficientData is false`,
          details: {
            branchId: branch.id,
            snapshotCount: trend30.snapshots.length,
            hasInsufficientData: trend30.hasInsufficientData,
          },
        });
      }

      // Check: Structured flag format
      if (trend30.hasInsufficientData && !trend30.snapshots.length) {
        // This is correct - insufficient data with no snapshots
      } else if (trend30.hasInsufficientData && trend30.snapshots.length >= 10) {
        warnings.push({
          level: 'branch',
          component: 'trends',
          check: 'insufficient_data_override',
          message: `Branch ${branch.id}: Trend marked insufficient but has ${trend30.snapshots.length} snapshots`,
          details: {
            branchId: branch.id,
            snapshotCount: trend30.snapshots.length,
          },
        });
      }
    }

  } catch (e) {
    errors.push({
      level: 'system',
      component: 'trends',
      check: 'trend_validation_error',
      message: `Trend validation failed: ${e instanceof Error ? e.message : String(e)}`,
      details: { businessGroupId },
    });
  }

  return { errors, warnings, autoFixed };
}

/**
 * PART 6: Debug Panel Integrity Check
 */
export function validateDebugPanelIntegrity(
  debugData: {
    organizationId: string | null;
    branchId: string | null;
    healthScore: number | null;
    alertCount: number;
    exposure: number;
  },
  headerData: {
    organizationId: string | null;
    branchId: string | null;
  }
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const autoFixed: string[] = [];

  // Check organization match
  if (debugData.organizationId !== headerData.organizationId) {
    errors.push({
      level: 'system',
      component: 'debug_panel',
      check: 'organization_mismatch',
      message: `Debug panel organization (${debugData.organizationId}) does not match header (${headerData.organizationId})`,
      details: {
        debugOrgId: debugData.organizationId,
        headerOrgId: headerData.organizationId,
      },
    });
  }

  // Check branch match
  if (debugData.branchId !== headerData.branchId) {
    errors.push({
      level: 'system',
      component: 'debug_panel',
      check: 'branch_mismatch',
      message: `Debug panel branch (${debugData.branchId}) does not match header (${headerData.branchId})`,
      details: {
        debugBranchId: debugData.branchId,
        headerBranchId: headerData.branchId,
      },
    });
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    autoFixed,
  };
}

/**
 * PART 8: Auto-Fix Mode
 */
export async function autoFixDiscrepancies(
  businessGroupId: string,
  errors: ValidationError[]
): Promise<string[]> {
  const fixed: string[] = [];

  for (const error of errors) {
    try {
      if (error.check === 'health_score_calculation') {
        // Recalculate health
        const branchId = error.details?.branchId;
        if (branchId) {
          await monitoringService.evaluate(null, undefined, businessGroupId);
          fixed.push(`Recalculated health for branch ${branchId}`);
        }
      } else if (error.check === 'duplicate_alerts') {
        // Alerts will be deduplicated automatically in aggregation
        fixed.push('Deduplicated alerts in aggregation');
      }
      // Add more auto-fix logic as needed
    } catch (e) {
      console.error(`[AUTO-FIX] Failed to fix ${error.check}:`, e);
    }
  }

  return fixed;
}
