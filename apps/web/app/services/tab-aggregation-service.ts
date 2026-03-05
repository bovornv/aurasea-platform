/**
 * Tab-Specific Aggregation Service
 * 
 * Provides aggregated insights for Café/Restaurant and Hotel/Resort tabs
 * when in Group View (All Branches selected).
 */
'use client';

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import { businessGroupService } from './business-group-service';
import { operationalSignalsService } from './operational-signals-service';
import { calculateBranchHealthScore, groupAlertsByBranch, getBranchHealthMetrics } from './group-aggregation-service';
import type { Branch } from '../models/business-group';
import { ModuleType } from '../models/business-group';

export interface TabAggregatedInsights {
  // Aggregated metrics
  aggregatedHealthScore: number;
  totalAlerts: number;
  alertCountsBySeverity: {
    critical: number;
    warning: number;
    informational: number;
  };
  // Café-specific metrics (when tab = 'cafe')
  aggregatedWeekdayUtilization?: number | null; // Median or null
  branchesWithWeekdayUtilization?: number; // Count of branches with utilization data
  // Hotel-specific metrics (when tab = 'hotel')
  aggregatedOccupancyRate?: number | null; // Median or null
  branchesWithOccupancyData?: number; // Count of branches with occupancy data
  // Top alerts for this tab (filtered by domain/type)
  topAlerts: AlertContract[];
}

/**
 * Filter alerts by tab type (cafe vs hotel)
 * Café alerts: domain includes 'forecast', 'labor', or alert IDs contain 'weekday', 'menu', 'fnb'
 * Hotel alerts: domain includes 'risk', 'cash', or alert IDs contain 'occupancy', 'capacity', 'liquidity'
 */
function filterAlertsByTab(alerts: AlertContract[], tab: 'cafe' | 'hotel'): AlertContract[] {
  if (tab === 'cafe') {
    return alerts.filter(alert => {
      const id = alert.id.toLowerCase();
      const domain = alert.domain?.toLowerCase() || '';
      return (
        domain === 'forecast' ||
        domain === 'labor' ||
        id.includes('weekday') ||
        id.includes('menu') ||
        id.includes('fnb') ||
        id.includes('weekend-weekday')
      );
    });
  } else {
    // hotel tab
    return alerts.filter(alert => {
      const id = alert.id.toLowerCase();
      const domain = alert.domain?.toLowerCase() || '';
      return (
        domain === 'risk' ||
        domain === 'cash' ||
        id.includes('occupancy') ||
        id.includes('capacity') ||
        id.includes('liquidity') ||
        id.includes('runway')
      );
    });
  }
}

/**
 * Extract weekday utilization from alerts
 */
function extractWeekdayUtilization(alerts: AlertContract[]): number | null {
  const utilizationAlert = alerts.find(a => 
    a.id.includes('low-weekday-utilization') || 
    a.message.toLowerCase().includes('weekday utilization')
  );

  if (utilizationAlert) {
    const conditions = utilizationAlert.conditions || [];
    const utilizationCondition = conditions.find(c => c.includes('Utilization Rate'));
    
    if (utilizationCondition) {
      const match = utilizationCondition.match(/(\d+\.?\d*)%/);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    const messageMatch = utilizationAlert.message.match(/(\d+\.?\d*)%/);
    if (messageMatch) {
      return parseFloat(messageMatch[1]);
    }
  }

  return null;
}

/**
 * Extract occupancy rate from alerts or signals
 */
function extractOccupancyRate(
  alerts: AlertContract[],
  signals: Array<{ occupancyRate?: number }>
): number | null {
  // First try to get from latest signal
  if (signals.length > 0 && signals[0].occupancyRate !== undefined) {
    return signals[0].occupancyRate * 100; // Convert to percentage
  }

  // Fallback: try to extract from capacity utilization alert
  const capacityAlert = alerts.find(a => 
    a.id.includes('capacity-utilization') || 
    a.message.toLowerCase().includes('occupancy')
  );

  if (capacityAlert) {
    const conditions = capacityAlert.conditions || [];
    const occupancyCondition = conditions.find(c => c.includes('Occupancy') || c.includes('occupancy'));
    
    if (occupancyCondition) {
      const match = occupancyCondition.match(/(\d+\.?\d*)%/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
  }

  return null;
}

/**
 * Get branches that match the tab's module
 */
function getBranchesForTab(branches: Branch[], tab: 'cafe' | 'hotel'): Branch[] {
  if (tab === 'cafe') {
    // F&B tab - return branches with F&B module
    return branches.filter(b => 
      b.modules?.includes(ModuleType.FNB) ?? false
    );
  } else {
    // Accommodation tab - return branches with accommodation module
    return branches.filter(b => 
      b.modules?.includes(ModuleType.ACCOMMODATION) ?? false
    );
  }
}

/**
 * Aggregate insights for a specific tab (Café or Hotel) in Group View
 */
export function aggregateTabInsights(
  alerts: AlertContract[],
  businessGroupId: string,
  tab: 'cafe' | 'hotel',
  userPermissions?: { role: 'branch' | 'manager' | 'owner'; organizationId?: string; branchIds: string[] }
): TabAggregatedInsights {
  let allBranches = businessGroupService.getAllBranches();
  
  // Filter branches by user permissions if provided
  if (userPermissions && userPermissions.role !== 'owner' && userPermissions.branchIds.length > 0) {
    allBranches = allBranches.filter(b => userPermissions.branchIds.includes(b.id));
  }
  
  const relevantBranches = getBranchesForTab(allBranches, tab);
  
  if (relevantBranches.length === 0) {
    return {
      aggregatedHealthScore: 100,
      totalAlerts: 0,
      alertCountsBySeverity: { critical: 0, warning: 0, informational: 0 },
      topAlerts: [],
    };
  }

  // Filter alerts by tab type
  const tabAlerts = filterAlertsByTab(alerts, tab);
  
  // Group alerts by branch
  const branchAlertsMap = groupAlertsByBranch(tabAlerts);
  
  // Get health metrics for relevant branches only
  const branchMetrics = getBranchHealthMetrics(relevantBranches, branchAlertsMap, businessGroupId);

  // Calculate aggregated health score (weighted by revenue)
  const totalRevenue = branchMetrics.reduce((sum, m) => sum + m.revenue30Days, 0);
  let aggregatedHealthScore: number;
  
  if (totalRevenue > 0) {
    aggregatedHealthScore = branchMetrics.reduce((sum, m) => {
      const weight = m.revenue30Days / totalRevenue;
      return sum + (m.healthScore * weight);
    }, 0);
  } else {
    aggregatedHealthScore = branchMetrics.reduce((sum, m) => sum + m.healthScore, 0) / branchMetrics.length;
  }

  // Aggregate alert counts
  const alertCountsBySeverity = {
    critical: tabAlerts.filter(a => a.severity === 'critical').length,
    warning: tabAlerts.filter(a => a.severity === 'warning').length,
    informational: tabAlerts.filter(a => a.severity === 'informational').length,
  };

  // Get top 5 alerts by severity (critical > warning > informational)
  const topAlerts = [...tabAlerts].sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, informational: 1 };
    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
  }).slice(0, 5);

  // Tab-specific metrics
  let aggregatedWeekdayUtilization: number | null = null;
  let branchesWithWeekdayUtilization = 0;
  let aggregatedOccupancyRate: number | null = null;
  let branchesWithOccupancyData = 0;

  if (tab === 'cafe') {
    // Calculate median weekday utilization
    const utilizationValues: number[] = [];
    relevantBranches.forEach(branch => {
      const branchAlerts = branchAlertsMap.get(branch.id) || [];
      const utilization = extractWeekdayUtilization(branchAlerts);
      if (utilization !== null) {
        utilizationValues.push(utilization);
        branchesWithWeekdayUtilization++;
      }
    });

    if (utilizationValues.length > 0) {
      utilizationValues.sort((a, b) => a - b);
      const mid = Math.floor(utilizationValues.length / 2);
      aggregatedWeekdayUtilization = utilizationValues.length % 2 === 0
        ? (utilizationValues[mid - 1] + utilizationValues[mid]) / 2
        : utilizationValues[mid];
    }
  } else {
    // hotel tab - calculate median occupancy rate
    const occupancyValues: number[] = [];
    relevantBranches.forEach(branch => {
      const branchAlerts = branchAlertsMap.get(branch.id) || [];
      const signals = operationalSignalsService.getAllSignals(branch.id, businessGroupId);
      const occupancy = extractOccupancyRate(branchAlerts, signals);
      if (occupancy !== null) {
        occupancyValues.push(occupancy);
        branchesWithOccupancyData++;
      }
    });

    if (occupancyValues.length > 0) {
      occupancyValues.sort((a, b) => a - b);
      const mid = Math.floor(occupancyValues.length / 2);
      aggregatedOccupancyRate = occupancyValues.length % 2 === 0
        ? (occupancyValues[mid - 1] + occupancyValues[mid]) / 2
        : occupancyValues[mid];
    }
  }

  return {
    aggregatedHealthScore: Math.round(aggregatedHealthScore * 10) / 10,
    totalAlerts: tabAlerts.length,
    alertCountsBySeverity,
    topAlerts,
    ...(tab === 'cafe' ? {
      aggregatedWeekdayUtilization,
      branchesWithWeekdayUtilization,
    } : {
      aggregatedOccupancyRate,
      branchesWithOccupancyData,
    }),
  };
}
