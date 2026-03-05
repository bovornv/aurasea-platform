/**
 * Group Aggregation Service
 * 
 * Aggregates branch-level alerts and insights for Business Group view.
 * 
 * Rules:
 * - Alerts are generated ONLY at branch level
 * - Group View only summarizes, never generates new alerts
 * - Health Score = weighted average by branch revenue (fallback to equal weight)
 * - Utilization metrics = median across branches
 * - Confidence decreases when branch data is incomplete
 */
'use client';

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { Branch } from '../models/business-group';
import { calculateBranchHealthScore as calculateBranchHealthScoreCore } from '../../../../core/sme-os/engine/health/branch-health-score';
import { businessGroupService } from './business-group-service';
import { operationalSignalsService } from './operational-signals-service';

/**
 * Check if TEST_MODE is currently active
 * TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
 */
function isTestModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return false;
  
  // Check if fixture bundle exists (indicates TEST_MODE is active)
  try {
    const { getFixtureBundle } = require('./test-fixture-loader-v2');
    const bundle = getFixtureBundle();
    return bundle !== null && bundle.branches.length > 0;
  } catch (e) {
    return false;
  }
}

export interface BranchHealthMetrics {
  branchId: string;
  branchName: string;
  healthScore: number; // 0-100
  revenue30Days: number;
  alertCounts: {
    critical: number;
    warning: number;
    informational: number;
  };
  hasCompleteData: boolean; // True if branch has recent operational signals
}

export interface GroupAggregatedInsights {
  aggregatedHealthScore: number; // Weighted average by revenue
  branchCountsBySeverity: {
    green: number; // Branches with no critical/warning alerts
    yellow: number; // Branches with warning alerts but no critical
    red: number; // Branches with critical alerts
  };
  topRevenueImpactAlerts: AlertContract[]; // Top 3 highest revenue-impact alerts
  totalBranches: number;
  branchesWithData: number;
  aggregatedConfidence: number; // Decreases when branch data is incomplete
}

/**
 * Calculate health score for a branch based on alerts
 * Uses core implementation: 100 - (critical * 20 + warning * 10 + informational * 5)
 * Returns numeric score (0-100)
 */
export function calculateBranchHealthScore(alerts: AlertContract[]): number {
  const result = calculateBranchHealthScoreCore(alerts);
  return result.score;
}

/**
 * Estimate revenue impact of an alert
 * Higher severity and cash/risk domain alerts have higher impact
 */
function estimateAlertRevenueImpact(alert: AlertContract, branchRevenue30Days: number): number {
  // Base impact multiplier by severity
  const severityMultiplier: Record<string, number> = {
    critical: 1.0,
    warning: 0.5,
    informational: 0.2,
  };

  // Domain-specific multipliers (cash and risk alerts have higher revenue impact)
  const domainMultiplier: Record<string, number> = {
    cash: 1.5,
    risk: 1.2,
    labor: 0.8,
    forecast: 0.6,
  };

  const baseImpact = branchRevenue30Days * 0.1; // 10% of monthly revenue as base
  const severityMult = severityMultiplier[alert.severity] || 0.2;
  const domainMult = domainMultiplier[alert.domain] || 1.0;

  return baseImpact * severityMult * domainMult;
}

/**
 * Group alerts by branch ID
 */
export function groupAlertsByBranch(alerts: AlertContract[]): Map<string, AlertContract[]> {
  const branchAlertsMap = new Map<string, AlertContract[]>();
  
  alerts.forEach(alert => {
    if (alert.branchId) {
      const existing = branchAlertsMap.get(alert.branchId) || [];
      existing.push(alert);
      branchAlertsMap.set(alert.branchId, existing);
    }
  });
  
  return branchAlertsMap;
}

/**
 * Get health metrics for all branches
 */
export function getBranchHealthMetrics(
  branches: Branch[],
  branchAlertsMap: Map<string, AlertContract[]>,
  businessGroupId?: string
): BranchHealthMetrics[] {
  // TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
  // Check once per function call, not per branch
  const testModeActive = isTestModeActive();
  
  return branches.map(branch => {
    const alerts = branchAlertsMap.get(branch.id) || [];
    const healthScore = calculateBranchHealthScore(alerts);
    
    // Get revenue for this branch
    const branchSignals = operationalSignalsService.getAllSignals(branch.id, businessGroupId);
    const latestSignal = branchSignals[0];
    const revenue30Days = latestSignal?.revenue30Days || 0;
    
    // Check if branch has complete data (has signals within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const hasCompleteData = latestSignal && new Date(latestSignal.timestamp) >= sevenDaysAgo;

    return {
      branchId: branch.id,
      branchName: branch.branchName,
      healthScore,
      revenue30Days,
      alertCounts: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        informational: alerts.filter(a => a.severity === 'informational').length,
      },
      // In TEST_MODE, always mark as having complete data
      hasCompleteData: testModeActive ? true : !!hasCompleteData,
    };
  });
}

/**
 * Aggregate insights for Business Group view
 * @param alerts - All alerts for the business group (already filtered by businessGroupId)
 */
export function aggregateGroupInsights(
  alerts: AlertContract[],
  businessGroupId: string,
  userPermissions?: { role: 'branch' | 'manager' | 'owner'; organizationId?: string; branchIds: string[] }
): GroupAggregatedInsights {
  let branches = businessGroupService.getAllBranches();
  
  // Filter branches by user permissions if provided
  if (userPermissions && userPermissions.role !== 'owner' && userPermissions.branchIds.length > 0) {
    branches = branches.filter(b => userPermissions.branchIds.includes(b.id));
  }
  
  if (branches.length === 0) {
    return {
      aggregatedHealthScore: 100,
      branchCountsBySeverity: { green: 0, yellow: 0, red: 0 },
      topRevenueImpactAlerts: [],
      totalBranches: 0,
      branchesWithData: 0,
      aggregatedConfidence: 0,
    };
  }

  // Group alerts by branch
  const branchAlertsMap = groupAlertsByBranch(alerts);
  
  // Get health metrics for all branches
  const branchMetrics = getBranchHealthMetrics(branches, branchAlertsMap, businessGroupId);

  // TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
  const testModeActive = isTestModeActive();
  
  // Filter to branches with complete data for aggregation
  // In TEST_MODE, include ALL branches regardless of data completeness
  // Branches without complete data are excluded from health score calculation (unless TEST_MODE)
  const branchesWithCompleteData = testModeActive 
    ? branchMetrics  // Include all branches in TEST_MODE
    : branchMetrics.filter(m => m.hasCompleteData);
  
  if (branchesWithCompleteData.length === 0) {
    // No branches with complete data - return default
    return {
      aggregatedHealthScore: 0,
      branchCountsBySeverity: { green: 0, yellow: 0, red: 0 },
      topRevenueImpactAlerts: [],
      totalBranches: branches.length,
      branchesWithData: 0,
      aggregatedConfidence: 0,
    };
  }

  // PART 1: Calculate aggregated health score (weighted by revenue, only from branches with complete data)
  // PART 9: Numerical Stability - add guards for NaN/Infinity
  const totalRevenue = branchesWithCompleteData.reduce((sum, m) => {
    const rev = m.revenue30Days || 0;
    // PART 9: Guard against NaN/Infinity
    if (!isFinite(rev) || isNaN(rev)) return sum;
    return sum + rev;
  }, 0);
  
  let aggregatedHealthScore: number;
  
  // PART 1: If totalRevenue = 0: Fallback to simple average
  if (totalRevenue > 0 && isFinite(totalRevenue) && !isNaN(totalRevenue)) {
    // PART 1: Revenue-weighted: sum(branch.healthScore * branch.revenue30Days) / totalRevenue
    aggregatedHealthScore = branchesWithCompleteData.reduce((sum, m) => {
      const score = m.healthScore || 0;
      const revenue = m.revenue30Days || 0;
      
      // PART 9: Guard against NaN/Infinity
      if (!isFinite(score) || isNaN(score) || !isFinite(revenue) || isNaN(revenue)) {
        return sum;
      }
      
      const weight = revenue / totalRevenue;
      // PART 9: Ensure weight is valid
      if (!isFinite(weight) || isNaN(weight)) return sum;
      
      return sum + (score * weight);
    }, 0);
    
    // PART 9: Ensure result is valid
    if (!isFinite(aggregatedHealthScore) || isNaN(aggregatedHealthScore)) {
      // Fallback to equal weight
      const total = branchesWithCompleteData.reduce((sum, m) => {
        const score = m.healthScore || 0;
        if (!isFinite(score) || isNaN(score)) return sum;
        return sum + score;
      }, 0);
      aggregatedHealthScore = branchesWithCompleteData.length > 0 ? total / branchesWithCompleteData.length : 0;
    }
  } else {
    // PART 1: Fallback to equal weight
    const total = branchesWithCompleteData.reduce((sum, m) => {
      const score = m.healthScore || 0;
      // PART 9: Guard against NaN/Infinity
      if (!isFinite(score) || isNaN(score)) return sum;
      return sum + score;
    }, 0);
    
    // PART 9: Guard against division by zero
    aggregatedHealthScore = branchesWithCompleteData.length > 0 ? total / branchesWithCompleteData.length : 0;
    
    // PART 9: Ensure result is valid
    if (!isFinite(aggregatedHealthScore) || isNaN(aggregatedHealthScore)) {
      aggregatedHealthScore = 0;
    }
  }

  // Calculate branch counts by severity (only for branches with complete data)
  const branchCountsBySeverity = {
    green: 0,
    yellow: 0,
    red: 0,
  };

  branchesWithCompleteData.forEach(metrics => {
    if (metrics.alertCounts.critical > 0) {
      branchCountsBySeverity.red++;
    } else if (metrics.alertCounts.warning > 0) {
      branchCountsBySeverity.yellow++;
    } else {
      branchCountsBySeverity.green++;
    }
  });

  // PART 4: Get top 3 revenue-impact alerts across all branches (only from branches with complete data)
  // PART 2: Deduplicate by alert.code + branchId (do NOT merge alerts from different branches)
  const allAlertsWithImpact: Array<{ alert: AlertContract; impact: number; branchId: string }> = [];
  const uniqueAlertsMap = new Map<string, AlertContract>();
  
  branchesWithCompleteData.forEach(metrics => {
    const alerts = branchAlertsMap.get(metrics.branchId) || [];
    alerts.forEach(alert => {
      // PART 2: Use code + branchId as unique key
      const code = (alert as any).code || alert.id;
      const branchId = metrics.branchId;
      const uniqueKey = `${code}_${branchId}`;
      
      // PART 2: Keep separate alerts per branch (do NOT merge)
      if (!uniqueAlertsMap.has(uniqueKey)) {
        uniqueAlertsMap.set(uniqueKey, alert);
        
        const impact = estimateAlertRevenueImpact(alert, metrics.revenue30Days);
        // PART 9: Guard against NaN/Infinity
        const safeImpact = isFinite(impact) && !isNaN(impact) ? impact : 0;
        allAlertsWithImpact.push({ alert, impact: safeImpact, branchId });
      }
    });
  });

  // PART 4: Sort by impact descending and take top 3 globally
  const topRevenueImpactAlerts = allAlertsWithImpact
    .sort((a, b) => {
      // PART 9: Ensure impact values are valid
      const aImpact = isFinite(a.impact) && !isNaN(a.impact) ? a.impact : 0;
      const bImpact = isFinite(b.impact) && !isNaN(b.impact) ? b.impact : 0;
      return bImpact - aImpact;
    })
    .slice(0, 3)
    .map(item => item.alert);

  // Calculate aggregated confidence (ratio of branches with complete data)
  // In TEST_MODE, always use 100% confidence (testModeActive already declared above)
  const dataCompletenessRatio = branchesWithCompleteData.length / branches.length;
  const baseConfidence = 0.85; // Base confidence for complete data
  const aggregatedConfidence = testModeActive 
    ? 1.0  // 100% confidence in TEST_MODE
    : baseConfidence * dataCompletenessRatio;

  return {
    aggregatedHealthScore: Math.round(aggregatedHealthScore * 10) / 10, // Round to 1 decimal
    branchCountsBySeverity,
    topRevenueImpactAlerts,
    totalBranches: branches.length,
    branchesWithData: branchesWithCompleteData.length, // Always equals totalBranches in TEST_MODE
    aggregatedConfidence: Math.round(aggregatedConfidence * 100) / 100, // Round to 2 decimals
  };
}

/**
 * Calculate median utilization metrics across branches
 * Returns median values for key utilization metrics
 */
export function calculateMedianUtilizationMetrics(businessGroupId: string): {
  medianOccupancyRate?: number;
  medianWeekdayUtilization?: number;
  medianCapacityUtilization?: number;
} {
  const branches = businessGroupService.getAllBranches();
  const utilizationMetrics: Array<{
    occupancyRate?: number;
    weekdayUtilization?: number;
    capacityUtilization?: number;
  }> = [];

  branches.forEach(branch => {
    const signals = operationalSignalsService.getAllSignals(branch.id, businessGroupId);
    if (signals.length > 0) {
      const latest = signals[0];
      const metrics: typeof utilizationMetrics[0] = {};
      
      if (latest.occupancyRate !== undefined) {
        metrics.occupancyRate = latest.occupancyRate;
      }
      
      // Calculate weekday utilization if we have daily revenue data
      // This would require additional data structure - for now, we'll extract from alerts
      // In a full implementation, you'd calculate this from operational signals
      
      utilizationMetrics.push(metrics);
    }
  });

  if (utilizationMetrics.length === 0) {
    return {};
  }

  // Calculate medians
  const occupancyRates = utilizationMetrics
    .map(m => m.occupancyRate)
    .filter((r): r is number => r !== undefined)
    .sort((a, b) => a - b);

  const medianOccupancyRate = occupancyRates.length > 0
    ? occupancyRates[Math.floor(occupancyRates.length / 2)]
    : undefined;

  return {
    medianOccupancyRate,
    // medianWeekdayUtilization and medianCapacityUtilization would be calculated similarly
    // when the data structure supports it
  };
}
