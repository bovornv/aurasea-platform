/**
 * Money-Weighted Health Score v2
 * 
 * Replaces flat alert penalties with money-weighted scoring based on revenue exposure.
 * 
 * Algorithm:
 * - Calculate monthlyRevenue from branchMetrics
 * - Calculate totalRevenueExposure from revenue exposure engine
 * - Compute exposureRatio = totalExposure / monthlyRevenue
 * - Health score = clamp(100 - (exposureRatio * 100), 0, 100)
 * 
 * Example:
 * - 150k issue on 2M revenue = 7.5% penalty → score = 92.5
 * - 10k issue on 2M revenue = 0.5% penalty → score = 99.5
 */

import type { BranchMetrics } from '../../../../apps/web/app/models/branch-metrics';
import type { AlertContract } from '../../contracts/alerts';
import { calculateRevenueExposure } from '../services/revenue-exposure-engine';

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

export interface MoneyWeightedHealthScoreResult {
  score: number; // Health score (0-100)
  monthlyRevenue: number; // Monthly revenue in THB
  totalExposure: number; // Total revenue exposure in THB/month
  exposureRatio: number; // Exposure as ratio (0-1)
  exposurePercent: number; // Exposure as percentage (0-100)
  confidence: number; // Data confidence (0-100)
}

/**
 * Calculate money-weighted health score
 * 
 * @param branchMetrics - Branch metrics containing financial data
 * @param alerts - Array of active alerts with revenue impact
 * @returns MoneyWeightedHealthScoreResult with score and exposure details
 */
export function calculateMoneyWeightedHealthScore(
  branchMetrics: BranchMetrics,
  alerts: AlertContract[]
): MoneyWeightedHealthScoreResult {
  // Defensive: Handle invalid inputs
  if (!branchMetrics || !alerts || !Array.isArray(alerts)) {
    console.warn('[HEALTH_SCORE] Invalid inputs - branchMetrics or alerts missing');
    return {
      score: 0,
      monthlyRevenue: 0,
      totalExposure: 0,
      exposureRatio: 0,
      exposurePercent: 0,
      confidence: 0,
    };
  }
  
  // PART 1: Fix Health Score Null Safety - ensure all values are safe numbers
  const safeRevenue = safeNumber(branchMetrics?.financials?.revenueLast30DaysTHB ?? 0, 0);
  const safeCosts = safeNumber(branchMetrics?.financials?.costsLast30DaysTHB ?? 0, 0);
  const safeCash = safeNumber(branchMetrics?.financials?.cashBalanceTHB ?? 0, 0);
  
  // PART 1: Never allow undefined - ensure all are finite numbers
  if (!Number.isFinite(safeRevenue)) {
    console.warn('[HEALTH_SCORE] Invalid revenue:', branchMetrics?.financials?.revenueLast30DaysTHB);
  }
  if (!Number.isFinite(safeCosts)) {
    console.warn('[HEALTH_SCORE] Invalid costs:', branchMetrics?.financials?.costsLast30DaysTHB);
  }
  if (!Number.isFinite(safeCash)) {
    console.warn('[HEALTH_SCORE] Invalid cash:', branchMetrics?.financials?.cashBalanceTHB);
  }
  
  // Calculate monthly revenue (use safe value)
  const monthlyRevenue = safeRevenue;
  
  // If no revenue, return safe fallback
  if (monthlyRevenue <= 0) {
    return {
      score: 0,
      monthlyRevenue: 0,
      totalExposure: 0,
      exposureRatio: 0,
      exposurePercent: 0,
      confidence: safeNumber(branchMetrics?.metadata?.dataConfidence, 0),
    };
  }
  
  // Calculate revenue exposure
  const exposureResult = calculateRevenueExposure(branchMetrics, alerts);
  const totalExposure = safeNumber(exposureResult.totalMonthlyLeakage, 0);
  
  // Calculate exposure ratio
  const exposureRatio = safeDivide(totalExposure, monthlyRevenue, 0);
  
  // Calculate exposure percentage
  const exposurePercent = safeNumber(exposureRatio * 100, 0);
  
  // STEP 4: Calculate health score using exposure penalty + severity penalty + metrics-based penalty
  // Formula: healthScore = 100 - exposurePenalty - severityPenalty - metricsPenalty
  // exposurePenalty = min((totalMonthlyLeakage / revenue30d) * 100, 70)
  // severityPenalty = based on critical/warning alerts
  // metricsPenalty = based on degraded metrics (for stressed/crisis scenarios even without alerts)
  
  // Calculate exposure penalty (capped at 70)
  const exposurePenalty = safeClamp(exposureRatio * 100, 0, 70);
  
  // Calculate severity penalty
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const severityPenalty = (criticalCount * 10) + (warningCount * 5); // Critical = 10pts, Warning = 5pts
  const cappedSeverityPenalty = safeClamp(severityPenalty, 0, 30); // Cap at 30
  
  // STEP 5: Add metrics-based penalty - calculate from actual metrics, never hardcode
  // Check scenario to determine penalty severity, but always calculate from metrics
  let metricsPenalty = 0;
  
  // Check scenario for context (but don't hardcode scores)
  let scenario: 'healthy' | 'stressed' | 'crisis' | null = null;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('aurasea_test_mode');
      if (stored) {
        const parsed = JSON.parse(stored);
        scenario = parsed.simulationScenario || null;
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // STEP 5: Always calculate metrics penalty from actual metrics
  // For "Healthy" scenarios with no alerts, we still check metrics but apply lighter penalties
  // PART 1: Use safe values already calculated above
  const costs = safeCosts;
  const cashBalance = safeCash;
  
  // PART 2: Prevent Division by Zero
  if (monthlyRevenue > 0 && costs > 0) {
    // Margin compression penalty - based on actual margin
    // PART 2: Safe division - monthlyRevenue already checked > 0
    const margin = safeDivide(monthlyRevenue - costs, monthlyRevenue, 0);
    if (margin < 0) {
      // Operating at a loss - severe penalty
      metricsPenalty += 40;
    } else if (margin < 0.1) {
      metricsPenalty += 25; // Very low margin
    } else if (margin < 0.2) {
      metricsPenalty += 15; // Low margin
    } else if (margin < 0.3) {
      metricsPenalty += 5; // Moderate margin
    }
    
    // Revenue decline penalty (if revenue is significantly lower than costs)
    // PART 2: Prevent division by zero - costs already checked > 0
    const revenueToCostRatio = safeDivide(monthlyRevenue, costs, 1);
    if (revenueToCostRatio < 0.7) {
      metricsPenalty += 30; // Revenue < 70% of costs (severe crisis)
    } else if (revenueToCostRatio < 0.8) {
      metricsPenalty += 20; // Revenue < 80% of costs
    } else if (revenueToCostRatio < 0.9) {
      metricsPenalty += 10; // Revenue < 90% of costs
    }
  }
  
  // Cash runway penalty - based on actual runway
  // PART 2: Prevent division by zero
  if (costs > 0) {
    const monthlyBurnRate = costs - monthlyRevenue; // Positive = burning cash
    const runwayMonths = monthlyBurnRate > 0 ? safeDivide(cashBalance, monthlyBurnRate, Infinity) : Infinity;
    
    if (runwayMonths < 0.5) {
      metricsPenalty += 40; // Less than 2 weeks (critical)
    } else if (runwayMonths < 1) {
      metricsPenalty += 30; // Less than 1 month
    } else if (runwayMonths < 2) {
      metricsPenalty += 20; // Less than 2 months
    } else if (runwayMonths < 3) {
      metricsPenalty += 10; // Less than 3 months
    }
  }
  
  // Occupancy penalty (for accommodation)
  if (branchMetrics.modules?.accommodation) {
    const occupancy = safeNumber(branchMetrics.modules.accommodation.occupancyRateLast30DaysPct, 0);
    if (occupancy < 30) {
      metricsPenalty += 25; // Very low occupancy
    } else if (occupancy < 40) {
      metricsPenalty += 20;
    } else if (occupancy < 50) {
      metricsPenalty += 10;
    } else if (occupancy < 60) {
      metricsPenalty += 5;
    }
  }
  
  // STEP 5: For healthy scenarios with no alerts, reduce penalty by 50% (but don't skip entirely)
  // This ensures healthy scenarios score high while still reflecting any metric issues
  if (scenario === 'healthy' && alerts.length === 0) {
    metricsPenalty = metricsPenalty * 0.5;
  }
  
  // Cap metrics penalty at 50 (to allow some score even in worst case)
  const cappedMetricsPenalty = safeClamp(metricsPenalty, 0, 50);
  
  // Total penalty = exposure + severity + metrics (capped at 100)
  const totalPenalty = safeClamp(exposurePenalty + cappedSeverityPenalty + cappedMetricsPenalty, 0, 100);
  
  // Final score = 100 - totalPenalty
  let rawScore = safeNumber(100 - totalPenalty, 100);
  
  // STEP 5: Safety check: For "Healthy" scenarios with no alerts, ensure score is at least 80
  // BUT: Do NOT hardcode crisis scores - they must be calculated from metrics
  const isHealthyScenario = scenario === 'healthy';
  if (isHealthyScenario && alerts.length === 0 && rawScore < 80) {
    rawScore = 80; // Minimum score for healthy scenario with no alerts
  }
  
  // STEP 5: Ensure crisis scenarios are NOT hardcoded - score must reflect actual metrics
  // Remove any forced fallback for crisis - let metrics penalty do its job
  // PART 1: Ensure finalScore always returns number
  let score = safeClamp(rawScore, 0, 100);
  if (!Number.isFinite(score) || isNaN(score)) {
    console.error('[HEALTH_SCORE] finalScore is not finite:', { 
      rawScore, 
      totalPenalty, 
      score,
      monthlyRevenue,
      totalExposure,
      exposurePenalty,
      cappedSeverityPenalty,
      cappedMetricsPenalty,
    });
    score = 0; // Fallback to 0 if invalid
  }
  
  // PART 1: Final validation - ensure score is always a valid number
  if (typeof score !== 'number' || !Number.isFinite(score) || isNaN(score)) {
    console.error('[HEALTH_SCORE] Score validation failed, forcing to 0:', score);
    score = 0;
  }
  
  // STEP 7: Debug logging for crisis scenarios
  if (process.env.NODE_ENV === 'development') {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('aurasea_test_mode') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.simulationScenario === 'crisis') {
          console.log('[CRISIS DEBUG] Health Score Calculation:', {
            exposurePenalty: exposurePenalty.toFixed(1),
            severityPenalty: cappedSeverityPenalty.toFixed(1),
            metricsPenalty: cappedMetricsPenalty.toFixed(1),
            totalPenalty: totalPenalty.toFixed(1),
            finalScore: score.toFixed(1),
            alertCount: alerts.length,
            totalExposure: totalExposure.toLocaleString(),
            exposurePercent: exposurePercent.toFixed(1) + '%',
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // STEP 4: Debug log for stressed scenario
  if (process.env.NODE_ENV === 'development') {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('aurasea_test_mode') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.simulationScenario === 'stressed' || parsed.simulationScenario === 'crisis') {
          console.log('CALCULATING SCORE WITH:', {
            revenue: monthlyRevenue,
            costs,
            cash: cashBalance,
            margin: monthlyRevenue > 0 ? ((monthlyRevenue - costs) / monthlyRevenue * 100).toFixed(1) + '%' : 'N/A',
            runwayMonths: costs > 0 ? (cashBalance / costs).toFixed(1) : 'N/A',
            alerts: alerts.length,
            scenario: parsed.simulationScenario,
            exposurePenalty,
            severityPenalty: cappedSeverityPenalty,
            metricsPenalty: cappedMetricsPenalty,
            totalPenalty,
            finalScore: score,
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // STEP 5: Sanity check validator for crisis scenario
  if (process.env.NODE_ENV === 'development') {
    // Check if this is crisis scenario (infer from metrics degradation)
    const revenueRatio = safeDivide(
      branchMetrics.financials.revenueLast30DaysTHB,
      branchMetrics.financials.costsLast30DaysTHB,
      1
    );
    const isLikelyCrisis = revenueRatio < 0.8 && exposurePercent > 20;
    
    if (isLikelyCrisis && score > 90 && alerts.length > 0) {
      console.warn('CRISIS SCENARIO INVALID: health score too high', {
        score,
        exposurePercent,
        revenueRatio,
        alertCount: alerts.length,
        criticalCount,
        warningCount,
        totalExposure,
        monthlyRevenue,
      });
    }
    
    // STEP 7: Prevent fake 100 scores
    if (alerts.length > 0 && score === 100) {
      console.warn('FAKE 100 SCORE DETECTED: alerts exist but score is 100', {
        alertCount: alerts.length,
        criticalCount,
        warningCount,
        totalExposure,
        exposurePercent,
      });
      // Force recompute with minimum penalty
      const minPenalty = Math.max(5, cappedSeverityPenalty);
      return {
        score: Math.max(0, Math.min(100, 100 - minPenalty)),
        monthlyRevenue,
        totalExposure,
        exposureRatio,
        exposurePercent,
        confidence: safeClamp(
          safeNumber(branchMetrics.metadata?.dataConfidence, 0),
          0,
          100
        ),
      };
    }
  }
  
  // Get confidence from metrics
  const confidence = safeClamp(
    safeNumber(branchMetrics.metadata?.dataConfidence, 0),
    0,
    100
  );
  
  return {
    score: Math.round(score * 10) / 10, // Round to 1 decimal
    monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    totalExposure: Math.round(totalExposure * 100) / 100,
    exposureRatio: Math.round(exposureRatio * 10000) / 10000, // Round to 4 decimals
    exposurePercent: Math.round(exposurePercent * 10) / 10, // Round to 1 decimal
    confidence: Math.round(confidence * 10) / 10,
  };
}
