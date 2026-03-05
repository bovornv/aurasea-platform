/**
 * Health Score Trend Service
 * 
 * Tracks health score trends over time and provides before/after alert comparisons.
 */

import type { AlertContract } from '../../contracts/alerts';
import type {
  HealthScoreSnapshot,
  AlertSnapshot,
  HealthScoreTrend,
  AlertComparison,
  BeforeAfterAlertAnalysis,
} from '../../contracts/health-score';
import { calculateHealthScoreFromAlerts, getAlertType } from './alert-health-score-mapper';

/**
 * Storage key prefix for health score snapshots
 */
const SNAPSHOT_STORAGE_PREFIX = 'health_score_snapshot_';
const ALERT_SNAPSHOT_STORAGE_PREFIX = 'alert_snapshot_';

/**
 * Get storage key for health score snapshots
 */
function getSnapshotStorageKey(businessGroupId: string, branchId?: string): string {
  if (branchId) {
    return `${SNAPSHOT_STORAGE_PREFIX}${businessGroupId}_${branchId}`;
  }
  return `${SNAPSHOT_STORAGE_PREFIX}${businessGroupId}`;
}

/**
 * Get storage key for alert snapshots
 */
function getAlertSnapshotStorageKey(businessGroupId: string, branchId?: string): string {
  if (branchId) {
    return `${ALERT_SNAPSHOT_STORAGE_PREFIX}${businessGroupId}_${branchId}`;
  }
  return `${ALERT_SNAPSHOT_STORAGE_PREFIX}${businessGroupId}`;
}

/**
 * Normalize date to start of day (for consistent snapshot keys)
 */
function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Get date string key (YYYY-MM-DD)
 */
function getDateKey(date: Date): string {
  const normalized = normalizeDate(date);
  return normalized.toISOString().split('T')[0];
}

/**
 * Load snapshots from localStorage
 */
function loadSnapshots<T extends { date: Date }>(
  storageKey: string
): Map<string, T> {
  if (typeof window === 'undefined') {
    return new Map();
  }

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return new Map();
    }

    const data = JSON.parse(stored);
    const snapshots = new Map<string, T>();

    for (const [dateKey, snapshot] of Object.entries(data)) {
      snapshots.set(dateKey, {
        ...(snapshot as any),
        date: new Date((snapshot as any).date),
      } as T);
    }

    return snapshots;
  } catch (e) {
    console.error('Failed to load snapshots:', e);
    return new Map();
  }
}

/**
 * Save snapshots to localStorage
 */
function saveSnapshots<T extends { date: Date }>(
  storageKey: string,
  snapshots: Map<string, T>
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const data: Record<string, any> = {};
    snapshots.forEach((snapshot, dateKey) => {
      data[dateKey] = {
        ...snapshot,
        date: snapshot.date.toISOString(),
      };
    });
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save snapshots:', e);
  }
}

/**
 * Generate health score snapshot for today
 */
export function generateHealthScoreSnapshot(
  alerts: AlertContract[],
  businessGroupId: string,
  branchId?: string
): HealthScoreSnapshot {
  const today = normalizeDate(new Date());
  const healthScoreResult = calculateHealthScoreFromAlerts(alerts);

  // Count alerts by severity
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const informationalCount = alerts.filter(a => a.severity === 'informational').length;

  return {
    date: today,
    score: healthScoreResult.score,
    totalPenalty: healthScoreResult.totalPenalty,
    alertCounts: {
      critical: criticalCount,
      warning: warningCount,
      informational: informationalCount,
    },
    branchId,
    businessGroupId,
  };
}

/**
 * Generate alert snapshots for today
 */
export function generateAlertSnapshots(
  alerts: AlertContract[],
  businessGroupId: string,
  branchId?: string
): AlertSnapshot[] {
  const today = normalizeDate(new Date());

  return alerts.map(alert => ({
    date: today,
    alertKey: getAlertType(alert),
    alertId: alert.id,
    severity: alert.severity,
    confidence: alert.confidence,
    branchId,
    businessGroupId,
  }));
}

/**
 * Save health score snapshot (only if not already exists for today)
 * For simulation mode, allow overwriting to regenerate snapshots
 */
export function saveHealthScoreSnapshot(
  snapshot: HealthScoreSnapshot,
  allowOverwrite: boolean = false
): void {
  const storageKey = getSnapshotStorageKey(
    snapshot.businessGroupId!,
    snapshot.branchId
  );
  const snapshots = loadSnapshots<HealthScoreSnapshot>(storageKey);
  const dateKey = getDateKey(snapshot.date);

  // Only save if snapshot doesn't exist for today, or if overwrite is allowed (for simulation)
  if (!snapshots.has(dateKey) || allowOverwrite) {
    snapshots.set(dateKey, snapshot);
    saveSnapshots(storageKey, snapshots);
  }
}

/**
 * Save alert snapshots (replace today's alerts)
 */
export function saveAlertSnapshots(
  snapshots: AlertSnapshot[]
): void {
  if (snapshots.length === 0) return;

  const firstSnapshot = snapshots[0];
  const storageKey = getAlertSnapshotStorageKey(
    firstSnapshot.businessGroupId!,
    firstSnapshot.branchId
  );
  const allSnapshots = loadSnapshots<AlertSnapshot>(storageKey);
  const dateKey = getDateKey(firstSnapshot.date);

  // Remove existing snapshots for today
  const keysToRemove: string[] = [];
  allSnapshots.forEach((snapshot, key) => {
    if (getDateKey(snapshot.date) === dateKey) {
      keysToRemove.push(key);
    }
  });
  keysToRemove.forEach(key => allSnapshots.delete(key));

  // Add new snapshots
  snapshots.forEach(snapshot => {
    const snapshotDateKey = getDateKey(snapshot.date);
    allSnapshots.set(`${snapshotDateKey}_${snapshot.alertKey}`, snapshot);
  });

  saveSnapshots(storageKey, allSnapshots);
}

/**
 * PART 7: Aggregate branch snapshots with revenue weighting for company-level trends
 * Uses rolling daily aggregation, not static snapshots
 * Handles missing branch days gracefully
 */
function aggregateBranchSnapshotsWithRevenueWeighting(
  businessGroupId: string,
  startDate: Date,
  endDate: Date
): HealthScoreSnapshot[] {
  // PART 8: Data Mode Awareness - handle mixed modes gracefully
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    // Dynamically import services (avoid circular dependencies)
    const { businessGroupService } = require('../../../../apps/web/app/services/business-group-service');
    const { operationalSignalsService } = require('../../../../apps/web/app/services/operational-signals-service');
    
    const allBranches = businessGroupService.getAllBranches();
    if (allBranches.length === 0) {
      return [];
    }

    // PART 7: If only 1 branch → use branch graph directly (no aggregation needed)
    if (allBranches.length === 1) {
      const singleBranch = allBranches[0];
      const branchStorageKey = getSnapshotStorageKey(businessGroupId, singleBranch.id);
      const branchSnapshots = loadSnapshots<HealthScoreSnapshot>(branchStorageKey);
      
      return Array.from(branchSnapshots.values())
        .filter(s => s.date >= startDate && s.date <= endDate)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    // PART 7: Multiple branches - aggregate daily snapshots with revenue weighting
    // Get all unique dates from all branch snapshots
    const allDates = new Set<string>();
    const branchSnapshotsByDate = new Map<string, Map<string, HealthScoreSnapshot>>(); // date -> branchId -> snapshot
    
    allBranches.forEach(branch => {
      const branchStorageKey = getSnapshotStorageKey(businessGroupId, branch.id);
      const branchSnapshots = loadSnapshots<HealthScoreSnapshot>(branchStorageKey);
      
      branchSnapshots.forEach((snapshot, dateKey) => {
        const snapshotDate = normalizeDate(snapshot.date);
        if (snapshotDate >= startDate && snapshotDate <= endDate) {
          allDates.add(dateKey);
          
          if (!branchSnapshotsByDate.has(dateKey)) {
            branchSnapshotsByDate.set(dateKey, new Map());
          }
          branchSnapshotsByDate.get(dateKey)!.set(branch.id, snapshot);
        }
      });
    });

    // PART 7: For each date, calculate revenue-weighted company score
    const aggregatedSnapshots: HealthScoreSnapshot[] = [];
    const sortedDates = Array.from(allDates).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA.getTime() - dateB.getTime();
    });

    sortedDates.forEach(dateKey => {
      const branchSnapshotsForDate = branchSnapshotsByDate.get(dateKey);
      if (!branchSnapshotsForDate || branchSnapshotsForDate.size === 0) {
        return; // Skip dates with no branch data
      }

      // PART 7: Get revenue for each branch (use last30Revenue for historical weighting)
      // PART 1: Use last30Revenue (preferred) or revenue30Days (fallback)
      const branchesWithData: Array<{ snapshot: HealthScoreSnapshot; revenue: number }> = [];
      let totalRevenue = 0;

      branchSnapshotsForDate.forEach((snapshot, branchId) => {
        try {
          // Get revenue for this branch (use latest available)
          const branchSignals = operationalSignalsService.getAllSignals(branchId, businessGroupId);
          const latestSignal = Array.isArray(branchSignals) && branchSignals.length > 0 ? branchSignals[0] : null;
          // PART 1: Use last30Revenue (preferred) or revenue30Days (fallback)
          const revenue = (latestSignal as any)?.last30Revenue || latestSignal?.revenue30Days || 0;
          
          // PART 9: Numerical Stability - guard against NaN/Infinity
          if (isFinite(revenue) && !isNaN(revenue) && revenue > 0) {
            branchesWithData.push({ snapshot, revenue });
            totalRevenue += revenue;
          }
        } catch (e) {
          // PART 7: Handle missing branch days gracefully - skip branches with errors
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[HealthScoreTrend] Error getting revenue for branch ${branchId} on ${dateKey}:`, e);
          }
        }
      });

      if (branchesWithData.length === 0) {
        return; // Skip dates with no valid branch data
      }

      // PART 7: Calculate revenue-weighted score for this date
      let weightedScore = 0;
      let totalCritical = 0;
      let totalWarning = 0;
      let totalInformational = 0;

      if (totalRevenue > 0 && isFinite(totalRevenue) && !isNaN(totalRevenue)) {
        // PART 7: Revenue-weighted aggregation
        branchesWithData.forEach(({ snapshot, revenue }) => {
          const score = snapshot.score || 0;
          // PART 9: Ensure values are valid
          if (!isFinite(score) || isNaN(score) || !isFinite(revenue) || isNaN(revenue)) {
            return;
          }
          
          const weight = revenue / totalRevenue;
          if (isFinite(weight) && !isNaN(weight)) {
            weightedScore += score * weight;
            totalCritical += snapshot.alertCounts?.critical || 0;
            totalWarning += snapshot.alertCounts?.warning || 0;
            totalInformational += snapshot.alertCounts?.informational || 0;
          }
        });
      } else {
        // PART 7: Fallback to simple average if no revenue data
        const totalScore = branchesWithData.reduce((sum, { snapshot }) => {
          const score = snapshot.score || 0;
          if (!isFinite(score) || isNaN(score)) return sum;
          return sum + score;
        }, 0);
        
        weightedScore = branchesWithData.length > 0 ? totalScore / branchesWithData.length : 0;
        branchesWithData.forEach(({ snapshot }) => {
          totalCritical += snapshot.alertCounts?.critical || 0;
          totalWarning += snapshot.alertCounts?.warning || 0;
          totalInformational += snapshot.alertCounts?.informational || 0;
        });
      }

      // PART 9: Ensure result is valid
      if (!isFinite(weightedScore) || isNaN(weightedScore)) {
        return; // Skip invalid aggregated snapshots
      }

      // PART 7: Create aggregated snapshot for this date
      const date = new Date(dateKey);
      aggregatedSnapshots.push({
        date: normalizeDate(date),
        score: Math.round(weightedScore),
        totalPenalty: 0, // Not used for aggregated snapshots
        alertCounts: {
          critical: totalCritical,
          warning: totalWarning,
          informational: totalInformational,
        },
        branchId: undefined, // Company-level snapshot
        businessGroupId,
      });
    });

    return aggregatedSnapshots.sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch (e) {
    // PART 7: Handle errors gracefully - return empty array
    if (process.env.NODE_ENV === 'development') {
      console.error('[HealthScoreTrend] Error aggregating branch snapshots:', e);
    }
    return [];
  }
}

/**
 * Get health score trend for a time window
 * 
 * PART 7: Company Trends Page
 * - Company Health Overview graph must aggregate daily branch health scores weighted by revenue
 * - Use rolling daily aggregation, not static snapshots
 * - Handle missing branch days gracefully
 * - Have same last-point value as Company Health Score card
 * - If 1 branch only: Graph must match branch graph exactly
 */
export function getHealthScoreTrend(
  businessGroupId: string,
  windowDays: 30 | 90,
  branchId?: string
): HealthScoreTrend {
  const endDate = normalizeDate(new Date());
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - windowDays);

  // PART 7: If branchId provided, use branch-level snapshots directly
  if (branchId) {
    const storageKey = getSnapshotStorageKey(businessGroupId, branchId);
    const snapshots = loadSnapshots<HealthScoreSnapshot>(storageKey);

    // Filter snapshots within window
    const windowSnapshots = Array.from(snapshots.values())
      .filter(s => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // PHASE 3: Check if we have sufficient data
    const hasInsufficientData = windowSnapshots.length < 5;

    if (hasInsufficientData || windowSnapshots.length === 0) {
      return {
        windowDays,
        startDate,
        endDate,
        startScore: 0,
        endScore: 0,
        delta: 0,
        trend: 'stable',
        snapshots: [],
        hasInsufficientData: true,
      };
    }

    // Calculate start score (average of first 5 days)
    const first5Days = windowSnapshots.slice(0, Math.min(5, windowSnapshots.length));
    const startScore = first5Days.reduce((sum, s) => sum + s.score, 0) / first5Days.length;

    // Calculate end score (average of last 5 days)
    const last5Days = windowSnapshots.slice(-Math.min(5, windowSnapshots.length));
    const endScore = last5Days.reduce((sum, s) => sum + s.score, 0) / last5Days.length;

    const delta = endScore - startScore;

    // Classify trend
    let trend: 'improving' | 'deteriorating' | 'stable';
    if (delta >= 5) {
      trend = 'improving';
    } else if (delta <= -5) {
      trend = 'deteriorating';
    } else {
      trend = 'stable';
    }

    return {
      windowDays,
      startDate,
      endDate,
      startScore: Math.round(startScore * 10) / 10,
      endScore: Math.round(endScore * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      trend,
      snapshots: windowSnapshots,
      hasInsufficientData: false,
    };
  }

  // PART 7: Company level - aggregate branch snapshots with revenue weighting
  const aggregatedSnapshots = aggregateBranchSnapshotsWithRevenueWeighting(
    businessGroupId,
    startDate,
    endDate
  );

  // PART 7: Check if we have sufficient data
  const hasInsufficientData = aggregatedSnapshots.length < 5;

  if (hasInsufficientData || aggregatedSnapshots.length === 0) {
    return {
      windowDays,
      startDate,
      endDate,
      startScore: 0,
      endScore: 0,
      delta: 0,
      trend: 'stable',
      snapshots: [],
      hasInsufficientData: true,
    };
  }

  // PART 7: Calculate start score (average of first 5 days)
  const first5Days = aggregatedSnapshots.slice(0, Math.min(5, aggregatedSnapshots.length));
  const startScore = first5Days.reduce((sum, s) => sum + s.score, 0) / first5Days.length;

  // PART 7: Calculate end score (average of last 5 days)
  const last5Days = aggregatedSnapshots.slice(-Math.min(5, aggregatedSnapshots.length));
  const endScore = last5Days.reduce((sum, s) => sum + s.score, 0) / last5Days.length;

  // PART 9: Ensure scores are valid
  const safeStartScore = isFinite(startScore) && !isNaN(startScore) ? startScore : 0;
  const safeEndScore = isFinite(endScore) && !isNaN(endScore) ? endScore : 0;

  const delta = safeEndScore - safeStartScore;

  // Classify trend
  let trend: 'improving' | 'deteriorating' | 'stable';
  if (delta >= 5) {
    trend = 'improving';
  } else if (delta <= -5) {
    trend = 'deteriorating';
  } else {
    trend = 'stable';
  }

  return {
    windowDays,
    startDate,
    endDate,
    startScore: Math.round(safeStartScore * 10) / 10,
    endScore: Math.round(safeEndScore * 10) / 10,
    delta: Math.round(delta * 10) / 10,
    trend,
    snapshots: aggregatedSnapshots,
    hasInsufficientData: false,
  };
}

/**
 * Get alert snapshots for a date range
 */
function getAlertSnapshotsForRange(
  businessGroupId: string,
  startDate: Date,
  endDate: Date,
  branchId?: string
): AlertSnapshot[] {
  const storageKey = getAlertSnapshotStorageKey(businessGroupId, branchId);
  const allSnapshots = loadSnapshots<AlertSnapshot>(storageKey);

  const normalizedStart = normalizeDate(startDate);
  const normalizedEnd = normalizeDate(endDate);

  return Array.from(allSnapshots.values())
    .filter(s => {
      const snapshotDate = normalizeDate(s.date);
      return snapshotDate >= normalizedStart && snapshotDate <= normalizedEnd;
    });
}

/**
 * Compare alerts before vs after
 */
export function getBeforeAfterAlertComparison(
  businessGroupId: string,
  windowDays: 30 | 90,
  branchId?: string
): BeforeAfterAlertAnalysis {
  const endDate = normalizeDate(new Date());
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - windowDays);

  // Define BEFORE period (first 7 days)
  const beforePeriodStart = new Date(startDate);
  const beforePeriodEnd = new Date(startDate);
  beforePeriodEnd.setDate(beforePeriodEnd.getDate() + 7);

  // Define AFTER period (last 7 days)
  const afterPeriodStart = new Date(endDate);
  afterPeriodStart.setDate(afterPeriodStart.getDate() - 7);
  const afterPeriodEnd = new Date(endDate);

  // Get alert snapshots for both periods
  const beforeSnapshots = getAlertSnapshotsForRange(
    businessGroupId,
    beforePeriodStart,
    beforePeriodEnd,
    branchId
  );
  const afterSnapshots = getAlertSnapshotsForRange(
    businessGroupId,
    afterPeriodStart,
    afterPeriodEnd,
    branchId
  );

  // Group alerts by alertKey
  const beforeAlertsByKey = new Map<string, AlertSnapshot[]>();
  beforeSnapshots.forEach(snapshot => {
    const existing = beforeAlertsByKey.get(snapshot.alertKey) || [];
    existing.push(snapshot);
    beforeAlertsByKey.set(snapshot.alertKey, existing);
  });

  const afterAlertsByKey = new Map<string, AlertSnapshot[]>();
  afterSnapshots.forEach(snapshot => {
    const existing = afterAlertsByKey.get(snapshot.alertKey) || [];
    existing.push(snapshot);
    afterAlertsByKey.set(snapshot.alertKey, existing);
  });

  // Get all unique alert keys
  const allAlertKeys = new Set([
    ...beforeAlertsByKey.keys(),
    ...afterAlertsByKey.keys(),
  ]);

  // Build comparisons
  const comparisons: AlertComparison[] = [];
  const resolved: AlertComparison[] = [];
  const improved: AlertComparison[] = [];
  const ongoing: AlertComparison[] = [];
  const newAlerts: AlertComparison[] = [];

  allAlertKeys.forEach(alertKey => {
    const beforeAlerts = beforeAlertsByKey.get(alertKey) || [];
    const afterAlerts = afterAlertsByKey.get(alertKey) || [];

    // Get most severe alert in each period
    const getMostSevere = (snapshots: AlertSnapshot[]) => {
      if (snapshots.length === 0) return null;
      return snapshots.reduce((mostSevere, current) => {
        const severityOrder = { critical: 3, warning: 2, informational: 1 };
        return severityOrder[current.severity] > severityOrder[mostSevere.severity]
          ? current
          : mostSevere;
      });
    };

    const beforeAlert = getMostSevere(beforeAlerts);
    const afterAlert = getMostSevere(afterAlerts);

    const beforeExists = beforeAlert !== null;
    const afterExists = afterAlert !== null;

    // Determine status
    let status: 'resolved' | 'improved' | 'ongoing' | 'new';
    if (beforeExists && !afterExists) {
      status = 'resolved';
    } else if (beforeExists && afterExists) {
      const severityOrder = { critical: 3, warning: 2, informational: 1 };
      const beforeSeverity = severityOrder[beforeAlert!.severity];
      const afterSeverity = severityOrder[afterAlert!.severity];
      if (afterSeverity < beforeSeverity) {
        status = 'improved';
      } else {
        status = 'ongoing';
      }
    } else if (!beforeExists && afterExists) {
      status = 'new';
    } else {
      status = 'ongoing'; // Should not happen, but fallback
    }

    // Human-readable alert type name
    const alertTypeName = alertKey
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const comparison: AlertComparison = {
      alertKey,
      alertType: alertTypeName,
      before: {
        exists: beforeExists,
        severity: beforeAlert?.severity,
        confidence: beforeAlert?.confidence,
      },
      after: {
        exists: afterExists,
        severity: afterAlert?.severity,
        confidence: afterAlert?.confidence,
      },
      status,
    };

    comparisons.push(comparison);

    // Categorize
    if (status === 'resolved') {
      resolved.push(comparison);
    } else if (status === 'improved') {
      improved.push(comparison);
    } else if (status === 'ongoing') {
      ongoing.push(comparison);
    } else if (status === 'new') {
      newAlerts.push(comparison);
    }
  });

  return {
    windowDays,
    beforePeriod: {
      startDate: beforePeriodStart,
      endDate: beforePeriodEnd,
    },
    afterPeriod: {
      startDate: afterPeriodStart,
      endDate: afterPeriodEnd,
    },
    comparisons,
    resolved,
    improved,
    ongoing,
    new: newAlerts,
    summary: {
      resolvedCount: resolved.length,
      improvedCount: improved.length,
      ongoingCount: ongoing.length,
      newCount: newAlerts.length,
    },
  };
}

/**
 * Check if snapshot exists for today
 */
export function hasSnapshotForToday(
  businessGroupId: string,
  branchId?: string
): boolean {
  const storageKey = getSnapshotStorageKey(businessGroupId, branchId);
  const snapshots = loadSnapshots<HealthScoreSnapshot>(storageKey);
  const todayKey = getDateKey(new Date());
  return snapshots.has(todayKey);
}
