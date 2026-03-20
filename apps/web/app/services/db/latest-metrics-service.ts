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
 * Row from today_summary_clean (core view for Today page).
 * total_revenue = main revenue; accommodation_revenue, fnb_revenue = split when available.
 */
export interface TodaySummaryRow {
  branch_id: string;
  metric_date: string | null;
  /** Total revenue (renamed from revenue). */
  total_revenue: number | null;
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
  accommodation_revenue?: number | null;
  fnb_revenue?: number | null;
}

const TODAY_SUMMARY_SELECT =
  'branch_id, metric_date, total_revenue, occupancy_rate, adr, revpar, health_score, revenue_delta_day, occupancy_delta_week, accommodation_revenue, fnb_revenue';

/** Trend series for Trends page: one value per day (oldest first). dates[i] = YYYY-MM-DD for values[i]. */
export interface BranchTrendSeries {
  dates: string[];
  revenue: number[];
  occupancy: number[];
  revpar: number[];
  adr: number[];
  customers: number[];
}

const TREND_SELECT_FULL =
  'metric_date, total_revenue, occupancy_rate, customers, capacity, utilized';
const TREND_SELECT_MIN =
  'metric_date, total_revenue, occupancy_rate, customers';

/**
 * Fetch last N days from today_summary_clean for Trends charts.
 * Tries full select first (with capacity, utilized for adr/revpar); on error tries minimal select.
 */
export async function getBranchTrendSeries(branchId: string, days: number = 30): Promise<BranchTrendSeries | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().split('T')[0]!;

  let data: unknown[] | null = null;
  let hasCapacityUtilized = false;

  const { data: fullData, error: fullError } = await supabase
    .from('today_summary_clean')
    .select(TREND_SELECT_FULL)
    .eq('branch_id', branchId)
    .gte('metric_date', startStr)
    .order('metric_date', { ascending: true });
  if (!fullError && fullData && fullData.length >= 2) {
    data = fullData;
    hasCapacityUtilized = true;
  } else {
    const { data: minData, error: minError } = await supabase
      .from('today_summary_clean')
      .select(TREND_SELECT_MIN)
      .eq('branch_id', branchId)
      .gte('metric_date', startStr)
      .order('metric_date', { ascending: true });
    if (!minError && minData && minData.length >= 2) data = minData;
  }

  if (!data || data.length < 2) return null;
  const rows = data as Array<{
    metric_date?: string | null;
    total_revenue?: number | null;
    occupancy_rate?: number | null;
    customers?: number | null;
    capacity?: number | null;
    utilized?: number | null;
  }>;
  return {
    dates: rows.map((r) => (r.metric_date ? String(r.metric_date).slice(0, 10) : '')),
    revenue: rows.map((r) => Number(r.total_revenue ?? 0)),
    occupancy: rows.map((r) => {
      const v = r.occupancy_rate;
      if (v == null) return 0;
      return Number(v) <= 1 ? Number(v) * 100 : Number(v);
    }),
    revpar: rows.map((r) => {
      if (!hasCapacityUtilized) return 0;
      const cap = Number(r.capacity ?? 0);
      const rev = Number(r.total_revenue ?? 0);
      return cap > 0 ? rev / cap : 0;
    }),
    adr: rows.map((r) => {
      if (!hasCapacityUtilized) return 0;
      const util = Number(r.utilized ?? 0);
      const rev = Number(r.total_revenue ?? 0);
      return util > 0 ? rev / util : 0;
    }),
    customers: rows.map((r) => Number(r.customers ?? 0)),
  };
}

/** Build trend series from accommodation_daily_metrics rows (when today_summary_clean is empty). */
async function getAccommodationTrendFallback(
  branchId: string,
  days: number,
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>
): Promise<BranchTrendSeries | null> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().split('T')[0]!;
  const { data, error } = await supabase
    .from('accommodation_daily_metrics')
    .select('metric_date, revenue, rooms_sold, rooms_available')
    .eq('branch_id', branchId)
    .gte('metric_date', startStr)
    .order('metric_date', { ascending: true });
  if (error || !data || data.length < 2) return null;
  const rows = data as Array<{ metric_date?: string; revenue?: number | null; rooms_sold?: number | null; rooms_available?: number | null }>;
  return {
    dates: rows.map((r) => (r.metric_date ? String(r.metric_date).slice(0, 10) : '')),
    revenue: rows.map((r) => Number(r.revenue ?? 0)),
    occupancy: rows.map((r) => {
      const avail = Number(r.rooms_available ?? 0);
      const sold = Number(r.rooms_sold ?? 0);
      return avail > 0 ? (sold / avail) * 100 : 0;
    }),
    revpar: rows.map((r) => {
      const avail = Number(r.rooms_available ?? 0);
      return avail > 0 ? Number(r.revenue ?? 0) / avail : 0;
    }),
    adr: rows.map((r) => {
      const sold = Number(r.rooms_sold ?? 0);
      return sold > 0 ? Number(r.revenue ?? 0) / sold : 0;
    }),
    customers: rows.map(() => 0),
  };
}

/** Build trend series from fnb_daily_metrics rows (when today_summary_clean is empty). */
async function getFnbTrendFallback(
  branchId: string,
  days: number,
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>
): Promise<BranchTrendSeries | null> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().split('T')[0]!;
  const { data, error } = await supabase
    .from('fnb_daily_metrics')
    .select('metric_date, revenue, total_customers')
    .eq('branch_id', branchId)
    .gte('metric_date', startStr)
    .order('metric_date', { ascending: true });
  if (error || !data || data.length < 2) return null;
  const rows = data as Array<{ metric_date?: string; revenue?: number | null; total_customers?: number | null }>;
  return {
    dates: rows.map((r) => (r.metric_date ? String(r.metric_date).slice(0, 10) : '')),
    revenue: rows.map((r) => Number(r.revenue ?? 0)),
    occupancy: rows.map(() => 0),
    revpar: rows.map(() => 0),
    adr: rows.map(() => 0),
    customers: rows.map((r) => Number(r.total_customers ?? 0)),
  };
}

/**
 * Fetch trend series for Trends page. Tries direct tables first (most reliable), then today_summary_clean.
 */
export async function getBranchTrendSeriesWithFallback(
  branchId: string,
  days: number = 30
): Promise<BranchTrendSeries | null> {
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const fromAcc = await getAccommodationTrendFallback(branchId, days, supabase);
  if (fromAcc != null) return fromAcc;
  const fromFnb = await getFnbTrendFallback(branchId, days, supabase);
  if (fromFnb != null) return fromFnb;
  return getBranchTrendSeries(branchId, days);
}

/**
 * Fetch latest row from today_summary_clean for a branch.
 * Core view: revenue, occupancy_rate, adr, revpar, health_score, revenue_delta_day, occupancy_delta_week.
 * Returns null if view missing or error (caller can fall back to client-side deltas).
 */
export async function getTodaySummary(branchId: string): Promise<TodaySummaryRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('today_summary_clean')
    .select(TODAY_SUMMARY_SELECT)
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] today_summary_clean error:', error.message);
    }
    return null;
  }

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    branch_id: branchId,
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
    total_revenue: row.total_revenue != null ? Number(row.total_revenue) : (row.revenue != null ? Number(row.revenue) : null),
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
    accommodation_revenue: row.accommodation_revenue != null ? Number(row.accommodation_revenue) : null,
    fnb_revenue: row.fnb_revenue != null ? Number(row.fnb_revenue) : null,
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

/** Row from alerts_top view (max 3 per branch: problems + opportunities). */
export interface AlertTopRow {
  branch_id: string;
  metric_date: string | null;
  alert_type: string | null;
  severity: number;
  alert_message: string | null;
  cause: string | null;
  recommendation: string | null;
  expected_recovery: string | null;
  rank: number;
}

/**
 * Fetch top alerts for a branch from alerts_top view (max 3, problems first).
 */
export async function getAlertsTop(branchId: string): Promise<AlertTopRow[]> {
  if (branchId == null || branchId === '') return [];
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('alerts_top')
    .select('branch_id, metric_date, alert_type, severity, alert_message, cause, recommendation, expected_recovery, rank')
    .eq('branch_id', branchId)
    .order('rank', { ascending: true });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] alerts_top error:', error.message);
    }
    return [];
  }
  return (data ?? []) as AlertTopRow[];
}

const TREND_PORTFOLIO_SELECT_FULL =
  'metric_date, branch_id, total_revenue, occupancy_rate, customers, accommodation_revenue, fnb_revenue';
const TREND_PORTFOLIO_SELECT_MIN = 'metric_date, branch_id, total_revenue, occupancy_rate, customers';

/** Aggregated 7-day window across branches (from today_summary_clean). */
export interface CompanyPortfolioTrendSnapshot {
  ready: boolean;
  /** Distinct dates in lookback window. */
  distinctDates: number;
  /** Number of days included in the “current” bucket (≤7). */
  currentWindowDays: number;
  totalRevenue7d: number;
  priorTotalRevenue7d: number | null;
  revenueChangePct: number | null;
  avgOccupancy7d: number | null;
  totalCustomers7d: number | null;
  latestMetricDate: string | null;
  accommodationRevenue7d: number;
  fnbRevenue7d: number;
}

/**
 * Portfolio-level trend summary for company Today page.
 * Aggregates per calendar day across branch_ids, then last 7 days vs prior 7 (when 14+ days exist).
 */
export async function getCompanyPortfolioTrendSnapshot(
  branchIds: string[],
  lookbackDays: number = 24
): Promise<CompanyPortfolioTrendSnapshot> {
  const empty: CompanyPortfolioTrendSnapshot = {
    ready: false,
    distinctDates: 0,
    currentWindowDays: 0,
    totalRevenue7d: 0,
    priorTotalRevenue7d: null,
    revenueChangePct: null,
    avgOccupancy7d: null,
    totalCustomers7d: null,
    latestMetricDate: null,
    accommodationRevenue7d: 0,
    fnbRevenue7d: 0,
  };

  const ids = branchIds.filter((id) => id && !String(id).startsWith('bg_'));
  if (!isSupabaseAvailable() || ids.length === 0) return empty;

  const supabase = getSupabaseClient();
  if (!supabase) return empty;

  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);
  const startStr = start.toISOString().split('T')[0]!;

  let rows: unknown[] | null = null;
  const { data: full, error: errFull } = await supabase
    .from('today_summary_clean')
    .select(TREND_PORTFOLIO_SELECT_FULL)
    .in('branch_id', ids)
    .gte('metric_date', startStr)
    .order('metric_date', { ascending: true });

  if (!errFull && full && full.length > 0) {
    rows = full;
  } else {
    const { data: min, error: errMin } = await supabase
      .from('today_summary_clean')
      .select(TREND_PORTFOLIO_SELECT_MIN)
      .in('branch_id', ids)
      .gte('metric_date', startStr)
      .order('metric_date', { ascending: true });
    if (!errMin && min && min.length > 0) rows = min;
    else {
      if (process.env.NODE_ENV === 'development' && (errFull || errMin)) {
        console.warn(
          '[LatestMetricsService] portfolio trend:',
          errFull?.message || errMin?.message
        );
      }
      return empty;
    }
  }

  type Agg = {
    revenue: number;
    occSum: number;
    occCount: number;
    customers: number;
    accom: number;
    fnb: number;
  };
  const byDate = new Map<string, Agg>();

  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    if (r.metric_date == null) continue;
    const d = String(r.metric_date).slice(0, 10);
    const cur: Agg = byDate.get(d) ?? {
      revenue: 0,
      occSum: 0,
      occCount: 0,
      customers: 0,
      accom: 0,
      fnb: 0,
    };
    cur.revenue += Number(r.total_revenue ?? 0);
    const orv = r.occupancy_rate;
    if (orv != null && !Number.isNaN(Number(orv))) {
      let occ = Number(orv);
      if (occ > 0 && occ <= 1) occ *= 100;
      cur.occSum += occ;
      cur.occCount += 1;
    }
    cur.customers += Number(r.customers ?? 0);
    cur.accom += Number(r.accommodation_revenue ?? 0);
    cur.fnb += Number(r.fnb_revenue ?? 0);
    byDate.set(d, cur);
  }

  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return empty;

  const latestMetricDate = dates[dates.length - 1] ?? null;
  const tailDates = dates.slice(-7);
  const priorDates = dates.length >= 14 ? dates.slice(-14, -7) : [];

  let totalRevenue7d = 0;
  let occNumerator = 0;
  let occDenominator = 0;
  let totalCustomers7d = 0;
  let accommodationRevenue7d = 0;
  let fnbRevenue7d = 0;

  for (const d of tailDates) {
    const a = byDate.get(d);
    if (!a) continue;
    totalRevenue7d += a.revenue;
    totalCustomers7d += a.customers;
    accommodationRevenue7d += a.accom;
    fnbRevenue7d += a.fnb;
    if (a.occCount > 0) {
      occNumerator += a.occSum / a.occCount;
      occDenominator += 1;
    }
  }

  let priorTotalRevenue7d: number | null = null;
  if (priorDates.length === 7) {
    priorTotalRevenue7d = priorDates.reduce((sum, d) => sum + (byDate.get(d)?.revenue ?? 0), 0);
  }

  let revenueChangePct: number | null = null;
  if (priorTotalRevenue7d != null && priorTotalRevenue7d > 0) {
    revenueChangePct = ((totalRevenue7d - priorTotalRevenue7d) / priorTotalRevenue7d) * 100;
  }

  const avgOccupancy7d = occDenominator > 0 ? occNumerator / occDenominator : null;

  const ready = tailDates.length >= 1 && totalRevenue7d > 0;

  return {
    ready,
    distinctDates: dates.length,
    currentWindowDays: tailDates.length,
    totalRevenue7d,
    priorTotalRevenue7d,
    revenueChangePct,
    avgOccupancy7d,
    totalCustomers7d: totalCustomers7d > 0 ? totalCustomers7d : null,
    latestMetricDate,
    accommodationRevenue7d,
    fnbRevenue7d,
  };
}
