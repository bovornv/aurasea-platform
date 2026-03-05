/**
 * Calculate Company Health Score
 * 
 * Company score = Average of active branch scores.
 * If null → return null.
 * NEVER fallback to 0.
 */

import { safeHealthScore } from './health-score-definition';

export interface BranchScore {
  healthScore: number | null | undefined;
  branchId: string;
  branchName?: string;
}

/**
 * Calculate company health score from branch scores
 * 
 * @param branches - Array of branch scores
 * @returns Company health score (0-100) or null if no valid branches
 */
export function calculateCompanyScore(branches: BranchScore[]): number | null {
  if (!branches || branches.length === 0) {
    return null;
  }

  // Filter to branches with valid health scores
  const valid = branches
    .map(b => ({
      branch: b,
      score: safeHealthScore(b.healthScore),
    }))
    .filter(item => item.score !== null);

  if (valid.length === 0) {
    return null;
  }

  // Calculate average
  const total = valid.reduce((sum, item) => sum + (item.score as number), 0);
  const average = total / valid.length;
  
  // Round to integer
  return Math.round(average);
}

/**
 * Calculate company health score with revenue weighting
 * 
 * PART 1: Company Health Overview
 * - Health must be revenue-weighted: sum(branch.healthScore * branch.last30Revenue) / totalRevenue
 * - If totalRevenue = 0: Fallback to simple average
 * - If only 1 branch → company score equals branch score
 * - No NaN, no division by zero
 * 
 * @param branches - Array of branch scores with revenue (last30Revenue)
 * @returns Company health score (0-100) or null if no valid branches
 */
export function calculateCompanyScoreWeighted(
  branches: Array<BranchScore & { revenue?: number | null; last30Revenue?: number | null }>
): number | null {
  // PART 9: Numerical Stability - guard against invalid inputs
  if (!branches || branches.length === 0) {
    return null;
  }

  // PART 1: If only 1 branch → company score equals branch score
  if (branches.length === 1) {
    const singleBranch = branches[0];
    const score = safeHealthScore(singleBranch.healthScore);
    if (score === null) return null;
    // PART 9: Ensure no NaN
    if (!isFinite(score) || isNaN(score)) return null;
    return Math.round(score);
  }

  // Filter to branches with valid health scores
  const valid = branches
    .map(b => {
      const score = safeHealthScore(b.healthScore);
      // PART 1: Use last30Revenue (preferred) or revenue (fallback)
      const revenue = typeof b.last30Revenue === 'number' && b.last30Revenue > 0 
        ? b.last30Revenue 
        : (typeof b.revenue === 'number' && b.revenue > 0 ? b.revenue : null);
      
      // PART 9: Numerical Stability - guard against NaN/Infinity
      const safeScore = score !== null && isFinite(score) && !isNaN(score) ? score : null;
      const safeRevenue = revenue !== null && isFinite(revenue) && !isNaN(revenue) && revenue > 0 ? revenue : null;
      
      return {
        branch: b,
        score: safeScore,
        revenue: safeRevenue,
      };
    })
    .filter(item => item.score !== null);

  if (valid.length === 0) {
    return null;
  }

  // PART 1: Calculate totalRevenue = sum(branch.last30Revenue)
  const totalRevenue = valid.reduce((sum, item) => {
    const rev = item.revenue || 0;
    // PART 9: Ensure no NaN propagation
    if (!isFinite(rev) || isNaN(rev)) return sum;
    return sum + rev;
  }, 0);

  // PART 1: If totalRevenue = 0: Fallback to simple average
  if (totalRevenue <= 0 || !isFinite(totalRevenue) || isNaN(totalRevenue)) {
    // Fallback to equal weights
    const total = valid.reduce((sum, item) => {
      const score = item.score as number;
      // PART 9: Ensure no NaN propagation
      if (!isFinite(score) || isNaN(score)) return sum;
      return sum + score;
    }, 0);
    
    // PART 9: Guard against division by zero
    if (valid.length === 0) return null;
    const average = total / valid.length;
    
    // PART 9: Ensure result is valid
    if (!isFinite(average) || isNaN(average)) return null;
    return Math.round(average);
  }

  // PART 1: Revenue-weighted: weightedHealth = sum(branch.healthScore * branch.last30Revenue) / totalRevenue
  const weightedSum = valid.reduce((sum, item) => {
    const score = item.score as number;
    const revenue = item.revenue as number;
    
    // PART 9: Ensure no NaN propagation
    if (!isFinite(score) || isNaN(score) || !isFinite(revenue) || isNaN(revenue)) {
      return sum;
    }
    
    const weight = revenue / totalRevenue;
    return sum + (score * weight);
  }, 0);

  // PART 9: Ensure result is valid
  if (!isFinite(weightedSum) || isNaN(weightedSum)) {
    // Fallback to simple average
    const total = valid.reduce((sum, item) => {
      const score = item.score as number;
      if (!isFinite(score) || isNaN(score)) return sum;
      return sum + score;
    }, 0);
    const average = total / valid.length;
    if (!isFinite(average) || isNaN(average)) return null;
    return Math.round(average);
  }
  
  return Math.round(weightedSum);
}
