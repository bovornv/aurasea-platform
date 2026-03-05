/**
 * Accommodation Health Score Simplification
 * 
 * PART 4: Simplified health score with 3 components
 * 
 * Health Score = weighted score of 3 components:
 * - Demand Stability (0–40)
 * - Cost Control (0–30)
 * - Liquidity Safety (0–30)
 * Total = 100
 * 
 * If insufficient data:
 * final_score = raw_score × coverage_ratio
 * 
 * Never returns null or undefined.
 * Always returns a valid score (0-100).
 */

import type { DailyMetric } from '../models/daily-metrics';
import { calculateDailyRevenue } from '../models/daily-metrics';
import { calculateConfidence, type ConfidenceResult } from './accommodation-confidence';
import { evaluateAccommodationAlerts, type AccommodationAlert } from './accommodation-intelligence-engine';

export interface HealthScoreComponents {
  demandStability: number; // 0-40
  costControl: number; // 0-30
  liquiditySafety: number; // 0-30
}

export interface AccommodationHealthScore {
  score: number; // 0-100, always defined
  components: HealthScoreComponents;
  confidence: ConfidenceResult;
  alerts: AccommodationAlert[];
  hasInsufficientData: boolean;
}

/**
 * Calculate 7-day average of rooms sold
 */
function calculate7DayAvgRoomsSold(metrics: DailyMetric[], endDate: Date): number {
  const sevenDaysAgo = new Date(endDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= sevenDaysAgo && metricDate <= endDate;
  });
  
  if (relevantMetrics.length === 0) return 0;
  
  const totalRooms = relevantMetrics.reduce((sum, m) => sum + (m.roomsSold ?? 0), 0);
  return totalRooms / relevantMetrics.length;
}

/**
 * Calculate 14-day average of rooms sold
 */
function calculate14DayAvgRoomsSold(metrics: DailyMetric[], endDate: Date): number {
  const fourteenDaysAgo = new Date(endDate);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= fourteenDaysAgo && metricDate <= endDate;
  });
  
  if (relevantMetrics.length === 0) return 0;
  
  const totalRooms = relevantMetrics.reduce((sum, m) => sum + (m.roomsSold ?? 0), 0);
  return totalRooms / relevantMetrics.length;
}

/**
 * Calculate average daily cost
 */
function calculateAvgDailyCost(metrics: DailyMetric[], days: number, endDate: Date): number {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= startDate && metricDate <= endDate;
  });
  
  if (relevantMetrics.length === 0) return 0;
  
  // Use canonical 'cost' field from unified daily_metrics
  const totalCost = relevantMetrics.reduce((sum, m) => sum + (m.cost || 0), 0);
  return totalCost / relevantMetrics.length;
}

/**
 * Calculate Demand Stability score (0-40)
 */
function calculateDemandStability(metrics: DailyMetric[], endDate: Date): number {
  if (metrics.length === 0) return 20; // Neutral score if no data
  
  const current7DayAvg = calculate7DayAvgRoomsSold(metrics, endDate);
  const previous7DayEnd = new Date(endDate);
  previous7DayEnd.setDate(previous7DayEnd.getDate() - 7);
  const previous7DayAvg = calculate7DayAvgRoomsSold(metrics, previous7DayEnd);
  
  if (previous7DayAvg === 0) return 20; // Neutral if no previous data
  
  const percentChange = ((current7DayAvg - previous7DayAvg) / previous7DayAvg) * 100;
  
  // Score starts at 40, penalize for drops
  let score = 40;
  
  if (percentChange < -30) {
    score = 0; // Severe drop
  } else if (percentChange < -20) {
    score = 10;
  } else if (percentChange < -15) {
    score = 20;
  } else if (percentChange < -10) {
    score = 30;
  } else if (percentChange < 0) {
    score = 35;
  }
  // If percentChange >= 0, score remains at 40
  
  return Math.max(0, Math.min(40, score));
}

/**
 * Calculate Cost Control score (0-30)
 */
function calculateCostControl(metrics: DailyMetric[], endDate: Date): number {
  if (metrics.length === 0) return 15; // Neutral score if no data
  
  const current7DayAvgCost = calculateAvgDailyCost(metrics, 7, endDate);
  const previous7DayEnd = new Date(endDate);
  previous7DayEnd.setDate(previous7DayEnd.getDate() - 7);
  const previous7DayAvgCost = calculateAvgDailyCost(metrics, 14, previous7DayEnd);
  
  if (previous7DayAvgCost === 0) return 15; // Neutral if no previous data
  
  const percentChange = ((current7DayAvgCost - previous7DayAvgCost) / previous7DayAvgCost) * 100;
  
  // Score starts at 30, penalize for increases
  let score = 30;
  
  if (percentChange > 40) {
    score = 0; // Severe spike
  } else if (percentChange > 30) {
    score = 5;
  } else if (percentChange > 20) {
    score = 10;
  } else if (percentChange > 10) {
    score = 20;
  } else if (percentChange > 0) {
    score = 25;
  }
  // If percentChange <= 0, score remains at 30
  
  return Math.max(0, Math.min(30, score));
}

/**
 * Calculate Liquidity Safety score (0-30)
 */
function calculateLiquiditySafety(metrics: DailyMetric[], endDate: Date): number {
  if (metrics.length === 0) return 15; // Neutral score if no data
  
  const latestMetric = metrics[metrics.length - 1];
  if (!latestMetric) return 15;
  
  const avgDailyCost = calculateAvgDailyCost(metrics, 14, endDate);
  
  if (avgDailyCost === 0) return 15; // Neutral if no cost data
  
  const cashRunwayDays = (latestMetric.cashBalance ?? 0) / avgDailyCost;
  
  // Score based on runway days
  let score = 30;
  
  if (cashRunwayDays < 7) {
    score = 0; // Critical
  } else if (cashRunwayDays < 14) {
    score = 5; // Warning
  } else if (cashRunwayDays < 30) {
    score = 15; // Moderate
  } else if (cashRunwayDays < 60) {
    score = 25; // Good
  }
  // If cashRunwayDays >= 60, score remains at 30
  
  return Math.max(0, Math.min(30, score));
}

/**
 * Calculate accommodation health score
 * Always returns a valid score (0-100), never null or undefined
 */
export function calculateAccommodationHealthScore(
  metrics: DailyMetric[],
  branchId: string
): AccommodationHealthScore {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Sort metrics by date (oldest first)
  const sortedMetrics = [...metrics].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Calculate confidence
  const confidence = calculateConfidence(sortedMetrics);
  
  // Calculate component scores
  const demandStability = calculateDemandStability(sortedMetrics, today);
  const costControl = calculateCostControl(sortedMetrics, today);
  const liquiditySafety = calculateLiquiditySafety(sortedMetrics, today);
  
  // Calculate raw score
  const rawScore = demandStability + costControl + liquiditySafety;
  
  // Apply confidence penalty if insufficient data
  const hasInsufficientData = confidence.coverageRatio < 0.6;
  const finalScore = hasInsufficientData 
    ? rawScore * confidence.coverageRatio 
    : rawScore;
  
  // Ensure score is between 0-100
  const clampedScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  
  // Get alerts
  const alerts = evaluateAccommodationAlerts(sortedMetrics, branchId);
  
  return {
    score: clampedScore,
    components: {
      demandStability,
      costControl,
      liquiditySafety,
    },
    confidence,
    alerts,
    hasInsufficientData,
  };
}
