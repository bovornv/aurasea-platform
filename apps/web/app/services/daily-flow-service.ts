/**
 * Daily Flow Service
 * 
 * FINAL PRODUCTION ARCHITECTURE - PART 3
 * 
 * Handles daily flow calculations:
 * - Cost estimation from branch setup
 * - Margin calculation
 * - 7-day momentum
 * - Confidence calculation
 */

import type { DailyMetric } from '../models/daily-metrics';

export interface BranchSetup {
  monthlyFixedCost?: number;
  variableCostRatio?: number; // percentage (0-100)
  roomsAvailable?: number;
  seatingCapacity?: number;
}

export interface DailyFlowCalculations {
  estimatedCost: number;
  estimatedMargin: number;
  occupancy?: number;
  momentum7d: number | null;
  confidence: number;
  confidenceBreakdown: {
    base: number;
    operational: number;
    finance: number;
    consistency: number;
  };
}

/**
 * Fallback estimate when no daily metric history exists.
 * Prefer real pipeline: `accommodation-economics` (additional_cost_today 30d sum + monthly_fixed_cost) / 30.
 * Formula here: (revenue * variable_cost_ratio / 100) + (monthly_fixed_cost / 30); no phantom 60% default.
 */
export function estimateDailyCost(
  revenue: number,
  setup: BranchSetup
): number {
  const variableCost = setup.variableCostRatio != null
    ? (revenue * setup.variableCostRatio) / 100
    : 0;

  const fixedCostDaily = setup.monthlyFixedCost ? setup.monthlyFixedCost / 30 : 0;

  return variableCost + fixedCostDaily;
}

/**
 * Calculate margin from revenue and cost
 */
export function calculateMargin(revenue: number, cost: number): number {
  return revenue - cost;
}

/**
 * Calculate occupancy rate
 */
export function calculateOccupancy(
  roomsSold: number,
  roomsAvailable?: number
): number | null {
  if (!roomsAvailable || roomsAvailable === 0) return null;
  return (roomsSold / roomsAvailable) * 100;
}

/**
 * Calculate 7-day momentum from daily metrics history
 * Returns percentage change: ((last7avg - prev7avg) / prev7avg) * 100
 */
export function calculate7DayMomentum(
  dailyMetrics: DailyMetric[]
): number | null {
  if (dailyMetrics.length < 14) return null;
  
  // Sort by date (oldest first)
  const sorted = [...dailyMetrics].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Last 7 days
  const last7 = sorted.slice(-7);
  const last7Avg = last7.reduce((sum, m) => sum + m.revenue, 0) / 7;
  
  // Previous 7 days (7-14 days ago)
  const prev7 = sorted.slice(-14, -7);
  const prev7Avg = prev7.reduce((sum, m) => sum + m.revenue, 0) / 7;
  
  if (prev7Avg === 0) return null;
  
  return ((last7Avg - prev7Avg) / prev7Avg) * 100;
}

/**
 * Calculate confidence score based on data completeness
 * 
 * Base: 70% (revenue only)
 * + 10% (operational data: rooms_sold OR customers)
 * + 10% (finance data: cash_balance OR actual_cost)
 * + 5% (consistency: regular updates)
 * = Max 95%
 */
export function calculateConfidence(
  hasRevenue: boolean,
  hasOperational: boolean,
  hasFinance: boolean,
  hasConsistentUpdates: boolean
): {
  score: number;
  breakdown: {
    base: number;
    operational: number;
    finance: number;
    consistency: number;
  };
} {
  const base = hasRevenue ? 70 : 0;
  const operational = hasOperational ? 10 : 0;
  const finance = hasFinance ? 10 : 0;
  const consistency = hasConsistentUpdates ? 5 : 0;
  
  const score = Math.min(95, base + operational + finance + consistency);
  
  return {
    score,
    breakdown: {
      base,
      operational,
      finance,
      consistency,
    },
  };
}

/**
 * Calculate all daily flow metrics
 */
export function calculateDailyFlow(
  revenue: number,
  roomsSold?: number,
  customers?: number,
  cashBalance?: number,
  actualCost?: number,
  setup: BranchSetup = {},
  dailyMetricsHistory: DailyMetric[] = []
): DailyFlowCalculations {
  // Estimate cost if not provided
  const cost = actualCost ?? estimateDailyCost(revenue, setup);
  
  // Calculate margin
  const margin = calculateMargin(revenue, cost);
  
  // Calculate occupancy (if accommodation)
  const occupancy = roomsSold && setup.roomsAvailable
    ? calculateOccupancy(roomsSold, setup.roomsAvailable)
    : undefined;
  
  // Calculate 7-day momentum
  const momentum7d = calculate7DayMomentum(dailyMetricsHistory);
  
  // Calculate confidence
  const hasRevenue = revenue > 0;
  const hasOperational = !!(roomsSold || customers);
  const hasFinance = !!(cashBalance || actualCost);
  const hasConsistentUpdates = dailyMetricsHistory.length >= 7;
  
  const confidence = calculateConfidence(
    hasRevenue,
    hasOperational,
    hasFinance,
    hasConsistentUpdates
  );
  
  return {
    estimatedCost: cost,
    estimatedMargin: margin,
    occupancy: occupancy ?? undefined,
    momentum7d,
    confidence: confidence.score,
    confidenceBreakdown: confidence.breakdown,
  };
}
