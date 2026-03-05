/**
 * Unified Revenue Leak Engine
 * 
 * Calculates total revenue exposure from all alerts, categorized by leak type.
 * This is the core decision layer for financial impact analysis.
 */

import type { BranchMetrics } from '../../../../apps/web/app/models/branch-metrics';
import type { AlertContract } from '../../contracts/alerts';
import type { ExtendedAlertContract } from '../../../../apps/web/app/services/monitoring-service';

// Import safe number utilities (using dynamic require to avoid circular deps)
let safeNumber: (value: unknown, fallback?: number) => number;
let safeSum: (values: unknown[], fallback?: number) => number;

try {
  const safeNumberUtils = require('../../../../apps/web/app/utils/safe-number');
  safeNumber = safeNumberUtils.safeNumber;
  safeSum = safeNumberUtils.safeSum;
} catch (e) {
  // Fallback implementations if utils not available
  safeNumber = (value: unknown, fallback: number = 0): number => {
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value;
    const parsed = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
    return (!isNaN(parsed) && isFinite(parsed)) ? parsed : fallback;
  };
  safeSum = (values: unknown[], fallback: number = 0): number => {
    if (!Array.isArray(values) || values.length === 0) return fallback;
    const sum = values.reduce((acc: number, val) => acc + safeNumber(val, 0), 0);
    return (!isNaN(sum) && isFinite(sum)) ? sum : fallback;
  };
}

export interface RevenueExposureResult {
  totalMonthlyLeakage: number; // Total revenue exposure in THB/month
  leakageByCategory: {
    demand: number; // Demand drop, low utilization
    margin: number; // Margin compression, cost pressure
    cost: number; // Cost inefficiencies
    utilization: number; // Capacity underutilization
    cash: number; // Cash runway, liquidity risks
    concentration: number; // Revenue concentration risks
    seasonality: number; // Seasonal mismatches
  };
  exposurePercent: number; // Percentage of monthly revenue (0-100)
}

/**
 * Categorize alert by leak type
 */
function categorizeAlert(alert: AlertContract): keyof RevenueExposureResult['leakageByCategory'] {
  const alertType = getAlertType(alert);
  const id = alert.id.toLowerCase();
  
  // Demand-related
  if (alertType.includes('demand-drop') || 
      alertType.includes('capacity-utilization') ||
      alertType.includes('low-weekday-utilization') ||
      alertType.includes('weekend-weekday')) {
    return 'demand';
  }
  
  // Margin-related
  if (alertType.includes('margin-compression') || 
      alertType.includes('break-even-risk')) {
    return 'margin';
  }
  
  // Cost-related
  if (alertType.includes('cost-pressure')) {
    return 'cost';
  }
  
  // Utilization-related
  if (alertType.includes('capacity') || 
      alertType.includes('utilization') ||
      alertType.includes('occupancy')) {
    return 'utilization';
  }
  
  // Cash-related
  if (alertType.includes('cash-runway') || 
      alertType.includes('liquidity-runway') ||
      alertType.includes('cash-flow-volatility')) {
    return 'cash';
  }
  
  // Concentration-related
  if (alertType.includes('revenue-concentration') || 
      alertType.includes('menu-revenue-concentration')) {
    return 'concentration';
  }
  
  // Seasonality-related
  if (alertType.includes('seasonal') || 
      alertType.includes('seasonality')) {
    return 'seasonality';
  }
  
  // Default to demand if unclear
  return 'demand';
}

/**
 * Get alert type identifier from alert ID
 */
function getAlertType(alert: AlertContract): string {
  const idParts = alert.id.split('-');
  if (idParts.length < 2) {
    return alert.id;
  }
  
  const timestampPattern = /^\d+$/;
  const partsWithoutTimestamp = idParts.filter(part => !timestampPattern.test(part));
  
  return partsWithoutTimestamp.join('-') || alert.id;
}

/**
 * Calculate revenue exposure from alerts
 * 
 * @param branchMetrics - Branch metrics containing financial data
 * @param alerts - Array of active alerts with revenue impact
 * @returns RevenueExposureResult with total leakage and category breakdown
 */
export function calculateRevenueExposure(
  branchMetrics: BranchMetrics,
  alerts: AlertContract[]
): RevenueExposureResult {
  // Defensive: Handle invalid inputs
  if (!branchMetrics || !alerts || !Array.isArray(alerts)) {
    return {
      totalMonthlyLeakage: 0,
      leakageByCategory: {
        demand: 0,
        margin: 0,
        cost: 0,
        utilization: 0,
        cash: 0,
        concentration: 0,
        seasonality: 0,
      },
      exposurePercent: 0,
    };
  }
  
  // Initialize category totals
  const leakageByCategory: RevenueExposureResult['leakageByCategory'] = {
    demand: 0,
    margin: 0,
    cost: 0,
    utilization: 0,
    cash: 0,
    concentration: 0,
    seasonality: 0,
  };
  
  // Calculate monthly revenue
  const monthlyRevenue = safeNumber(branchMetrics.financials.revenueLast30DaysTHB, 0);
  
  // STEP 3 & 7: Aggregate revenue impact from all alerts with debug logging
  const alertsWithImpact: Array<{ alert: AlertContract; impact: number }> = [];
  
  alerts.forEach(alert => {
    if (!alert) return;
    
    const extended = alert as ExtendedAlertContract;
    let revenueImpact = safeNumber(extended?.revenueImpact, 0);
    
    // STEP 3: If revenueImpact is 0 but alert is critical/warning, calculate fallback impact
    // This ensures crisis scenario alerts always contribute to exposure
    if (revenueImpact === 0 && (alert.severity === 'critical' || alert.severity === 'warning')) {
      const alertType = getAlertType(alert);
      const id = alert.id.toLowerCase();
      
      // Calculate fallback impact based on alert type and metrics
      if (id.includes('liquidity') || id.includes('runway')) {
        // Liquidity runway: use burn rate × runway months (capped at 3 months)
        const monthlyBurnRate = safeNumber(branchMetrics.financials.costsLast30DaysTHB, 0) - 
                                safeNumber(branchMetrics.financials.revenueLast30DaysTHB, 0);
        const cashBalance = safeNumber(branchMetrics.financials.cashBalanceTHB, 0);
        const runwayMonths = monthlyBurnRate > 0 ? cashBalance / monthlyBurnRate : 0;
        revenueImpact = Math.abs(monthlyBurnRate) * Math.min(runwayMonths, 3);
        // Ensure minimum impact
        revenueImpact = Math.max(revenueImpact, monthlyRevenue * 0.20);
      } else if (id.includes('demand') || id.includes('drop')) {
        // Demand drop: use revenue drop percentage
        revenueImpact = monthlyRevenue * (alert.severity === 'critical' ? 0.25 : 0.15);
        // Ensure minimum impact
        revenueImpact = Math.max(revenueImpact, 20000);
      } else if (id.includes('margin') || id.includes('compression')) {
        // Margin compression: use margin loss
        const margin = monthlyRevenue > 0 
          ? (monthlyRevenue - safeNumber(branchMetrics.financials.costsLast30DaysTHB, 0)) / monthlyRevenue
          : 0;
        if (margin < 0) {
          revenueImpact = Math.abs(monthlyRevenue - safeNumber(branchMetrics.financials.costsLast30DaysTHB, 0));
        } else {
          revenueImpact = monthlyRevenue * 0.08;
        }
      }
    }
    
    if (revenueImpact > 0) {
      const category = categorizeAlert(alert);
      leakageByCategory[category] = safeNumber(
        leakageByCategory[category] + revenueImpact,
        0
      );
      alertsWithImpact.push({ alert, impact: revenueImpact });
    }
  });
  
  // STEP 7: Debug logging for crisis scenarios
  if (process.env.NODE_ENV === 'development') {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('aurasea_test_mode') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.simulationScenario === 'crisis') {
          console.log('[CRISIS DEBUG] Revenue Exposure Calculation:', {
            totalAlerts: alerts.length,
            alertsWithImpact: alertsWithImpact.length,
            impacts: alertsWithImpact.map(a => ({
              id: a.alert.id,
              impact: Math.round(a.impact).toLocaleString(),
            })),
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Calculate total monthly leakage
  const totalMonthlyLeakage = safeSum(
    Object.values(leakageByCategory),
    0
  );
  
  // STEP 7: Debug logging for total exposure
  if (process.env.NODE_ENV === 'development') {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('aurasea_test_mode') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.simulationScenario === 'crisis') {
          console.log('[CRISIS DEBUG] Total Revenue Exposure:', {
            totalMonthlyLeakage: Math.round(totalMonthlyLeakage).toLocaleString(),
            leakageByCategory: Object.entries(leakageByCategory).reduce((acc, [key, value]) => {
              if (value > 0) acc[key] = Math.round(value).toLocaleString();
              return acc;
            }, {} as Record<string, string>),
            exposurePercent: ((totalMonthlyLeakage / monthlyRevenue) * 100).toFixed(1) + '%',
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Calculate exposure percentage
  const exposurePercent = monthlyRevenue > 0
    ? safeNumber((totalMonthlyLeakage / monthlyRevenue) * 100, 0)
    : 0;
  
  // Clamp exposure percent to 0-100
  const clampedExposurePercent = Math.max(0, Math.min(100, exposurePercent));
  
  return {
    totalMonthlyLeakage: Math.round(totalMonthlyLeakage * 100) / 100, // Round to 2 decimals
    leakageByCategory,
    exposurePercent: Math.round(clampedExposurePercent * 10) / 10, // Round to 1 decimal
  };
}
