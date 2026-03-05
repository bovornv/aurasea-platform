/**
 * Accommodation Safe Wrapper
 * 
 * PART 8: System Behavior Guarantee
 * 
 * Ensures system:
 * - Never depends on perfect data
 * - Never crashes when days missing
 * - Always produces: health score, confidence, alerts (even if low confidence)
 */

import type { DailyMetric } from '../models/daily-metrics';
import { calculateAccommodationHealthScore, type AccommodationHealthScore } from './accommodation-health-score';
import { evaluateAccommodationAlerts, type AccommodationAlert } from './accommodation-intelligence-engine';
import { calculateConfidence, type ConfidenceResult } from './accommodation-confidence';
import { extractRecommendations, type Recommendation } from './accommodation-recommendations';

export interface SafeAccommodationResult {
  healthScore: number; // Always 0-100, never null/undefined
  confidence: ConfidenceResult;
  alerts: AccommodationAlert[]; // Always array, never null
  recommendations: Recommendation[]; // Always array, max 3
  hasInsufficientData: boolean;
  error?: string; // Only set if there was an error, but system still produced results
}

/**
 * Safe wrapper that guarantees outputs
 * Never throws, always returns valid results
 */
export function getSafeAccommodationResult(
  metrics: DailyMetric[] | null | undefined,
  branchId: string
): SafeAccommodationResult {
  try {
    // Normalize input - ensure metrics is always an array
    const safeMetrics: DailyMetric[] = Array.isArray(metrics) ? metrics : [];
    
    // Always calculate health score (handles empty metrics gracefully)
    let healthScoreResult: AccommodationHealthScore;
    try {
      healthScoreResult = calculateAccommodationHealthScore(safeMetrics, branchId);
    } catch (error) {
      console.error('[SafeWrapper] Error calculating health score:', error);
      // Fallback: return neutral score
      healthScoreResult = {
        score: 50,
        components: {
          demandStability: 20,
          costControl: 15,
          liquiditySafety: 15,
        },
        confidence: {
          coverageRatio: 0,
          confidenceLevel: 'very_low',
          actualDays: 0,
          expectedDays: 30,
          message: 'No data available',
        },
        alerts: [],
        hasInsufficientData: true,
      };
    }
    
    // Always get alerts (handles empty metrics gracefully)
    let alerts: AccommodationAlert[];
    try {
      alerts = evaluateAccommodationAlerts(safeMetrics, branchId);
    } catch (error) {
      console.error('[SafeWrapper] Error evaluating alerts:', error);
      // Fallback: return data gap alert
      alerts = [{
        id: `missing_monitoring_data_${branchId}_${Date.now()}`,
        type: 'missing_monitoring_data',
        severity: 'warning',
        message: 'No monitoring data available. Please update daily metrics.',
        recommendation: 'Update daily metrics to improve accuracy.',
        timestamp: new Date(),
        confidence: 0.5,
      }];
    }
    
    // Always get confidence
    let confidence: ConfidenceResult;
    try {
      confidence = calculateConfidence(safeMetrics);
    } catch (error) {
      console.error('[SafeWrapper] Error calculating confidence:', error);
      // Fallback: return very low confidence
      confidence = {
        coverageRatio: 0,
        confidenceLevel: 'very_low',
        actualDays: 0,
        expectedDays: 30,
        message: 'No data available',
      };
    }
    
    // Always get recommendations (max 3)
    let recommendations: Recommendation[];
    try {
      recommendations = extractRecommendations(alerts);
    } catch (error) {
      console.error('[SafeWrapper] Error extracting recommendations:', error);
      recommendations = [];
    }
    
    return {
      healthScore: healthScoreResult.score,
      confidence,
      alerts,
      recommendations,
      hasInsufficientData: healthScoreResult.hasInsufficientData,
    };
  } catch (error) {
    // Ultimate fallback - should never reach here, but ensures no crashes
    console.error('[SafeWrapper] Unexpected error:', error);
    return {
      healthScore: 50,
      confidence: {
        coverageRatio: 0,
        confidenceLevel: 'very_low',
        actualDays: 0,
        expectedDays: 30,
        message: 'System error - using fallback values',
      },
      alerts: [{
        id: `system_error_${branchId}_${Date.now()}`,
        type: 'missing_monitoring_data',
        severity: 'warning',
        message: 'System encountered an error. Please refresh and try again.',
        recommendation: 'Update daily metrics to improve accuracy.',
        timestamp: new Date(),
        confidence: 0.5,
      }],
      recommendations: [{
        id: 'rec_system_error',
        text: 'Update daily metrics to improve accuracy.',
        priority: 'medium',
        alertType: 'missing_monitoring_data',
      }],
      hasInsufficientData: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate that result is safe (never null/undefined)
 */
export function validateSafeResult(result: SafeAccommodationResult): boolean {
  // Check all required fields exist and are valid
  if (typeof result.healthScore !== 'number' || 
      result.healthScore < 0 || 
      result.healthScore > 100) {
    return false;
  }
  
  if (!Array.isArray(result.alerts)) {
    return false;
  }
  
  if (!Array.isArray(result.recommendations)) {
    return false;
  }
  
  if (!result.confidence || 
      typeof result.confidence.coverageRatio !== 'number') {
    return false;
  }
  
  return true;
}
