/**
 * KPI Analytics Layer Service
 *
 * All analytics read from the database KPI layer. No frontend average calculations.
 * - branch_latest_kpi: Operating Status (latest metric per branch)
 * - branch_alerts: Alerts (revenue_alert, customer_alert, etc.)
 * - branch_recommendations: Recommendations per branch
 * - branch_kpi_metrics: Time series (metric_date, revenue, avg_revenue_7d, avg_revenue_30d)
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface BranchLatestKpiRow {
  branch_id: string;
  metric_date?: string | null;
  revenue?: number | null;
  total_revenue_thb?: number | null;
  customers?: number | null;
  rooms_sold?: number | null;
  occupancy_rate?: number | null;
  health_score?: number | null;
  confidence_score?: number | null;
  avg_revenue_7d?: number | null;
  avg_revenue_30d?: number | null;
  [key: string]: unknown;
}

/** Unified shape for Operating Status / dashboard (from branch_latest_kpi). */
export interface LatestKpiForDashboard {
  revenue: number | null;
  customers: number | null;
  roomsSold: number | null;
  occupancyRate: number | null;
  healthScore: number | null;
  confidenceScore: number | null;
  metricDate: string | null;
  avgRevenue7d: number | null;
  avgRevenue30d: number | null;
}

/** Intelligence engine branch_alerts: one row per alert with alert_message + confidence_score. */
export interface BranchAlertRow {
  branch_id: string;
  metric_date?: string | null;
  /** Primary: message from intelligence engine. */
  alert_message?: string | null;
  /** 0–100 confidence from engine. */
  confidence_score?: number | null;
  /** Legacy columns (optional if engine uses alert_message). */
  revenue_alert?: string | null;
  customer_alert?: string | null;
  occupancy_alert?: string | null;
  cost_alert?: string | null;
  cash_alert?: string | null;
  [key: string]: unknown;
}

export interface BranchRecommendationRow {
  branch_id: string;
  recommendation?: string | null;
  category?: string | null;
  priority?: number | null;
  metric_date?: string | null;
  [key: string]: unknown;
}

export interface BranchKpiMetricRow {
  branch_id: string;
  metric_date: string;
  revenue?: number | null;
  avg_revenue_7d?: number | null;
  avg_revenue_30d?: number | null;
  health_score?: number | null;
  [key: string]: unknown;
}

function rejectMockBranchId(branchId: string): void {
  if (branchId == null || branchId === '') throw new Error('branchId is required.');
  if (branchId.startsWith('bg_')) throw new Error('Mock branchId not allowed.');
}

/**
 * Get latest KPI for a branch (Operating Status).
 * Reads from branch_latest_kpi. One row per branch.
 */
export async function getLatestKpiForDashboard(
  branchId: string
): Promise<LatestKpiForDashboard | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('branch_latest_kpi')
      .select('*')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[KpiAnalytics] branch_latest_kpi error:', error.message);
      }
      return null;
    }

    const row = data as BranchLatestKpiRow | null;
    if (!row) return null;

    const revenue =
      row.revenue != null ? Number(row.revenue) : (row.total_revenue_thb != null ? Number(row.total_revenue_thb) : null);

    return {
      revenue,
      customers: row.customers != null ? Number(row.customers) : null,
      roomsSold: row.rooms_sold != null ? Number(row.rooms_sold) : null,
      occupancyRate: row.occupancy_rate != null ? Number(row.occupancy_rate) : null,
      healthScore: row.health_score != null ? Number(row.health_score) : null,
      confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
      metricDate: row.metric_date ?? null,
      avgRevenue7d: row.avg_revenue_7d != null ? Number(row.avg_revenue_7d) : null,
      avgRevenue30d: row.avg_revenue_30d != null ? Number(row.avg_revenue_30d) : null,
    };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[KpiAnalytics] getLatestKpiForDashboard error:', e);
    }
    return null;
  }
}

/** Row from branch_latest_alerts (single latest alert per branch). */
export interface BranchLatestAlertRow {
  branch_id: string;
  metric_date?: string | null;
  alert_message?: string | null;
  alert_type?: string | null;
  alert_category?: string | null;
  revenue_alert?: string | null;
  customer_alert?: string | null;
  occupancy_alert?: string | null;
  confidence_score?: number | null;
  [key: string]: unknown;
}

/** Row from branch_active_alerts (alerts from last 3 days). Same display shape as BranchAlertsTodayRow. */
export interface BranchActiveAlertRow {
  branch_id: string;
  metric_date?: string | null;
  alert_message?: string | null;
  alert_type?: string | null;
  alert_category?: string | null;
  alert_severity?: string | null;
  recommendation?: string | null;
  estimated_revenue_impact?: number | null;
  confidence_score?: number | null;
  revenue_alert?: string | null;
  customer_alert?: string | null;
  occupancy_alert?: string | null;
  [key: string]: unknown;
}

/**
 * Fetch the latest alert for a branch from branch_latest_alerts (one row).
 */
export async function getLatestAlertFromBranchLatestAlerts(
  branchId: string
): Promise<BranchLatestAlertRow | null> {
  if (branchId == null || branchId === '') return null;
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('branch_latest_alerts')
      .select('*')
      .eq('branch_id', branchId)
      .maybeSingle();
    if (error || data == null) return null;
    return data as BranchLatestAlertRow;
  } catch {
    return null;
  }
}

/**
 * Fetch active alerts for a branch from branch_active_alerts (last 3 days).
 * Ordered by metric_date descending.
 */
export async function getActiveAlertsFromBranchActiveAlerts(
  branchId: string
): Promise<BranchActiveAlertRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('branch_active_alerts')
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });
    if (error) return [];
    return (data ?? []) as BranchActiveAlertRow[];
  } catch {
    return [];
  }
}

/** Row from branch_alerts_engine view. Includes alert_phase (1, 2, 3) for learning-phase filtering. */
export interface BranchAlertsEngineRow {
  branch_id: string;
  metric_date?: string | null;
  alert_message?: string | null;
  alert_type?: string | null;
  alert_category?: string | null;
  confidence_score?: number | null;
  alert_phase?: number | null;
  data_days?: number | null;
  [key: string]: unknown;
}

/**
 * Fetch alerts from branch_alerts_engine for a branch.
 * Ordered by metric_date descending. Caller should filter by category not null, dedupe by category, and apply phase rules.
 */
export async function getAlertsFromBranchAlertsEngine(
  branchId: string
): Promise<BranchAlertsEngineRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('branch_alerts_engine')
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });
    if (error) return [];
    return (data ?? []) as BranchAlertsEngineRow[];
  } catch {
    return [];
  }
}

/** Row from branch_alerts_today view. */
export interface BranchAlertsTodayRow {
  branch_id: string;
  metric_date?: string | null;
  alert_message?: string | null;
  alert_type?: string | null;
  alert_category?: string | null;
  alert_severity?: string | null;
  recommendation?: string | null;
  confidence_score?: number | null;
  estimated_revenue_impact?: number | null;
  alert_phase?: number | null;
  [key: string]: unknown;
}

/** Severity sort order: high=1, medium=2, else=3 (for order by severity then metric_date desc). */
export function severityOrder(severity: string | null | undefined): number {
  const s = (severity ?? '').toString().toLowerCase();
  if (s === 'high') return 1;
  if (s === 'medium') return 2;
  return 3;
}

/**
 * Fetch alerts from branch_alerts_today for a branch.
 * Order: severity (high, medium, else) then metric_date desc (applied client-side).
 */
export async function getAlertsFromBranchAlertsToday(
  branchId: string
): Promise<BranchAlertsTodayRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('branch_alerts_today')
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });
    if (error) return [];
    const rows = (data ?? []) as BranchAlertsTodayRow[];
    rows.sort((a, b) => {
      const orderA = severityOrder(a.alert_severity);
      const orderB = severityOrder(b.alert_severity);
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.metric_date ?? '';
      const dateB = b.metric_date ?? '';
      return dateB.localeCompare(dateA);
    });
    return rows;
  } catch {
    return [];
  }
}

/**
 * Get alerts for a branch from branch_alerts (intelligence engine).
 * Ordered by metric_date descending. Prefer alert_message; support legacy revenue_alert/customer_alert etc.
 */
export async function getBranchAlertsFromKpi(branchId: string): Promise<BranchAlertRow[]> {
  if (branchId == null || branchId === '') return [];
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return [];

  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('branch_alerts')
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[KpiAnalytics] branch_alerts error:', error.message);
      }
      return [];
    }

    const rows = (data ?? []) as BranchAlertRow[];
    return rows.filter(
      (r) =>
        (r.alert_message != null && String(r.alert_message).trim() !== '') ||
        r.revenue_alert != null ||
        r.customer_alert != null ||
        r.occupancy_alert != null ||
        r.cost_alert != null ||
        r.cash_alert != null
    );
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[KpiAnalytics] getBranchAlertsFromKpi error:', e);
    }
    return [];
  }
}

/**
 * Get recommendations for a branch from branch_recommendations.
 * Returns rows with non-null recommendation.
 */
export async function getBranchRecommendationsFromKpi(
  branchId: string
): Promise<BranchRecommendationRow[]> {
  if (branchId == null || branchId === '') return [];
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return [];

  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('branch_recommendations')
      .select('*')
      .eq('branch_id', branchId);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[KpiAnalytics] branch_recommendations error:', error.message);
      }
      return [];
    }

    const rows = (data ?? []) as BranchRecommendationRow[];
    return rows.filter((r) => r.recommendation != null && String(r.recommendation).trim() !== '');
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[KpiAnalytics] getBranchRecommendationsFromKpi error:', e);
    }
    return [];
  }
}

/**
 * Get KPI metrics time series for Trends.
 * Uses branch_kpi_metrics (metric_date, revenue, avg_revenue_7d, avg_revenue_30d).
 * No frontend average calculation.
 */
export async function getBranchKpiMetrics(
  branchId: string,
  days?: number
): Promise<BranchKpiMetricRow[]> {
  if (branchId == null || branchId === '') return [];
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return [];

  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    let query = supabase
      .from('branch_kpi_metrics')
      .select('metric_date, revenue, avg_revenue_7d, avg_revenue_30d')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: true });

    if (days != null && days > 0) {
      const start = new Date();
      start.setDate(start.getDate() - days);
      const startStr = start.toISOString().slice(0, 10);
      query = query.gte('metric_date', startStr);
    }

    const { data, error } = await query;

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[KpiAnalytics] branch_kpi_metrics error:', error.message);
      }
      return [];
    }

    return (data ?? []) as BranchKpiMetricRow[];
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[KpiAnalytics] getBranchKpiMetrics error:', e);
    }
    return [];
  }
}
