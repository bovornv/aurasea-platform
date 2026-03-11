/**
 * Latest Metrics Service
 *
 * Prefer KPI layer: branch_latest_kpi (one row per branch).
 * Fallback: fnb_latest_metrics and accommodation_latest_metrics for backward compatibility.
 * Use for Operating Status dashboard.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { getLatestKpiForDashboard } from './kpi-analytics-service';

export type BranchModuleType = 'accommodation' | 'fnb';

/** F&B view row (fnb_latest_metrics). */
export interface FnbLatestMetricRow {
  branch_id: string;
  metric_date?: string;
  total_revenue_thb?: number | null;
  total_customers?: number | null;
  health_score?: number | null;
  confidence_score?: number | null;
  [key: string]: unknown;
}

/** Accommodation view row (accommodation_latest_metrics). Uses total_revenue_thb for revenue. */
export interface AccommodationLatestMetricRow {
  branch_id: string;
  metric_date?: string;
  total_revenue_thb?: number | null;
  rooms_sold?: number | null;
  rooms_available?: number | null;
  occupancy_rate?: number | null;
  health_score?: number | null;
  confidence_score?: number | null;
  [key: string]: unknown;
}

/** Unified shape for dashboard cards (no date filter). */
export interface LatestMetricForDashboard {
  revenue: number | null;
  customers: number | null;
  roomsSold: number | null;
  occupancyRate: number | null;
  healthScore: number | null;
  confidenceScore: number | null;
  metricDate: string | null;
}

function rejectMockBranchId(branchId: string): void {
  if (branchId == null || branchId === '') {
    throw new Error('branchId is required.');
  }
  if (branchId.startsWith('bg_')) {
    throw new Error('Mock branchId not allowed.');
  }
}

/**
 * Get the latest metric for a branch from the KPI layer or legacy views.
 * Prefer branch_latest_kpi; fallback to fnb_latest_metrics / accommodation_latest_metrics.
 */
export async function getLatestMetricForDashboard(
  branchId: string,
  moduleType: BranchModuleType | null | undefined
): Promise<LatestMetricForDashboard | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  try {
    const kpi = await getLatestKpiForDashboard(branchId);
    if (kpi != null) {
      return {
        revenue: kpi.revenue,
        customers: kpi.customers,
        roomsSold: kpi.roomsSold,
        occupancyRate: kpi.occupancyRate,
        healthScore: kpi.healthScore,
        confidenceScore: kpi.confidenceScore,
        metricDate: kpi.metricDate,
      };
    }
  } catch (_) {
    // Fall through to legacy views
  }

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    if (moduleType === 'fnb') {
      const { data, error } = await supabase
        .from('fnb_latest_metrics')
        .select('*')
        .eq('branch_id', branchId)
        .maybeSingle();

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[LatestMetricsService] fnb_latest_metrics error:', error.message);
        }
        return null;
      }
      const row = data as FnbLatestMetricRow | null;
      if (!row) return null;

      return {
        revenue: row.total_revenue_thb != null ? Number(row.total_revenue_thb) : null,
        customers: row.total_customers != null ? Number(row.total_customers) : null,
        roomsSold: null,
        occupancyRate: null,
        healthScore: row.health_score != null ? Number(row.health_score) : null,
        confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
        metricDate: row.metric_date ?? null,
      };
    }

    if (moduleType === 'accommodation') {
      const { data, error } = await supabase
        .from('accommodation_latest_metrics')
        .select('*')
        .eq('branch_id', branchId)
        .maybeSingle();

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[LatestMetricsService] accommodation_latest_metrics error:', error.message);
        }
        return null;
      }
      const row = data as AccommodationLatestMetricRow | null;
      if (!row) return null;

      let revenue: number | null = row.total_revenue_thb != null ? Number(row.total_revenue_thb) : null;
      if (revenue == null) {
        const { data: fallbackRow } = await supabase
          .from('accommodation_daily_metrics')
          .select('total_revenue_thb')
          .eq('branch_id', branchId)
          .order('metric_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        const r = fallbackRow as { total_revenue_thb?: number | null } | null;
        revenue = r?.total_revenue_thb != null ? Number(r.total_revenue_thb) : null;
      }
      return {
        revenue,
        customers: null,
        roomsSold: row.rooms_sold != null ? Number(row.rooms_sold) : null,
        occupancyRate: row.occupancy_rate != null ? Number(row.occupancy_rate) : null,
        healthScore: row.health_score != null ? Number(row.health_score) : null,
        confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
        metricDate: row.metric_date ?? null,
      };
    }

    // Unknown module: try both views (e.g. branch has no moduleType set)
    const [fnbRes, accRes] = await Promise.all([
      supabase.from('fnb_latest_metrics').select('*').eq('branch_id', branchId).maybeSingle(),
      supabase.from('accommodation_latest_metrics').select('*').eq('branch_id', branchId).maybeSingle(),
    ]);

    const fnbRow = fnbRes.data as FnbLatestMetricRow | null;
    const accRow = accRes.data as AccommodationLatestMetricRow | null;
    if (fnbRow) {
      return {
        revenue: fnbRow.total_revenue_thb != null ? Number(fnbRow.total_revenue_thb) : null,
        customers: fnbRow.total_customers != null ? Number(fnbRow.total_customers) : null,
        roomsSold: null,
        occupancyRate: null,
        healthScore: fnbRow.health_score != null ? Number(fnbRow.health_score) : null,
        confidenceScore: fnbRow.confidence_score != null ? Number(fnbRow.confidence_score) : null,
        metricDate: fnbRow.metric_date ?? null,
      };
    }
    if (accRow) {
      const ar = accRow as AccommodationLatestMetricRow;
      let accRevenue: number | null = ar.total_revenue_thb != null ? Number(ar.total_revenue_thb) : null;
      if (accRevenue == null) {
        const { data: fallbackRow } = await supabase
          .from('accommodation_daily_metrics')
          .select('total_revenue_thb')
          .eq('branch_id', branchId)
          .order('metric_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        const r = fallbackRow as { total_revenue_thb?: number | null } | null;
        accRevenue = r?.total_revenue_thb != null ? Number(r.total_revenue_thb) : null;
      }
      return {
        revenue: accRevenue,
        customers: null,
        roomsSold: accRow.rooms_sold != null ? Number(accRow.rooms_sold) : null,
        occupancyRate: accRow.occupancy_rate != null ? Number(accRow.occupancy_rate) : null,
        healthScore: accRow.health_score != null ? Number(accRow.health_score) : null,
        confidenceScore: accRow.confidence_score != null ? Number(accRow.confidence_score) : null,
        metricDate: accRow.metric_date ?? null,
      };
    }
    return null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[LatestMetricsService] getLatestMetricForDashboard error:', e);
    }
    return null;
  }
}
