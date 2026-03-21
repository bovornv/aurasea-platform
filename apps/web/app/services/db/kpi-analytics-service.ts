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

/** Row from branch_intelligence_engine (alerts shape: alert_type, alert_message, recommendation, confidence_score, estimated_revenue_impact). */
export interface BranchIntelligenceEngineRow {
  branch_id: string;
  metric_date?: string | null;
  alert_type?: string | null;
  alert_message?: string | null;
  recommendation?: string | null;
  confidence_score?: number | null;
  estimated_revenue_impact?: number | null;
  [key: string]: unknown;
}

/**
 * Fetch alerts from branch_intelligence_engine for a branch.
 * /rest/v1/branch_intelligence_engine
 */
export async function getAlertsFromBranchIntelligenceEngine(
  branchId: string
): Promise<BranchIntelligenceEngineRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('branch_intelligence_engine')
      .select('branch_id, metric_date, alert_type, alert_message, recommendation, confidence_score, estimated_revenue_impact')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });
    if (error) return [];
    return (data ?? []) as BranchIntelligenceEngineRow[];
  } catch {
    return [];
  }
}

/** Row from branch_alerts_today view. */
export interface BranchAlertsTodayRow {
  branch_id: string;
  branch_type?: string | null;
  alert_stream?: string | null;
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
 * Optional `stream`: accommodation | fnb — API + client filter (same as branch Today).
 * Order: severity (high, medium, else) then metric_date desc (applied client-side).
 */
export async function getAlertsFromBranchAlertsToday(
  branchId: string,
  stream: 'accommodation' | 'fnb' | null = null
): Promise<BranchAlertsTodayRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    let q = supabase.from('branch_alerts_today').select('*').eq('branch_id', branchId);
    if (stream === 'accommodation' || stream === 'fnb') {
      q = q.eq('alert_stream', stream);
    }
    const { data, error } = await q.order('metric_date', { ascending: false });
    if (error) {
      if (process.env.NODE_ENV === 'development') {
        const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
        if (base) {
          const typeQ =
            stream === 'accommodation' || stream === 'fnb'
              ? `&alert_stream=eq.${encodeURIComponent(stream)}`
              : '';
          console.warn(
            '[kpi-analytics] branch_alerts_today:',
            error.message,
            `${base}/rest/v1/branch_alerts_today?select=*&branch_id=eq.${encodeURIComponent(branchId)}${typeQ}`
          );
        }
      }
      return [];
    }
    let rows = (data ?? []) as BranchAlertsTodayRow[];
    if (stream === 'accommodation' || stream === 'fnb') {
      rows = rows.filter((a) => String(a.alert_stream ?? '').toLowerCase() === stream);
    }
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

/** Row from fnb_alerts_today view (F&B only). Display: alert_name, alert_message, recommendation, confidence, estimated_revenue_impact. */
export interface FnbAlertsTodayRow {
  branch_id: string;
  metric_date?: string | null;
  alert_name?: string | null;
  alert_message?: string | null;
  recommendation?: string | null;
  confidence?: number | null;
  estimated_revenue_impact?: number | null;
  [key: string]: unknown;
}

/** Row from branch_alerts_display — single source for Accommodation and F&B alerts. All text from DB (message_th/en, action_th/en). */
export interface BranchAlertsDisplayRow {
  branch_id: string;
  metric_date?: string | null;
  business_type?: string | null;
  alert_code?: string | null;
  message_th?: string | null;
  message_en?: string | null;
  action_th?: string | null;
  action_en?: string | null;
  confidence_score?: number | null;
  estimated_revenue_impact?: number | null;
  alert_severity?: string | null;
  [key: string]: unknown;
}

/**
 * Fetch alerts from branch_alerts_display for a branch.
 * View filters alerts internally; no business_type filter. Map: message_en/th → title, action_en/th → suggested action, confidence_score, estimated_revenue_impact.
 */
export async function getAlertsFromBranchAlertsDisplay(branchId: string): Promise<BranchAlertsDisplayRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('branch_alerts_display')
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });
    if (error) return [];
    return (data ?? []) as BranchAlertsDisplayRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch alerts from fnb_alerts_today for F&B. Used as fallback when branch_alerts_display returns no rows.
 */
export async function getAlertsFromFnbAlertsToday(
  branchId: string
): Promise<FnbAlertsTodayRow[]> {
  if (branchId == null || branchId === '') return [];
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('fnb_alerts_today')
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false });
    if (error) return [];
    return (data ?? []) as FnbAlertsTodayRow[];
  } catch {
    return [];
  }
}

/** Shape returned by fnb_financial_impact view select(branch_id, metric_date, revenue). */
export interface FnbFinancialImpactSelectRow {
  branch_id: string;
  metric_date?: string | null;
  revenue?: number | null;
}

/** Row from fnb_financial_impact view. Select: branch_id, metric_date, revenue. Impact fields default to 0 for UI. */
export interface FnbFinancialImpactRow {
  branch_id: string;
  metric_date?: string | null;
  revenue?: number | null;
  total_revenue_at_risk?: number | null;
  total_opportunity_gain?: number | null;
  critical_alerts?: number | null;
  warnings?: number | null;
  [key: string]: unknown;
}

/** Row from accommodation_financial_impact. One row per branch. */
export interface AccommodationFinancialImpactRow {
  branch_id: string;
  total_revenue_at_risk?: number | null;
  total_opportunity_gain?: number | null;
  critical_alerts?: number | null;
  warnings?: number | null;
  [key: string]: unknown;
}

/**
 * Fetch F&B financial impact from fnb_financial_impact view.
 * Query: .from("fnb_financial_impact").select("branch_id, metric_date, revenue").eq("branch_id", branchId).maybeSingle()
 * Returns null if view is missing (404), no row, or error. Safe for missing view/table.
 */
export async function getFnbFinancialImpact(
  branchId: string
): Promise<FnbFinancialImpactRow | null> {
  if (branchId == null || branchId === '') return null;
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('fnb_financial_impact')
      .select('branch_id, metric_date, revenue')
      .eq('branch_id', branchId)
      .maybeSingle();
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      const code = String(error.code ?? '');
      const isNotFound =
        code === 'PGRST116' || code === '404' ||
        msg.includes('404') || msg.includes('relation') || msg.includes('does not exist');
      if (isNotFound) return null;
      return null;
    }
    if (data == null) return null;
    const row = data as FnbFinancialImpactSelectRow;
    return {
      branch_id: row.branch_id,
      metric_date: row.metric_date ?? null,
      revenue: row.revenue ?? null,
      total_revenue_at_risk: 0,
      total_opportunity_gain: 0,
      critical_alerts: 0,
      warnings: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch financial impact from accommodation_financial_impact for an accommodation branch.
 * Query: .from("accommodation_financial_impact").select("*").eq("branch_id", branchId).single()
 */
export async function getAccommodationFinancialImpact(
  branchId: string
): Promise<AccommodationFinancialImpactRow | null> {
  if (branchId == null || branchId === '') return null;
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('accommodation_financial_impact')
      .select('*')
      .eq('branch_id', branchId)
      .single();
    if (error) return null;
    return data as AccommodationFinancialImpactRow | null;
  } catch {
    return null;
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
 * Get recommendations for a branch from alerts_final (core view).
 * Maps alert_type to recommendation; returns rows with non-null recommendation.
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
      .from('alerts_final')
      .select('branch_id, metric_date, alert_type')
      .eq('branch_id', branchId);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[KpiAnalytics] alerts_final error:', error.message);
      }
      return [];
    }

    const rows = (data ?? []) as Array<{ branch_id: string; metric_date?: string | null; alert_type?: string | null }>;
    return rows
      .filter((r) => r.alert_type != null && String(r.alert_type).trim() !== '')
      .map((r) => ({
        branch_id: r.branch_id,
        metric_date: r.metric_date ?? null,
        recommendation: r.alert_type ?? null,
        category: null,
        priority: null,
      } as BranchRecommendationRow));
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
