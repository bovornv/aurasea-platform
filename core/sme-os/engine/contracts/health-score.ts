/**
 * Health Score Contracts
 * 
 * Defines data structures for health score tracking, trends, and snapshots.
 */

/**
 * Daily Health Score Snapshot
 * Captures the health score state for a specific date
 */
export interface HealthScoreSnapshot {
  date: Date; // Date of snapshot (normalized to start of day)
  score: number; // Health score (0-100)
  totalPenalty: number; // Total penalty applied
  alertCounts: {
    critical: number;
    warning: number; // Maps to "high" in some contexts
    informational: number; // Maps to "medium" in some contexts
  };
  branchId?: string; // Branch ID if branch-specific
  businessGroupId?: string; // Business group ID
}

/**
 * Alert Snapshot
 * Captures alert state for a specific date
 */
export interface AlertSnapshot {
  date: Date; // Date of snapshot
  alertKey: string; // Alert type identifier (e.g., "cash-runway", "demand-drop")
  alertId: string; // Full alert ID
  severity: 'critical' | 'warning' | 'informational';
  confidence: number; // 0-1
  branchId?: string; // Branch ID if branch-specific
  businessGroupId?: string; // Business group ID
}

/**
 * Health Score Trend
 * Calculated trend over a time window
 */
export interface HealthScoreTrend {
  windowDays: number; // 30 or 90
  startDate: Date;
  endDate: Date;
  startScore: number; // Average of first 5 days
  endScore: number; // Average of last 5 days
  delta: number; // endScore - startScore
  trend: 'improving' | 'deteriorating' | 'stable';
  snapshots: HealthScoreSnapshot[]; // All snapshots in window
  hasInsufficientData: boolean; // True if < 10 days of data
}

/**
 * Alert Comparison Result
 * Comparison of alerts between BEFORE and AFTER periods
 */
export interface AlertComparison {
  alertKey: string;
  alertType: string; // Human-readable alert type name
  before: {
    exists: boolean;
    severity?: 'critical' | 'warning' | 'informational';
    confidence?: number;
  };
  after: {
    exists: boolean;
    severity?: 'critical' | 'warning' | 'informational';
    confidence?: number;
  };
  status: 'resolved' | 'improved' | 'ongoing' | 'new';
}

/**
 * Before/After Alert Analysis
 * Complete analysis of alert changes
 */
export interface BeforeAfterAlertAnalysis {
  windowDays: number; // 30 or 90
  beforePeriod: {
    startDate: Date;
    endDate: Date;
  };
  afterPeriod: {
    startDate: Date;
    endDate: Date;
  };
  comparisons: AlertComparison[];
  resolved: AlertComparison[];
  improved: AlertComparison[];
  ongoing: AlertComparison[];
  new: AlertComparison[];
  summary: {
    resolvedCount: number;
    improvedCount: number;
    ongoingCount: number;
    newCount: number;
  };
}
