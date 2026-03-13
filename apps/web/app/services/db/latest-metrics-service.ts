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
 * Load F&B Operating Status from fnb_operating_status view only.
 * Use this for F&B branches instead of fnb_latest_metrics / branch_health_metrics / fnb_data_coverage / branch_anomaly_signals.
 */
export async function getFnbOperatingStatus(
  branchId: string
): Promise<FnbOperatingStatusRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('fnb_operating_status')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] fnb_operating_status error:', error.message);
    }
    return null;
  }

  if (process.env.NODE_ENV === 'development' && data) {
    console.log('F&B Operating Status data source: fnb_operating_status', data);
  }

  return data as FnbOperatingStatusRow | null;
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
