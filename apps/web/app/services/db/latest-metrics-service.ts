/**
 * Latest Metrics Service
 *
 * Operating Status: single unified source per business type.
 * F&B → fnb_latest_metrics. Accommodation → accommodation_latest_metrics.
 * No branch_latest_kpi, anomaly, or daily_metrics for revenue/customers/confidence/health.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export type BranchModuleType = 'accommodation' | 'fnb';

/** Raw row from fnb_latest_metrics or accommodation_latest_metrics for Operating Status cards. */
export interface OperatingStatusRow {
  branch_id: string;
  metric_date?: string | null;
  /** F&B: total_revenue_thb. Accommodation: revenue. */
  revenue?: number | null;
  total_revenue_thb?: number | null;
  total_customers?: number | null;
  health_score?: number | null;
  confidence_score?: number | null;
  rooms_sold?: number | null;
  rooms_available?: number | null;
  occupancy_rate?: number | null;
  [key: string]: unknown;
}

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

/** Row from fnb_operating_status view — single source for F&B Operating Status. */
export interface FnbOperatingStatusRow {
  branch_id: string;
  metric_date?: string | null;
  health_score?: number | null;
  todays_revenue?: number | null;
  total_customers?: number | null;
  early_signal?: string | null;
  confidence?: number | null;
  data_days?: number | null;
  required_days?: number | null;
  avg_ticket?: number | null;
  [key: string]: unknown;
}

/**
 * Load F&B Operating Status. Prefer fnb_operating_status view; if missing or empty, fall back to fnb_latest_metrics so cards show values from Supabase.
 */
export async function getFnbOperatingStatus(
  branchId: string
): Promise<FnbOperatingStatusRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: viewData, error: viewError } = await supabase
    .from('fnb_operating_status')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (!viewError && viewData != null) {
    if (process.env.NODE_ENV === 'development') {
      console.log('F&B Operating Status data source: fnb_operating_status', viewData);
    }
    const row = viewData as Record<string, unknown>;
    return {
      branch_id: branchId,
      metric_date: row.metric_date ?? undefined,
      health_score: row.health_score != null ? Number(row.health_score) : null,
      todays_revenue: (row.todays_revenue ?? row.revenue ?? row.total_revenue_thb) != null ? Number(row.todays_revenue ?? row.revenue ?? row.total_revenue_thb) : null,
      total_customers: row.total_customers != null ? Number(row.total_customers) : null,
      early_signal: row.early_signal != null && String(row.early_signal).trim() !== '' ? String(row.early_signal) : 'normal',
      confidence: row.confidence != null ? Number(row.confidence) : (row.confidence_score != null ? Number(row.confidence_score) : null),
      data_days: row.data_days != null ? Number(row.data_days) : null,
      required_days: row.required_days != null ? Number(row.required_days) : null,
      avg_ticket: row.avg_ticket != null ? Number(row.avg_ticket) : null,
    } as FnbOperatingStatusRow;
  }

  if (process.env.NODE_ENV === 'development' && viewError) {
    console.warn('[LatestMetricsService] fnb_operating_status error (fallback to fnb_latest_metrics):', viewError.message);
  }

  const { data: latestData, error: latestError } = await supabase
    .from('fnb_latest_metrics')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (latestError || latestData == null) return null;

  const row = latestData as Record<string, unknown>;
  const revenue = (row.revenue ?? row.total_revenue_thb) != null ? Number(row.revenue ?? row.total_revenue_thb) : null;
  const customers = row.total_customers != null ? Number(row.total_customers) : null;
  const confidenceScore = row.confidence_score != null ? Number(row.confidence_score) : null;

  if (process.env.NODE_ENV === 'development') {
    console.log('F&B Operating Status data source: fnb_latest_metrics (fallback)', latestData);
  }

  return {
    branch_id: branchId,
    metric_date: row.metric_date ?? undefined,
    health_score: row.health_score != null ? Number(row.health_score) : null,
    todays_revenue: revenue,
    total_customers: customers,
    early_signal: 'normal',
    confidence: confidenceScore,
    data_days: null,
    required_days: null,
    avg_ticket: revenue != null && customers != null && customers > 0 ? revenue / customers : (row.avg_ticket != null ? Number(row.avg_ticket) : null),
  } as FnbOperatingStatusRow;
}

/** Accommodation view row (accommodation_latest_metrics). Uses revenue column. */
export interface AccommodationLatestMetricRow {
  branch_id: string;
  metric_date?: string;
  revenue?: number | null;
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
 * Single unified loader for Operating Status. One source per business type; no fallbacks.
 * F&B → fnb_latest_metrics. Accommodation → accommodation_latest_metrics.
 */
export async function loadOperatingStatus(
  branchId: string,
  businessType: 'fnb' | 'accommodation'
): Promise<OperatingStatusRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const table =
    businessType === 'fnb' ? 'fnb_latest_metrics' : 'accommodation_latest_metrics';

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService]', table, 'error:', error.message);
    }
    return null;
  }

  if (process.env.NODE_ENV === 'development' && data) {
    console.log('Operating Status data source:', table, data);
  }

  return data as OperatingStatusRow | null;
}

/**
 * Load Operating Status for a branch. Uses loadOperatingStatus for fnb/accommodation;
 * if moduleType unknown, tries fnb then accommodation.
 */
export async function getOperatingStatusData(
  branchId: string,
  moduleType: BranchModuleType | null | undefined
): Promise<OperatingStatusRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  if (moduleType === 'fnb') return loadOperatingStatus(branchId, 'fnb');
  if (moduleType === 'accommodation') return loadOperatingStatus(branchId, 'accommodation');

  const fnb = await loadOperatingStatus(branchId, 'fnb');
  if (fnb) return fnb;
  return loadOperatingStatus(branchId, 'accommodation');
}

/**
 * Row from today_summary view (date-based joins for reliable deltas).
 * Use for Today page Latest Performance: revenue_delta_day, occupancy_delta_week.
 */
export interface TodaySummaryRow {
  branch_id: string;
  metric_date: string | null;
  revenue: number | null;
  revenue_yesterday: number | null;
  revenue_delta_day: number | null;
  occupancy_rate: number | null;
  occupancy_delta_week: number | null;
  rooms_sold: number | null;
  rooms_available: number | null;
  adr: number | null;
  revpar: number | null;
  customers: number | null;
  avg_ticket: number | null;
  health_score: number | null;
}

/**
 * Fetch latest row from today_summary view for a branch.
 * Deltas are computed in DB via date-based joins (not lag), so they are correct when
 * at least 2 days (revenue_delta_day) or 8 days (occupancy_delta_week) exist.
 * Returns null if view missing or error (caller can fall back to client-side deltas).
 */
export async function getTodaySummary(branchId: string): Promise<TodaySummaryRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('today_summary')
    .select('branch_id, metric_date, revenue, revenue_yesterday, revenue_delta_day, occupancy_rate, occupancy_delta_week, rooms_sold, rooms_available, adr, revpar, customers, avg_ticket, health_score')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] today_summary error:', error.message);
    }
    return null;
  }

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    branch_id: branchId,
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
    revenue: row.revenue != null ? Number(row.revenue) : null,
    revenue_yesterday: row.revenue_yesterday != null ? Number(row.revenue_yesterday) : null,
    revenue_delta_day: row.revenue_delta_day != null ? Number(row.revenue_delta_day) : null,
    occupancy_rate: row.occupancy_rate != null ? Number(row.occupancy_rate) : null,
    occupancy_delta_week: row.occupancy_delta_week != null ? Number(row.occupancy_delta_week) : null,
    rooms_sold: row.rooms_sold != null ? Number(row.rooms_sold) : null,
    rooms_available: row.rooms_available != null ? Number(row.rooms_available) : null,
    adr: row.adr != null ? Number(row.adr) : null,
    revpar: row.revpar != null ? Number(row.revpar) : null,
    customers: row.customers != null ? Number(row.customers) : null,
    avg_ticket: row.avg_ticket != null ? Number(row.avg_ticket) : null,
    health_score: row.health_score != null ? Number(row.health_score) : null,
  };
}

/** @deprecated Use getOperatingStatusData + raw row for cards. Kept for compatibility. */
export async function getLatestMetricForDashboard(
  branchId: string,
  moduleType: BranchModuleType | null | undefined
): Promise<LatestMetricForDashboard | null> {
  const row = await getOperatingStatusData(branchId, moduleType);
  if (!row) return null;
  return {
    revenue: (row.revenue ?? row.total_revenue_thb) != null ? Number(row.revenue ?? row.total_revenue_thb) : null,
    customers: row.total_customers != null ? Number(row.total_customers) : null,
    roomsSold: row.rooms_sold != null ? Number(row.rooms_sold) : null,
    occupancyRate: row.occupancy_rate != null ? Number(row.occupancy_rate) : null,
    healthScore: row.health_score != null ? Number(row.health_score) : null,
    confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
    metricDate: row.metric_date ?? null,
  };
}
