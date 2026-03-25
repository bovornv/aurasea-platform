/**
 * Branch Anomaly Signals Service
 *
 * Read-only: `branch_business_status_api` for latest revenue + health as confidence proxy.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../lib/supabase/postgrest-missing-resource';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import {
  getBranchBusinessStatusApiTable,
  logBranchBusinessStatusApiDev,
  SELECT_BRANCH_BUSINESS_STATUS_API_ANOMALY,
  type BranchBusinessStatusApiUiSurface,
} from './db/branch-business-status-api-columns';
import { logPostgrestPhase1Read } from '../lib/supabase/postgrest-phase1-cutover';

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

const latestAnomalyInFlight = new Map<string, Promise<BranchAnomalySignalRow | null>>();

/**
 * Latest revenue + health from `branch_business_status_api`.
 */
export async function getLatestAnomalySignal(
  branchId: string,
  opts?: { uiSurface?: BranchBusinessStatusApiUiSurface }
): Promise<BranchAnomalySignalRow | null> {
  if (!branchId || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const inflight = latestAnomalyInFlight.get(branchId);
  if (inflight) return inflight;

  const promise = (async (): Promise<BranchAnomalySignalRow | null> => {
    if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.branch_business_status_api)) {
      return null;
    }

    const select = SELECT_BRANCH_BUSINESS_STATUS_API_ANOMALY;
    const table = getBranchBusinessStatusApiTable();
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('branch_id', branchId)
      .maybeSingle();

    logBranchBusinessStatusApiDev('anomaly_signals', {
      select,
      branchIds: [branchId],
      data,
      error,
      uiSurface: opts?.uiSurface ?? 'unknown',
    });
    logPostgrestPhase1Read('branch_business_status_api', {
      branchId,
      rowCount: data != null ? 1 : 0,
      error: error ? { message: error.message, code: String(error.code ?? '') } : null,
    });

    if (error) {
      if (isPostgrestObjectMissingError(error)) {
        markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.branch_business_status_api);
      }
      return null;
    }
    if (!data) return null;
    const row = data as {
      branch_id: string;
      metric_date?: string | null;
      revenue_thb?: number | null;
      health_score?: number | null;
    };
    const rev = row.revenue_thb;
    return {
      branch_id: row.branch_id,
      metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : '',
      total_revenue_thb: rev != null ? Number(rev) : null,
      revenue_avg_7d: null,
      revenue_anomaly_score: null,
      confidence_score: row.health_score != null ? Number(row.health_score) / 100 : null,
    };
  })().finally(() => {
    latestAnomalyInFlight.delete(branchId);
  });

  latestAnomalyInFlight.set(branchId, promise);
  return promise;
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
