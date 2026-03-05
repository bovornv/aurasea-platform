/**
 * Generate Simulation Snapshots
 * 
 * Pure, synchronous function to generate 30 days of health score snapshots
 * for simulation mode. No async operations, no React dependencies.
 */

import type { BranchMetrics } from '../../apps/web/app/models/branch-metrics';
import type { SimulationPreset } from './simulation-library';

/**
 * Calculate health score from metrics (for simulation mode)
 * Pure function - estimates health score based on metrics without alerts
 */
function estimateHealthScoreFromMetrics(metrics: BranchMetrics): number {
  let score = 100;
  
  // Cash runway penalty
  const monthlyCosts = metrics.financials.costsLast30DaysTHB;
  const cashBalance = metrics.financials.cashBalanceTHB;
  if (monthlyCosts > 0) {
    const runwayMonths = cashBalance / monthlyCosts;
    if (runwayMonths < 1) score -= 30;
    else if (runwayMonths < 2) score -= 20;
    else if (runwayMonths < 3) score -= 10;
  }
  
  // Margin compression penalty
  const revenue = metrics.financials.revenueLast30DaysTHB;
  const costs = metrics.financials.costsLast30DaysTHB;
  if (revenue > 0) {
    const margin = (revenue - costs) / revenue;
    if (margin < 0.1) score -= 25;
    else if (margin < 0.2) score -= 15;
    else if (margin < 0.3) score -= 5;
  }
  
  // Occupancy penalty (for accommodation)
  if (metrics.modules.accommodation) {
    const occupancy = metrics.modules.accommodation.occupancyRateLast30DaysPct;
    if (occupancy < 40) score -= 20;
    else if (occupancy < 50) score -= 10;
    else if (occupancy < 60) score -= 5;
  }
  
  // F&B concentration penalty
  if (metrics.modules.fnb) {
    const concentration = metrics.modules.fnb.top3MenuRevenueShareLast30DaysPct;
    if (concentration > 60) score -= 15;
    else if (concentration > 50) score -= 10;
    else if (concentration > 40) score -= 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate health score snapshots for simulation mode
 * Pure function - synchronous, no side effects except localStorage writes
 */
export function generateSimulationSnapshots(
  simulatedBranches: Array<{ branchId: string; branchName: string; metrics: BranchMetrics }>,
  businessGroupId: string,
  alerts: Array<{ branchId: string; severity: 'critical' | 'warning' | 'informational' }> = []
): void {
  if (typeof window === 'undefined') return;
  if (!simulatedBranches || simulatedBranches.length === 0) return;

  try {
    // Use dynamic require to avoid TypeScript parsing issues
    const healthScoreTrendService = require('../../core/sme-os/engine/services/health-score-trend-service');
    const alertHealthScoreMapper = require('../../core/sme-os/engine/services/alert-health-score-mapper');
    const saveHealthScoreSnapshot: (snapshot: any, allowOverwrite?: boolean) => void = healthScoreTrendService.saveHealthScoreSnapshot;
    const calculateHealthScoreFromAlerts: (alerts: any[]) => any = alertHealthScoreMapper.calculateHealthScoreFromAlerts;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generate snapshots for each branch
    for (const branch of simulatedBranches) {
      const branchAlerts = alerts.filter(a => a.branchId === branch.branchId);
      
      // Calculate base health score from alerts (if available) or estimate from metrics
      let baseScore: number;
      if (branchAlerts.length > 0) {
        const healthScoreResult = calculateHealthScoreFromAlerts(branchAlerts);
        baseScore = Math.max(0, Math.min(100, healthScoreResult.healthScore));
      } else {
        // Estimate from metrics when alerts not yet available
        baseScore = estimateHealthScoreFromMetrics(branch.metrics);
      }

      // Generate 30 days of snapshots with slight variation to show trends
      for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
        const snapshotDate = new Date(today);
        snapshotDate.setDate(snapshotDate.getDate() - dayOffset);
        snapshotDate.setHours(0, 0, 0, 0);

        // Vary health score slightly over time (simulate trend)
        // Start slightly lower and improve over time (or vice versa based on scenario)
        const progress = (29 - dayOffset) / 29; // 0 to 1 over 30 days
        const variation = (Math.sin(dayOffset * 0.2) * 2); // Smooth sine wave variation (±2 points)
        const trendAdjustment = progress * 3; // Gradual improvement over 30 days
        const score = Math.max(0, Math.min(100, baseScore + trendAdjustment + variation));

        // Calculate alert counts (use provided alerts or estimate from metrics)
        let criticalCount = branchAlerts.filter(a => a.severity === 'critical').length;
        let warningCount = branchAlerts.filter(a => a.severity === 'warning').length;
        let informationalCount = branchAlerts.filter(a => a.severity === 'informational').length;
        
        // If no alerts provided, estimate from metrics
        if (branchAlerts.length === 0) {
          const estimatedScore = estimateHealthScoreFromMetrics(branch.metrics);
          if (estimatedScore < 50) {
            criticalCount = 2;
            warningCount = 3;
          } else if (estimatedScore < 70) {
            warningCount = 2;
            informationalCount = 2;
          } else if (estimatedScore < 85) {
            informationalCount = 1;
          }
        }

        // Create snapshot
        const snapshot = {
          date: snapshotDate,
          score: Math.round(score * 10) / 10,
          totalPenalty: Math.max(0, 100 - score),
          alertCounts: {
            critical: criticalCount,
            warning: warningCount,
            informational: informationalCount,
          },
          branchId: branch.branchId,
          businessGroupId: businessGroupId,
        };

        // Save snapshot (allow overwrite for simulation mode to regenerate)
        saveHealthScoreSnapshot(snapshot, true);
      }
    }

    // Also create group-level snapshots if multiple branches
    if (simulatedBranches.length > 1) {
      const allBranchAlerts = alerts.filter(a =>
        simulatedBranches.some(b => b.branchId === a.branchId)
      );

      // Calculate base health score from alerts (if available) or estimate from metrics
      let groupBaseScore: number;
      if (allBranchAlerts.length > 0) {
        const groupHealthScoreResult = calculateHealthScoreFromAlerts(allBranchAlerts);
        groupBaseScore = Math.max(0, Math.min(100, groupHealthScoreResult.healthScore));
      } else {
        // Estimate from aggregated metrics when alerts not yet available
        const avgScore = simulatedBranches.reduce((sum, b) => 
          sum + estimateHealthScoreFromMetrics(b.metrics), 0) / simulatedBranches.length;
        groupBaseScore = Math.max(0, Math.min(100, avgScore));
      }

      for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
        const snapshotDate = new Date(today);
        snapshotDate.setDate(snapshotDate.getDate() - dayOffset);
        snapshotDate.setHours(0, 0, 0, 0);

        const progress = (29 - dayOffset) / 29;
        const variation = (Math.sin(dayOffset * 0.2) * 2);
        const trendAdjustment = progress * 3;
        const score = Math.max(0, Math.min(100, groupBaseScore + trendAdjustment + variation));

        // Calculate group alert counts
        let groupCriticalCount = allBranchAlerts.filter(a => a.severity === 'critical').length;
        let groupWarningCount = allBranchAlerts.filter(a => a.severity === 'warning').length;
        let groupInformationalCount = allBranchAlerts.filter(a => a.severity === 'informational').length;
        
        // If no alerts, estimate from aggregated metrics
        if (allBranchAlerts.length === 0) {
          if (groupBaseScore < 50) {
            groupCriticalCount = simulatedBranches.length;
            groupWarningCount = simulatedBranches.length * 2;
          } else if (groupBaseScore < 70) {
            groupWarningCount = simulatedBranches.length;
            groupInformationalCount = simulatedBranches.length;
          } else if (groupBaseScore < 85) {
            groupInformationalCount = Math.max(1, Math.floor(simulatedBranches.length / 2));
          }
        }

        const groupSnapshot = {
          date: snapshotDate,
          score: Math.round(score * 10) / 10,
          totalPenalty: Math.max(0, 100 - score),
          alertCounts: {
            critical: groupCriticalCount,
            warning: groupWarningCount,
            informational: groupInformationalCount,
          },
          branchId: undefined,
          businessGroupId: businessGroupId,
        };

        saveHealthScoreSnapshot(groupSnapshot, true);
      }
    }

    console.log(`[SIMULATION] Generated health score snapshots for 30 days (${simulatedBranches.length} branches)`);
  } catch (e) {
    console.error('[SIMULATION] Failed to generate snapshots:', e);
  }
}
