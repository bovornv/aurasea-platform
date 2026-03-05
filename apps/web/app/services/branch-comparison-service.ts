/**
 * Branch Comparison Service
 * 
 * Provides comparison data for all branches in a business group.
 * Used for Branch Comparison View table.
 */
'use client';

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { Branch } from '../models/business-group';
import { BranchBusinessType } from '../models/business-group';
import { calculateBranchHealthScore as calculateBranchHealthScoreCore } from '../../../../core/sme-os/engine/health/branch-health-score';
import { businessGroupService } from './business-group-service';
import { operationalSignalsService } from './operational-signals-service';

/**
 * Calculate health score for a branch based on alerts
 * Uses core implementation: 100 - (critical * 20 + warning * 10 + informational * 5)
 * Returns numeric score (0-100)
 */
function calculateBranchHealthScore(alerts: AlertContract[]): number {
  const result = calculateBranchHealthScoreCore(alerts);
  return result.score;
}

export interface BranchComparisonData {
  branchId: string;
  branchName: string;
  businessType: BranchBusinessType;
  healthScore: number;
  weekdayUtilization: number | null; // Percentage or null if not available
  revenueTrend: 'up' | 'down' | 'stable';
  activeAlertsCount: number;
  revenue30Days: number;
  revenueGap?: number; // Revenue gap for sorting (difference from average)
}

/**
 * Calculate weekday utilization from alerts or signals
 * First tries to extract from Low Weekday Utilization alerts,
 * then falls back to calculating from operational signals if available
 */
function calculateWeekdayUtilization(
  alerts: AlertContract[],
  signals: Array<{ timestamp: Date; revenue7Days: number; revenue30Days: number }>
): number | null {
  // First, try to extract from Low Weekday Utilization alert
  const utilizationAlert = alerts.find(a => 
    a.id.includes('low-weekday-utilization') || 
    a.message.toLowerCase().includes('weekday utilization')
  );

  if (utilizationAlert) {
    // Extract utilization percentage from alert conditions or message
    const conditions = utilizationAlert.conditions || [];
    const utilizationCondition = conditions.find(c => c.includes('Utilization Rate'));
    
    if (utilizationCondition) {
      const match = utilizationCondition.match(/(\d+\.?\d*)%/);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    // Fallback: try to extract from message
    const messageMatch = utilizationAlert.message.match(/(\d+\.?\d*)%/);
    if (messageMatch) {
      return parseFloat(messageMatch[1]);
    }
  }

  // Fallback: calculate from signals if we have enough data
  // This is a simplified calculation - in production, you'd want daily revenue data
  // For now, we'll return null if no alert is available
  // In a full implementation, you'd calculate weekday utilization from daily revenue signals
  
  return null;
}

/**
 * Calculate revenue trend by comparing recent vs previous period
 */
function calculateRevenueTrend(signals: Array<{ timestamp: Date; revenue30Days: number }>): 'up' | 'down' | 'stable' {
  if (signals.length < 2) {
    return 'stable';
  }

  const recent = signals[0];
  const previous = signals[1];

  if (!recent || !previous) {
    return 'stable';
  }

  const changePercent = previous.revenue30Days > 0
    ? ((recent.revenue30Days - previous.revenue30Days) / previous.revenue30Days) * 100
    : 0;

  // Threshold: >5% increase = up, <-5% decrease = down, else stable
  if (changePercent > 5) {
    return 'up';
  } else if (changePercent < -5) {
    return 'down';
  }
  return 'stable';
}

/**
 * Get comparison data for all branches
 */
export function getBranchComparisonData(
  alerts: AlertContract[],
  businessGroupId: string,
  userPermissions?: { role: 'branch' | 'manager' | 'owner'; organizationId?: string; branchIds: string[] }
): BranchComparisonData[] {
  let branches = businessGroupService.getAllBranches();
  
  // Filter branches by user permissions if provided
  if (userPermissions && userPermissions.role !== 'owner' && userPermissions.branchIds.length > 0) {
    branches = branches.filter(b => userPermissions.branchIds.includes(b.id));
  }
  
  if (branches.length === 0) {
    return [];
  }

  // Group alerts by branch
  const branchAlertsMap = new Map<string, AlertContract[]>();
  alerts.forEach(alert => {
    if (alert.branchId) {
      const existing = branchAlertsMap.get(alert.branchId) || [];
      existing.push(alert);
      branchAlertsMap.set(alert.branchId, existing);
    }
  });

  // Get comparison data for each branch
  const comparisonData: BranchComparisonData[] = branches.map(branch => {
    const branchAlerts = branchAlertsMap.get(branch.id) || [];
    const healthScore = calculateBranchHealthScore(branchAlerts);
    
    // Get signals for revenue trend and utilization calculation
    const branchSignals = operationalSignalsService.getAllSignals(branch.id, businessGroupId);
    const weekdayUtilization = calculateWeekdayUtilization(
      branchAlerts,
      branchSignals.map(s => ({
        timestamp: s.timestamp,
        revenue7Days: s.revenue7Days,
        revenue30Days: s.revenue30Days,
      }))
    );
    
    const activeAlertsCount = branchAlerts.length;

    const revenueTrend = calculateRevenueTrend(
      branchSignals.map(s => ({
        timestamp: s.timestamp,
        revenue30Days: s.revenue30Days,
      }))
    );

    const latestSignal = branchSignals[0];
    const revenue30Days = latestSignal?.revenue30Days || 0;

    return {
      branchId: branch.id,
      branchName: branch.branchName,
      businessType: (branch.businessType ?? BranchBusinessType.CAFE_RESTAURANT) as BranchBusinessType,
      healthScore,
      weekdayUtilization,
      revenueTrend,
      activeAlertsCount,
      revenue30Days,
    };
  });

  // Calculate average revenue for revenue gap calculation
  const totalRevenue = comparisonData.reduce((sum, d) => sum + d.revenue30Days, 0);
  const avgRevenue = comparisonData.length > 0 ? totalRevenue / comparisonData.length : 0;

  // Add revenue gap (difference from average)
  return comparisonData.map(data => ({
    ...data,
    revenueGap: data.revenue30Days - avgRevenue,
  }));
}

/**
 * Sort comparison data
 */
export type SortField = 'healthScore' | 'revenueGap' | 'utilization';

export function sortBranchComparisonData(
  data: BranchComparisonData[],
  sortField: SortField,
  ascending: boolean = true
): BranchComparisonData[] {
  const sorted = [...data].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case 'healthScore':
        comparison = a.healthScore - b.healthScore;
        break;
      case 'revenueGap':
        comparison = (a.revenueGap || 0) - (b.revenueGap || 0);
        break;
      case 'utilization':
        // Sort nulls last
        if (a.weekdayUtilization === null && b.weekdayUtilization === null) {
          comparison = 0;
        } else if (a.weekdayUtilization === null) {
          comparison = 1;
        } else if (b.weekdayUtilization === null) {
          comparison = -1;
        } else {
          comparison = a.weekdayUtilization - b.weekdayUtilization;
        }
        break;
    }

    return ascending ? comparison : -comparison;
  });

  return sorted;
}
