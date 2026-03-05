/**
 * Universal Health Score Semantics
 * 
 * Defines the standard health score scale and classification.
 * High score = good health.
 * Enforced everywhere.
 */

export const HEALTH_SCORE_SCALE = {
  EXCELLENT: { min: 90, max: 100 },
  HEALTHY: { min: 80, max: 89 },
  WARNING: { min: 60, max: 79 },
  CRITICAL: { min: 40, max: 59 },
  SEVERE: { min: 0, max: 39 },
};

/**
 * Classify health score into category
 * 
 * @param score - Health score (0-100)
 * @returns Health category string
 */
export function classifyHealth(score: number): 'EXCELLENT' | 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'SEVERE' {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'WARNING';
  if (score >= 40) return 'CRITICAL';
  return 'SEVERE';
}

/**
 * Check if health score is valid
 * 
 * @param score - Health score to validate
 * @returns true if score is valid (number between 0-100), false otherwise
 */
export function isValidHealthScore(score: unknown): score is number {
  return typeof score === 'number' && 
         !isNaN(score) && 
         isFinite(score) && 
         score >= 0 && 
         score <= 100;
}

/**
 * Safely get health score, returning null if invalid
 * 
 * @param score - Health score to validate
 * @returns Valid score or null
 */
export function safeHealthScore(score: unknown): number | null {
  if (isValidHealthScore(score)) {
    return score;
  }
  return null;
}
