/**
 * Revenue Exposure Calculator
 * 
 * Calculates financial impact from alerts based on branch metrics
 * Returns total monthly leakage and breakdown by category
 */

import type { BranchMetrics } from '../models/branch-metrics';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../services/monitoring-service';
import { safeNumber } from './safe-number';

export interface RevenueExposureResult {
  totalMonthlyLeakage: number; // Total revenue exposure in THB/month
  leakageByCategory: {
    revenue: number; // Revenue loss
    margin: number; // Margin compression
    cost: number; // Cost overruns
    cash: number; // Cash flow impact
  };
  exposurePercentOfRevenue: number; // Exposure as % of revenue
}

/**
 * Calculate revenue exposure from alerts
 * 
 * @param branchMetrics Branch metrics
 * @param alerts Array of alerts
 * @returns Revenue exposure calculation result
 */
export function calculateRevenueExposure(
  branchMetrics: BranchMetrics | null | undefined,
  alerts: AlertContract[]
): RevenueExposureResult {
  // Safe defaults
  const result: RevenueExposureResult = {
    totalMonthlyLeakage: 0,
    leakageByCategory: {
      revenue: 0,
      margin: 0,
      cost: 0,
      cash: 0,
    },
    exposurePercentOfRevenue: 0,
  };

  if (!branchMetrics || !alerts || alerts.length === 0) {
    return result;
  }

  const revenue30d = safeNumber(branchMetrics.financials.revenueLast30DaysTHB, 0);
  const costs30d = safeNumber(branchMetrics.financials.costsLast30DaysTHB, 0);
  
  // Debug logging
  if (process.env.NODE_ENV === 'development' && alerts.length > 0) {
    const alertsWithImpact = alerts.filter(a => ((a as ExtendedAlertContract).revenueImpact ?? 0) > 0);
    console.log('[RevenueExposure] Calculating exposure:', {
      totalAlerts: alerts.length,
      criticalWarning: alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length,
      alertsWithRevenueImpact: alertsWithImpact.length,
      sumOfRevenueImpact: alertsWithImpact.reduce((sum, a) => sum + ((a as ExtendedAlertContract).revenueImpact || 0), 0),
    });
  }
  
  // Process each alert
  for (const alert of alerts) {
    const alertId = alert.id.toLowerCase();
    const severity = alert.severity;
    const extended = alert as ExtendedAlertContract;
    
    // Only calculate exposure for critical and warning alerts
    if (severity !== 'critical' && severity !== 'warning') {
      continue;
    }
    
    // PRIORITY 1: Use revenueImpact if directly set on alert (most accurate)
    if (extended.revenueImpact !== undefined && extended.revenueImpact > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RevenueExposure] Using revenueImpact for alert ${alert.id}:`, extended.revenueImpact);
      }
      // Determine category based on alert domain/type
      const domain = (alert.domain || '').toLowerCase();
      const alertType = extended.type || '';
      
      if (alertType === 'opportunity') {
        // Opportunities are potential gains, not losses
        // But for revenue exposure, we count them as 0 (they're gains, not risks)
        continue; // Skip opportunities in risk calculation
      } else {
        // Risk alerts - add to appropriate category
        if (domain === 'cash' || alertId.includes('liquidity') || alertId.includes('runway')) {
          result.leakageByCategory.cash += extended.revenueImpact;
        } else if (domain === 'margin' || alertId.includes('margin') || alertId.includes('compression')) {
          result.leakageByCategory.margin += extended.revenueImpact;
        } else if (domain === 'cost' || alertId.includes('cost') || alertId.includes('pressure')) {
          result.leakageByCategory.cost += extended.revenueImpact;
        } else {
          // Default to revenue category
          result.leakageByCategory.revenue += extended.revenueImpact;
        }
        result.totalMonthlyLeakage += extended.revenueImpact;
        continue; // Skip pattern matching if revenueImpact is set
      }
    }
    
    // PRIORITY 2: Pattern-based calculation (fallback if revenueImpact not set)
    // Liquidity runway risk
    if (alertId.includes('liquidity') || alertId.includes('runway')) {
      // Estimate burn rate × risk window
      const monthlyBurnRate = safeNumber(costs30d - revenue30d, 0);
      const riskWindowMonths = severity === 'critical' ? 3 : 6; // Critical = 3 months, Warning = 6 months
      const exposure = Math.abs(monthlyBurnRate) * riskWindowMonths;
      result.leakageByCategory.cash += exposure;
      result.totalMonthlyLeakage += exposure;
    }
    
    // Margin compression
    if (alertId.includes('margin') || alertId.includes('compression')) {
      // (expected margin – actual margin) × revenue30d
      const marginLoss = severity === 'critical' ? 0.15 : 0.10; // 15% or 10% margin loss
      const exposure = revenue30d * marginLoss;
      result.leakageByCategory.margin += exposure;
      result.totalMonthlyLeakage += exposure;
    }
    
    // Low occupancy (accommodation)
    if ((alertId.includes('occupancy') || alertId.includes('capacity') || alertId.includes('utilization')) 
        && branchMetrics.modules.accommodation) {
      const occupancy = safeNumber(branchMetrics.modules.accommodation.occupancyRateLast30DaysPct, 0) / 100;
      const targetOccupancy = 0.75; // 75% target
      const rooms = safeNumber(branchMetrics.modules.accommodation.totalRoomsAvailable, 0);
      const adr = safeNumber(branchMetrics.modules.accommodation.averageDailyRoomRateTHB, 0);
      
      if (occupancy < targetOccupancy && rooms > 0 && adr > 0) {
        const occupancyGap = targetOccupancy - occupancy;
        const dailyLoss = occupancyGap * rooms * adr;
        const monthlyLoss = dailyLoss * 30;
        result.leakageByCategory.revenue += monthlyLoss;
        result.totalMonthlyLeakage += monthlyLoss;
      }
    }
    
    // F&B underperformance
    if ((alertId.includes('fnb') || alertId.includes('menu') || alertId.includes('customer'))
        && branchMetrics.modules.fnb) {
      const avgTicket = safeNumber(branchMetrics.modules.fnb.averageTicketPerCustomerTHB, 0);
      const expectedTicket = avgTicket * 1.2; // 20% higher expected
      const customers7d = safeNumber(branchMetrics.modules.fnb.totalCustomersLast7Days, 0);
      const customers30d = customers7d * (30 / 7); // Estimate 30-day customers
      
      if (avgTicket < expectedTicket && customers30d > 0) {
        const ticketGap = expectedTicket - avgTicket;
        const monthlyLoss = ticketGap * customers30d;
        result.leakageByCategory.revenue += monthlyLoss;
        result.totalMonthlyLeakage += monthlyLoss;
      }
    }
    
    // Cost pressure
    if (alertId.includes('cost') || alertId.includes('pressure')) {
      const costOverrun = severity === 'critical' ? 0.20 : 0.15; // 20% or 15% overrun
      const exposure = costs30d * costOverrun;
      result.leakageByCategory.cost += exposure;
      result.totalMonthlyLeakage += exposure;
    }
    
    // Revenue drop
    if (alertId.includes('revenue') || alertId.includes('demand') || alertId.includes('drop')) {
      const revenueLoss = severity === 'critical' ? 0.25 : 0.15; // 25% or 15% loss
      const exposure = revenue30d * revenueLoss;
      result.leakageByCategory.revenue += exposure;
      result.totalMonthlyLeakage += exposure;
    }
  }
  
  // Calculate exposure as percentage of revenue
  if (revenue30d > 0) {
    result.exposurePercentOfRevenue = safeNumber((result.totalMonthlyLeakage / revenue30d) * 100, 0);
  }
  
  // Ensure all values are safe (no NaN, no Infinity)
  result.totalMonthlyLeakage = safeNumber(result.totalMonthlyLeakage, 0);
  result.leakageByCategory.revenue = safeNumber(result.leakageByCategory.revenue, 0);
  result.leakageByCategory.margin = safeNumber(result.leakageByCategory.margin, 0);
  result.leakageByCategory.cost = safeNumber(result.leakageByCategory.cost, 0);
  result.leakageByCategory.cash = safeNumber(result.leakageByCategory.cash, 0);
  result.exposurePercentOfRevenue = safeNumber(result.exposurePercentOfRevenue, 0);
  
  return result;
}

/**
 * PART 3: Calculate total revenue exposure from alerts across multiple branches
 * Aggregates exposure from all alerts without requiring branch metrics
 * 
 * Calculation: revenueExposed = sum(alert.revenueImpact)
 * Only counts critical and warning alerts
 */
export function calculateRevenueExposureFromAlerts(
  alerts: AlertContract[]
): number {
  if (!alerts || alerts.length === 0) return 0;
  
  let totalExposure = 0;
  
  for (const alert of alerts) {
    if (!alert) continue;
    
    const extended = alert as ExtendedAlertContract;
    const revenueImpact = safeNumber(extended?.revenueImpact, 0);
    
    // PART 9: Numerical Stability - ensure impact is valid
    if (!isFinite(revenueImpact) || isNaN(revenueImpact) || revenueImpact <= 0) {
      continue;
    }
    
    // PART 3: Only count critical and warning alerts
    if (alert.severity === 'critical' || alert.severity === 'warning') {
      totalExposure += revenueImpact;
    }
  }
  
  // PART 9: Ensure result is valid
  return isFinite(totalExposure) && !isNaN(totalExposure) ? totalExposure : 0;
}
