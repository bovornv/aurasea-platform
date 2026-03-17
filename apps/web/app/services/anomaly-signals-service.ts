/**
 * Branch Anomaly Signals Service
 *
 * Read-only: uses core view today_summary_clean for latest revenue/confidence.
 * Anomaly-style alerts can also come from alerts_final (alert_type, severity).
 */

import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

export interface BranchAnomalySignalRow {
  branch_id: string;
  metric_date: string;
  total_revenue_thb: number | null;
  revenue_avg_7d: number | null;
  revenue_anomaly_score: number | null;
  confidence_score: number | null;
}

export interface AnomalyAlert {
  id: string;
  message: string;
  severity: 'critical' | 'warning' | 'informational';
}

/**
 * Fetch latest row from today_summary_clean for a branch (revenue, health as confidence proxy).
 */
export async function getLatestAnomalySignal(
  branchId: string
): Promise<BranchAnomalySignalRow | null> {
  if (!branchId || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('today_summary_clean')
    .select('branch_id, metric_date, revenue, health_score')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AnomalySignals] today_summary_clean error:', error.message);
    }
    return null;
  }
  if (!data) return null;
  const row = data as { branch_id: string; metric_date?: string | null; revenue?: number | null; health_score?: number | null };
  return {
    branch_id: row.branch_id,
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : '',
    total_revenue_thb: row.revenue != null ? Number(row.revenue) : null,
    revenue_avg_7d: null,
    revenue_anomaly_score: null,
    confidence_score: row.health_score != null ? Number(row.health_score) / 100 : null,
  };
}

/**
 * Generate alerts from revenue_anomaly_score:
 * < -2 → "Revenue significantly below normal trend"
 * > 2  → "Revenue significantly above normal trend"
 */
export function getAnomalyAlertsFromSignal(
  signal: BranchAnomalySignalRow | null,
  branchId: string,
  locale: 'th' | 'en' = 'en'
): AnomalyAlert[] {
  if (!signal || signal.revenue_anomaly_score == null) return [];

  const score = signal.revenue_anomaly_score;
  const alerts: AnomalyAlert[] = [];

  if (score < -2) {
    alerts.push({
      id: `anomaly-revenue-below-${signal.metric_date}-${branchId}`,
      message:
        locale === 'th'
          ? 'รายได้ต่ำกว่าแนวโน้มปกติอย่างมีนัยสำคัญ'
          : 'Revenue significantly below normal trend',
      severity: 'warning',
    });
  }
  if (score > 2) {
    alerts.push({
      id: `anomaly-revenue-above-${signal.metric_date}-${branchId}`,
      message:
        locale === 'th'
          ? 'รายได้สูงกว่าแนวโน้มปกติอย่างมีนัยสำคัญ'
          : 'Revenue significantly above normal trend',
      severity: 'informational',
    });
  }

  return alerts;
}

/**
 * Convert anomaly alerts to AlertContract for merging with branch alerts.
 */
export function anomalyAlertsToContracts(
  anomalyAlerts: AnomalyAlert[],
  branchId: string
): AlertContract[] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return anomalyAlerts.map((a) => ({
    id: a.id,
    timestamp: now,
    type: 'anomaly' as const,
    severity: a.severity,
    domain: 'risk' as const,
    timeHorizon: 'immediate' as const,
    relevanceWindow: { start, end: now },
    message: a.message,
    confidence: 0.8,
    contributingFactors: [],
    conditions: ['revenue_anomaly_signal'],
    branchId,
  }));
}
