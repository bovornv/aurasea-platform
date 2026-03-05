/**
 * Health Improvement Calculator
 * 
 * Calculates projected health score improvement from revenue recovery.
 * Used for Action → Impact Projection.
 */

import type { BranchMetrics } from '../../../../apps/web/app/models/branch-metrics';
import type { ExtendedAlertContract } from '../../../../apps/web/app/services/monitoring-service';

// Import safe number utilities (using dynamic require to avoid circular deps)
let safeNumber: (value: unknown, fallback?: number) => number;
let safeDivide: (numerator: unknown, denominator: unknown, fallback?: number) => number;
let safeClamp: (value: unknown, min?: number, max?: number) => number;

try {
  const safeNumberUtils = require('../../../../apps/web/app/utils/safe-number');
  safeNumber = safeNumberUtils.safeNumber;
  safeDivide = safeNumberUtils.safeDivide;
  safeClamp = safeNumberUtils.safeClamp;
} catch (e) {
  // Fallback implementations if utils not available
  safeNumber = (value: unknown, fallback: number = 0): number => {
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value;
    const parsed = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
    return (!isNaN(parsed) && isFinite(parsed)) ? parsed : fallback;
  };
  safeDivide = (num: unknown, den: unknown, fallback: number = 0): number => {
    const n = safeNumber(num, 0);
    const d = safeNumber(den, 0);
    return d === 0 ? fallback : (isNaN(n / d) ? fallback : n / d);
  };
  safeClamp = (value: unknown, min: number = 0, max: number = 100): number => {
    const num = safeNumber(value, min);
    return Math.max(min, Math.min(max, num));
  };
}

export interface HealthImprovementResult {
  revenueRecovered: number; // Revenue recovery in THB/month
  healthScoreIncrease: number; // Health score increase (0-100)
}

/**
 * Calculate health improvement from revenue recovery
 * 
 * Formula:
 * - healthScoreIncrease = (revenueRecovered / monthlyRevenue) * 100
 * 
 * @param branchMetrics - Branch metrics containing financial data
 * @param revenueRecovered - Projected revenue recovery in THB/month
 * @returns HealthImprovementResult with recovery and score increase
 */
export function calculateHealthImprovement(
  branchMetrics: BranchMetrics,
  revenueRecovered: number
): HealthImprovementResult {
  // Defensive: Handle invalid inputs
  if (!branchMetrics) {
    return {
      revenueRecovered: 0,
      healthScoreIncrease: 0,
    };
  }
  
  const safeRecovery = safeNumber(revenueRecovered, 0);
  
  // If no recovery, return zero improvement
  if (safeRecovery <= 0) {
    return {
      revenueRecovered: 0,
      healthScoreIncrease: 0,
    };
  }
  
  // Calculate monthly revenue
  const monthlyRevenue = safeNumber(branchMetrics.financials.revenueLast30DaysTHB, 0);
  
  // If no revenue, return zero improvement
  if (monthlyRevenue <= 0) {
    return {
      revenueRecovered: safeRecovery,
      healthScoreIncrease: 0,
    };
  }
  
  // Calculate health score increase
  // Formula: (revenueRecovered / monthlyRevenue) * 100
  const recoveryRatio = safeDivide(safeRecovery, monthlyRevenue, 0);
  const healthScoreIncrease = safeClamp(safeNumber(recoveryRatio * 100, 0), 0, 100);
  
  return {
    revenueRecovered: Math.round(safeRecovery * 100) / 100, // Round to 2 decimals
    healthScoreIncrease: Math.round(healthScoreIncrease * 10) / 10, // Round to 1 decimal
  };
}

/**
 * Attach health improvement projection to alert
 * 
 * @param alert - Alert with revenue impact
 * @param branchMetrics - Branch metrics for calculation
 * @returns Alert with projectedRecovery and projectedHealthIncrease
 */
export function attachHealthImprovement(
  alert: ExtendedAlertContract,
  branchMetrics: BranchMetrics
): ExtendedAlertContract {
  const revenueImpact = safeNumber(alert.revenueImpact, 0);
  
  if (revenueImpact <= 0) {
    return {
      ...alert,
      projectedRecovery: 0,
      projectedHealthIncrease: 0,
    };
  }
  
  const improvement = calculateHealthImprovement(branchMetrics, revenueImpact);
  
  return {
    ...alert,
    projectedRecovery: improvement.revenueRecovered,
    projectedHealthIncrease: improvement.healthScoreIncrease,
  };
}
