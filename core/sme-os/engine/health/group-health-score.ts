/**
 * Group (Owner-Level) Health Score Aggregation
 * 
 * Aggregates branch health scores into a group-level health score.
 * 
 * Rules:
 * - Weighted average by revenue share (if revenue metadata exists)
 * - Default to equal weights if no revenue metadata
 * - Penalize extreme underperformers (-5 if any branch <40)
 * - Return structured result with distribution and extremes
 * 
 * This module does NOT recompute branch health scores or alerts.
 * It only aggregates existing branch health scores.
 */

import type { BranchHealthScoreResult, HealthStatusLabel } from './branch-health-score';

export interface BranchHealthScoreInput {
  branchId: string;
  branchName: string;
  healthScore: BranchHealthScoreResult;
}

export interface BranchDistribution {
  Healthy: number;
  Stable: number;
  'At Risk': number;
  Critical: number;
}

export interface GroupHealthScoreResult {
  overallScore: number; // Rounded integer (0-100)
  overallStatus: HealthStatusLabel;
  branchDistribution: BranchDistribution;
  weakestBranch: {
    branchId: string;
    branchName: string;
    score: number;
  } | null;
  strongestBranch: {
    branchId: string;
    branchName: string;
    score: number;
  } | null;
}

/**
 * Calculate group health score from branch health scores
 * 
 * @param branchScores - Array of branch health score inputs (with branchId and branchName)
 * @param revenueMetadata - Optional map of branchId -> revenue for weighted calculation
 * @returns GroupHealthScoreResult with aggregated score, status, distribution, and extremes
 */
export function calculateGroupHealthScore(
  branchScores: BranchHealthScoreInput[],
  revenueMetadata?: Map<string, number>
): GroupHealthScoreResult {
  // Handle empty input
  if (branchScores.length === 0) {
    return {
      overallScore: 0,
      overallStatus: 'Critical',
      branchDistribution: {
        Healthy: 0,
        Stable: 0,
        'At Risk': 0,
        Critical: 0,
      },
      weakestBranch: null,
      strongestBranch: null,
    };
  }

  // Handle single branch case
  if (branchScores.length === 1) {
    const single = branchScores[0];
    return {
      overallScore: Math.round(single.healthScore.score),
      overallStatus: single.healthScore.statusLabel,
      branchDistribution: {
        Healthy: single.healthScore.statusLabel === 'Healthy' ? 1 : 0,
        Stable: single.healthScore.statusLabel === 'Stable' ? 1 : 0,
        'At Risk': single.healthScore.statusLabel === 'At Risk' ? 1 : 0,
        Critical: single.healthScore.statusLabel === 'Critical' ? 1 : 0,
      },
      weakestBranch: {
        branchId: single.branchId,
        branchName: single.branchName,
        score: single.healthScore.score,
      },
      strongestBranch: {
        branchId: single.branchId,
        branchName: single.branchName,
        score: single.healthScore.score,
      },
    };
  }

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
    // Fallback implementations
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

  // Calculate weighted average
  let weightedSum = 0;
  let totalWeight = 0;
  let useRevenueWeights = false;

  if (revenueMetadata && revenueMetadata.size > 0) {
    // Check if all branches have revenue metadata
    const allBranchesHaveRevenue = branchScores.every(branch => 
      branch && revenueMetadata.has(branch.branchId)
    );
    
    if (allBranchesHaveRevenue) {
      const revenueValues = Array.from(revenueMetadata.values()).map(v => safeNumber(v, 0));
      const totalRevenue = revenueValues.reduce((sum, rev) => sum + rev, 0);

      if (totalRevenue > 0) {
        useRevenueWeights = true;
        branchScores.forEach(branch => {
          if (!branch) return;
          const revenue = safeNumber(revenueMetadata.get(branch.branchId), 0);
          const weight = safeDivide(revenue, totalRevenue, 0);
          const branchScore = safeNumber(branch.healthScore?.score, 50);
          weightedSum += branchScore * weight;
          totalWeight += weight;
        });
      }
    }
  }

  // Fallback to equal weights if no revenue metadata, missing branches, or totalRevenue is 0
  if (!useRevenueWeights) {
    const branchCount = safeNumber(branchScores.length, 1);
    branchScores.forEach(branch => {
      if (!branch) return;
      const weight = safeDivide(1, branchCount, 0);
      const branchScore = safeNumber(branch.healthScore?.score, 50);
      weightedSum += branchScore * weight;
      totalWeight += weight;
    });
  }

  // Safe division - prevent division by zero
  const overallScore = safeDivide(weightedSum, totalWeight, 50);

  // Penalize extreme underperformers: -5 if any branch score <40 (once)
  const hasCriticalBranch = branchScores.some(b => b && safeNumber(b.healthScore?.score, 50) < 40);
  let finalScore = overallScore;
  if (hasCriticalBranch) {
    finalScore = safeNumber(overallScore - 5, 0);
  }

  // Cap score between 0-100
  finalScore = safeClamp(finalScore, 0, 100);

  // Round to integer
  const roundedScore = Math.round(finalScore);

  // Determine overall status using same thresholds as branch level
  const overallStatus = getHealthStatusLabel(roundedScore);

  // Calculate branch distribution
  const branchDistribution = calculateBranchDistribution(branchScores);

  // Find weakest and strongest branches
  const { weakestBranch, strongestBranch } = findExtremeBranches(branchScores);

  return {
    overallScore: roundedScore,
    overallStatus,
    branchDistribution,
    weakestBranch,
    strongestBranch,
  };
}

/**
 * Get health status label based on score (same thresholds as branch level)
 */
function getHealthStatusLabel(score: number): HealthStatusLabel {
  if (score >= 80) {
    return 'Healthy';
  } else if (score >= 60) {
    return 'Stable';
  } else if (score >= 40) {
    return 'At Risk';
  } else {
    return 'Critical';
  }
}

/**
 * Calculate branch distribution by status
 */
function calculateBranchDistribution(
  branchScores: BranchHealthScoreInput[]
): BranchDistribution {
  const distribution: BranchDistribution = {
    Healthy: 0,
    Stable: 0,
    'At Risk': 0,
    Critical: 0,
  };

  branchScores.forEach(branch => {
    const status = branch.healthScore.statusLabel;
    distribution[status]++;
  });

  return distribution;
}

/**
 * Find weakest and strongest branches
 */
function findExtremeBranches(branchScores: BranchHealthScoreInput[]): {
  weakestBranch: {
    branchId: string;
    branchName: string;
    score: number;
  } | null;
  strongestBranch: {
    branchId: string;
    branchName: string;
    score: number;
  } | null;
} {
  if (branchScores.length === 0) {
    return { weakestBranch: null, strongestBranch: null };
  }

  let weakest = branchScores[0];
  let strongest = branchScores[0];

  branchScores.forEach(branch => {
    if (branch.healthScore.score < weakest.healthScore.score) {
      weakest = branch;
    }
    if (branch.healthScore.score > strongest.healthScore.score) {
      strongest = branch;
    }
  });

  return {
    weakestBranch: {
      branchId: weakest.branchId,
      branchName: weakest.branchName,
      score: weakest.healthScore.score,
    },
    strongestBranch: {
      branchId: strongest.branchId,
      branchName: strongest.branchName,
      score: strongest.healthScore.score,
    },
  };
}
