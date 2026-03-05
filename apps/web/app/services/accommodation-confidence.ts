/**
 * Accommodation Confidence System
 * 
 * PART 3: Lightweight confidence system based on data coverage
 * 
 * coverage_ratio = actual_days / 30
 * 
 * Confidence:
 * >= 90% → High
 * 70–89% → Medium
 * 50–69% → Low
 * < 50% → Very Low
 */

import type { DailyMetric } from '../models/daily-metrics';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'very_low';

export interface ConfidenceResult {
  coverageRatio: number; // 0-1
  confidenceLevel: ConfidenceLevel;
  actualDays: number;
  expectedDays: number; // Always 30
  message: string;
}

/**
 * Calculate data coverage for last 30 days
 */
export function calculateConfidence(metrics: DailyMetric[]): ConfidenceResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Filter metrics within last 30 days
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    metricDate.setHours(0, 0, 0, 0);
    return metricDate >= thirtyDaysAgo && metricDate <= today;
  });
  
  // Count unique days
  const uniqueDays = new Set(relevantMetrics.map(m => m.date));
  const actualDays = uniqueDays.size;
  const expectedDays = 30;
  
  const coverageRatio = actualDays / expectedDays;
  
  // Determine confidence level
  let confidenceLevel: ConfidenceLevel;
  let message: string;
  
  if (coverageRatio >= 0.9) {
    confidenceLevel = 'high';
    message = 'High confidence - comprehensive data coverage';
  } else if (coverageRatio >= 0.7) {
    confidenceLevel = 'medium';
    message = 'Medium confidence - good data coverage';
  } else if (coverageRatio >= 0.5) {
    confidenceLevel = 'low';
    message = 'Low confidence - limited data coverage';
  } else {
    confidenceLevel = 'very_low';
    message = 'Very low confidence - insufficient data coverage';
  }
  
  return {
    coverageRatio,
    confidenceLevel,
    actualDays,
    expectedDays,
    message,
  };
}

/**
 * Check if confidence is below threshold (60%)
 */
export function isConfidenceBelowThreshold(confidence: ConfidenceResult): boolean {
  return confidence.coverageRatio < 0.6;
}
