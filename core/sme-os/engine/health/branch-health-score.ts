/**
 * Branch Health Score Computation
 * 
 * Calculates a health score (0-100) for a branch based on active alerts.
 * 
 * Rules:
 * - Start with base score of 100
 * - Deduct points based on alert-specific penalties (type + severity)
 * - Apply confidence adjustments (low confidence = 50% penalty)
 * - Handle duplicate alerts in same category (first = 100%, subsequent = 50%)
 * - Cap total penalty at 80 (minimum score = 20)
 * - Reward positive momentum (decreasing alerts)
 * - Return structured result with score, label, and summary
 * 
 * This module does NOT recompute alert logic - it only consumes alert outputs.
 */

import type { AlertContract } from '../../contracts/alerts';
import { calculateHealthScoreFromAlerts } from '../services/alert-health-score-mapper';

export type HealthStatusLabel = 'Healthy' | 'Stable' | 'At Risk' | 'Critical';

export interface AlertSummary {
  critical: number;
  warning: number;
  informational: number;
  total: number;
}

export interface BranchHealthScoreResult {
  score: number; // 0-100
  statusLabel: HealthStatusLabel;
  alertSummary: AlertSummary;
  topIssues: string[]; // Top 2 alert titles
  totalPenalty?: number; // Total penalty applied (for explanation)
  activeAlertCount?: number; // Number of active alerts (for explanation)
}

/**
 * Calculate branch health score from active alerts
 * 
 * @param alerts - Array of active AlertContract instances for the branch
 * @param previousAlertCount - Optional: previous period's alert count for momentum calculation
 * @returns BranchHealthScoreResult with score, label, and summary
 */
export function calculateBranchHealthScore(
  alerts: AlertContract[],
  previousAlertCount?: number
): BranchHealthScoreResult {
  // Defensive: Handle null/undefined alerts
  if (!alerts || !Array.isArray(alerts)) {
    return {
      score: 0,
      statusLabel: 'Critical',
      alertSummary: { critical: 0, warning: 0, informational: 0, total: 0 },
      topIssues: [],
      totalPenalty: 0,
      activeAlertCount: 0,
    };
  }

  // Count alerts by severity (for summary) - filter out invalid alerts
  const validAlerts = alerts.filter(a => a && a.severity);
  const criticalCount = validAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = validAlerts.filter(a => a.severity === 'warning').length;
  const informationalCount = validAlerts.filter(a => a.severity === 'informational').length;
  const totalAlertCount = validAlerts.length;

  // Calculate health score using alert-specific penalty mapping
  const healthScoreResult = calculateHealthScoreFromAlerts(validAlerts);
  let score = Math.max(0, Math.min(100, healthScoreResult.score || 50)); // Ensure valid score

  // Reward positive momentum: +5 if alerts decreased vs previous period (max once)
  if (previousAlertCount !== undefined && typeof previousAlertCount === 'number' && 
      totalAlertCount < previousAlertCount) {
    score = Math.min(100, score + 5); // Cap at 100 maximum
  }

  // Ensure score is valid before determining status
  if (isNaN(score) || !isFinite(score)) {
    score = 0;
  }
  score = Math.max(0, Math.min(100, score));

  // Determine health status label based on score
  const statusLabel = getHealthStatusLabel(score);

  // Get top 2 alert titles (prioritize by severity: critical > warning > informational)
  const topIssues = getTopIssues(validAlerts);

  // Build alert summary
  const alertSummary: AlertSummary = {
    critical: Math.max(0, criticalCount),
    warning: Math.max(0, warningCount),
    informational: Math.max(0, informationalCount),
    total: Math.max(0, totalAlertCount),
  };

  return {
    score: Math.round(score * 10) / 10, // Round to 1 decimal place
    statusLabel,
    alertSummary,
    topIssues,
    totalPenalty: Math.max(0, healthScoreResult.totalPenalty || 0),
    activeAlertCount: Math.max(0, healthScoreResult.activeAlertCount || 0),
  };
}

/**
 * Get health status label based on score
 */
function getHealthStatusLabel(score: number): HealthStatusLabel {
  if (score >= 80) {
    return 'Healthy';
  } else if (score >= 60) {
    return 'Stable';
  } else if (score >= 40) {
    return 'At Risk';
  } else {
    return 'Critical';
  }
}

/**
 * Get top 2 alert titles, prioritized by severity
 */
function getTopIssues(alerts: AlertContract[]): string[] {
  if (alerts.length === 0) {
    return [];
  }

  // Sort alerts by severity priority (critical > warning > informational)
  // Then by timestamp (newest first)
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder: Record<string, number> = {
      critical: 3,
      warning: 2,
      informational: 1,
    };

    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    // If same severity, sort by timestamp (newest first)
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  // Extract titles (use message if title not available)
  const titles = sortedAlerts
    .slice(0, 2)
    .map(alert => alert.message || `Alert: ${alert.id}`);

  return titles;
}
