/**
 * Latest Metrics Service
 *
 * Operating Status: single unified source per business type.
 * F&B → fnb_latest_metrics. Accommodation → accommodation_latest_metrics.
 * No branch_latest_kpi, anomaly, or daily_metrics for revenue/customers/confidence/health.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';
import {
  logBranchBusinessStatusApiDev,
  getBranchBusinessStatusApiTable,
  type BranchBusinessStatusApiUiSurface,
} from './branch-business-status-api-columns';
import { logPostgrestPhase1Read } from '../../lib/supabase/postgrest-phase1-cutover';

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

/** Row from fnb_today_metrics_ui view — single source for F&B Today metrics. */
export interface FnbOperatingStatusRow {
  branch_id: string;
  metric_date?: string | null;
  health_score?: number | null;
  revenue?: number | null;
  customers?: number | null;
  early_signal?: string | null;
  confidence?: number | null;
  data_days?: number | null;
  required_days?: number | null;
  avg_ticket?: number | null;
  avg_cost?: number | null;
  [key: string]: unknown;
}

/**
 * Load F&B Today metrics from fnb_today_metrics_ui.
 * Query: branch_id=eq.{id}&order=metric_date.desc&limit=1
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
    .from('fnb_today_metrics_ui')
    .select('*')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] fnb_today_metrics_ui:', error.message);
    }
    return null;
  }
  if (data == null) return null;

  const row = data as Record<string, unknown>;
  return {
    branch_id: branchId,
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
    health_score: row.health_score != null ? Number(row.health_score) : null,
    revenue: row.revenue != null ? Number(row.revenue) : null,
    customers: row.customers != null ? Number(row.customers) : null,
    avg_ticket: row.avg_ticket != null ? Number(row.avg_ticket) : null,
    avg_cost: row.avg_cost != null ? Number(row.avg_cost) : null,
    early_signal: 'normal',
    confidence: null,
    data_days: null,
    required_days: null,
  } as FnbOperatingStatusRow;
}

/**
 * Compute F&B day-over-day revenue % change live from fnb_daily_metrics.
 * Returns null if <2 distinct dates exist, or if the prior day revenue is 0.
 * Formula: (today_revenue - yesterday_revenue) / yesterday_revenue * 100, 1 decimal.
 */
export async function getFnbRevenueDeltaPct(branchId: string): Promise<number | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('fnb_daily_metrics')
    .select('metric_date, revenue')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) return null;

  // Sum revenue by date (guards against multiple rows per day)
  const byDate = new Map<string, number>();
  for (const row of data as Array<Record<string, unknown>>) {
    const date = row.metric_date != null ? String(row.metric_date).slice(0, 10) : null;
    if (!date) continue;
    const rev = row.revenue != null ? Number(row.revenue) : 0;
    byDate.set(date, (byDate.get(date) ?? 0) + rev);
  }

  const dates = [...byDate.keys()].sort().reverse(); // newest first
  if (dates.length < 2) return null;

  const todayRev = byDate.get(dates[0]!) ?? 0;
  const yesterdayRev = byDate.get(dates[1]!) ?? 0;

  if (yesterdayRev === 0) return null;
  return Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 1000) / 10; // 1 decimal
}

/**
 * Compute accommodation day-over-day revenue % change live from accommodation_daily_metrics.
 * Identical pattern to getFnbRevenueDeltaPct — bypasses the stale branch_status_current column.
 * Returns null if <2 distinct dates exist, or if the prior day revenue is 0.
 * Formula: (today_revenue - yesterday_revenue) / yesterday_revenue * 100, 1 decimal.
 */
export async function getAccommodationRevenueDeltaPct(branchId: string): Promise<number | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('accommodation_daily_metrics')
    .select('metric_date, revenue')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) return null;

  // Sum revenue by date (guards against multiple rows per day)
  const byDate = new Map<string, number>();
  for (const row of data as Array<Record<string, unknown>>) {
    const date = row.metric_date != null ? String(row.metric_date).slice(0, 10) : null;
    if (!date) continue;
    const rev = row.revenue != null ? Number(row.revenue) : 0;
    byDate.set(date, (byDate.get(date) ?? 0) + rev);
  }

  const dates = [...byDate.keys()].sort().reverse(); // newest first
  if (dates.length < 2) return null;

  const todayRev = byDate.get(dates[0]!) ?? 0;
  const yesterdayRev = byDate.get(dates[1]!) ?? 0;

  if (yesterdayRev === 0) return null;
  return Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 1000) / 10; // 1 decimal
}

/** Row from `accommodation_today_metrics_ui` — accommodation Today top metrics row. */
export interface AccommodationTodayMetricsUiRow {
  branch_id: string;
  metric_date?: string | null;
  revenue?: number | null;
  revenue_delta?: number | null;
  occupancy?: number | null;
  rooms_sold?: number | null;
  rooms_available?: number | null;
  adr?: number | null;
  revpar?: number | null;
  health_score?: number | null;
}

const ACCOMMODATION_TODAY_UI_SELECT =
  'branch_id,metric_date,revenue,revenue_delta,occupancy,rooms_sold,rooms_available,adr,revpar,health_score';

const accommodationTodayUiInFlight = new Map<string, Promise<AccommodationTodayMetricsUiRow | null>>();

/**
 * Accommodation Today metrics: `accommodation_today_metrics_ui`
 * — filter branch_id, order metric_date desc, limit 1.
 */
export async function getAccommodationTodayMetricsUi(
  branchId: string
): Promise<AccommodationTodayMetricsUiRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const inflight = accommodationTodayUiInFlight.get(branchId);
  if (inflight) return inflight;

  const promise = (async (): Promise<AccommodationTodayMetricsUiRow | null> => {
    const { data, error } = await supabase
      .from('accommodation_today_metrics_ui')
      .select(ACCOMMODATION_TODAY_UI_SELECT)
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[LatestMetricsService] accommodation_today_metrics_ui:', error.message);
      }
      return null;
    }
    if (data == null) return null;

    const row = data as Record<string, unknown>;
    return {
      branch_id: branchId,
      metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
      revenue: row.revenue != null ? Number(row.revenue) : null,
      revenue_delta: row.revenue_delta != null ? Number(row.revenue_delta) : null,
      occupancy: row.occupancy != null ? Number(row.occupancy) : null,
      rooms_sold: row.rooms_sold != null ? Number(row.rooms_sold) : null,
      rooms_available: row.rooms_available != null ? Number(row.rooms_available) : null,
      adr: row.adr != null ? Number(row.adr) : null,
      revpar: row.revpar != null ? Number(row.revpar) : null,
      health_score: row.health_score != null ? Number(row.health_score) : null,
    };
  })().finally(() => {
    accommodationTodayUiInFlight.delete(branchId);
  });

  accommodationTodayUiInFlight.set(branchId, promise);
  return promise;
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
 * Latest snapshot from `public.branch_status_current` (Branch Today metric strip + shared KPIs).
 */
export interface TodaySummaryRow {
  branch_id: string;
  metric_date: string | null;
  organization_id?: string | null;
  branch_name?: string | null;
  business_type?: string | null;
  /** Display revenue: coalesce from row.revenue, revenue_thb. */
  total_revenue: number | null;
  /** Day-over-day percent vs previous available day (branch_status_current). */
  revenue_change_pct_day?: number | null;
  revenue_yesterday: number | null;
  revenue_delta_day: number | null;
  occupancy_rate: number | null;
  occupancy_delta_week: number | null;
  rooms_sold: number | null;
  rooms_available: number | null;
  adr: number | null;
  revpar: number | null;
  profitability: string | null;
  profitability_symbol: string | null;
  customers: number | null;
  avg_ticket: number | null;
  avg_cost: number | null;
  margin: string | null;
  margin_symbol: string | null;
  health_score: number | null;
  accommodation_revenue?: number | null;
  fnb_revenue?: number | null;
}

function pickNumFromRow(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    if (Number.isFinite(n) && !Number.isNaN(n)) return n;
  }
  return null;
}

function pickStrFromRow(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return null;
}

const todaySummaryInFlight = new Map<string, Promise<TodaySummaryRow | null>>();

/** Trend series for Trends page: one value per day (oldest first). dates[i] = YYYY-MM-DD for values[i]. */
export interface BranchTrendSeries {
  dates: string[];
  revenue: number[];
  occupancy: number[];
  revpar: number[];
  adr: number[];
  customers: number[];
  /** F&B: per-day avg ticket from today_summary when the driver view provides it. */
  avg_ticket?: number[];
}

/** Branch `module_type` values that use the accommodation Today metric strip. */
export function isAccommodationModuleType(mt: string | null | undefined): boolean {
  const s = (mt ?? '').toLowerCase();
  return ['accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'].includes(s);
}

/** Branch `module_type` values that use the F&B Today metric strip. */
export function isFnbModuleType(mt: string | null | undefined): boolean {
  const s = (mt ?? '').toLowerCase();
  return ['fnb', 'restaurant', 'cafe', 'cafe_restaurant'].includes(s);
}

function startDateStrForDays(days: number): string {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start.toISOString().split('T')[0]!;
}

/**
 * Branch Performance Drivers: public.branch_performance_drivers_* (branch_daily_metrics ∪ today_summary in SQL only).
 */
export async function getBranchTrendSeries(
  branchId: string,
  days: number = 30,
  ctx?: { moduleType?: string | null }
): Promise<BranchTrendSeries | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const startStr = startDateStrForDays(days);
  const mt = ctx?.moduleType;

  const tryAcc = async (): Promise<BranchTrendSeries | null> => {
    if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.branch_performance_drivers_accommodation)) {
      return null;
    }
    const { data, error } = await supabase
      .from('branch_performance_drivers_accommodation')
      .select('metric_date, revenue, occupancy_rate, revpar, adr')
      .eq('branch_id', branchId)
      .gte('metric_date', startStr)
      .order('metric_date', { ascending: true });
    if (error) {
      if (isPostgrestObjectMissingError(error)) {
        markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.branch_performance_drivers_accommodation);
      }
      return null;
    }
    if (!data || data.length < 2) return null;
    const rows = data as Array<{
      metric_date?: string;
      revenue?: number | null;
      occupancy_rate?: number | null;
      revpar?: number | null;
      adr?: number | null;
    }>;
    return {
      dates: rows.map((r) => (r.metric_date ? String(r.metric_date).slice(0, 10) : '')),
      revenue: rows.map((r) => Number(r.revenue ?? 0)),
      occupancy: rows.map((r) => Number(r.occupancy_rate ?? 0)),
      revpar: rows.map((r) => Number(r.revpar ?? 0)),
      adr: rows.map((r) => Number(r.adr ?? 0)),
      customers: rows.map(() => 0),
    };
  };

  const tryFnb = async (): Promise<BranchTrendSeries | null> => {
    if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.branch_performance_drivers_fnb)) return null;
    const { data, error } = await supabase
      .from('branch_performance_drivers_fnb')
      .select('metric_date, revenue, customers, avg_ticket')
      .eq('branch_id', branchId)
      .gte('metric_date', startStr)
      .order('metric_date', { ascending: true });
    if (error) {
      if (isPostgrestObjectMissingError(error)) {
        markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.branch_performance_drivers_fnb);
      }
      return null;
    }
    if (!data || data.length < 2) return null;
    const rows = data as Array<{
      metric_date?: string;
      revenue?: number | null;
      customers?: number | null;
      avg_ticket?: number | null;
    }>;
    return {
      dates: rows.map((r) => (r.metric_date ? String(r.metric_date).slice(0, 10) : '')),
      revenue: rows.map((r) => Number(r.revenue ?? 0)),
      occupancy: rows.map(() => 0),
      revpar: rows.map(() => 0),
      adr: rows.map(() => 0),
      customers: rows.map((r) => Number(r.customers ?? 0)),
      avg_ticket: rows.map((r) => {
        const v = r.avg_ticket;
        return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
      }),
    };
  };

  if (isAccommodationModuleType(mt)) return tryAcc();
  if (isFnbModuleType(mt)) return tryFnb();

  return (await tryAcc()) ?? (await tryFnb());
}

/**
 * Same as getBranchTrendSeries — pass branch.moduleType so the correct driver view is used first.
 */
export async function getBranchTrendSeriesWithFallback(
  branchId: string,
  days: number = 30,
  ctx?: { moduleType?: string | null }
): Promise<BranchTrendSeries | null> {
  return getBranchTrendSeries(branchId, days, ctx);
}

/**
 * Latest row from `public.branch_status_current` (one row per branch; optional order for safety).
 */
export async function getTodaySummary(
  branchId: string,
  opts?: { uiSurface?: BranchBusinessStatusApiUiSurface }
): Promise<TodaySummaryRow | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const inflight = todaySummaryInFlight.get(branchId);
  if (inflight) return inflight;

  const promise = (async (): Promise<TodaySummaryRow | null> => {
    if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.branch_business_status_api)) {
      return null;
    }

    // Wildcard avoids PGRST/400 when branch_status_current is missing optional columns
    // (organization_id, profitability_*, etc.) on some deployments.
    const select = '*';
    const table = getBranchBusinessStatusApiTable();
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    logBranchBusinessStatusApiDev('branch_today_summary', {
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
    const row = data as Record<string, unknown>;
    const bid = pickStrFromRow(row, 'branch_id') ?? branchId;
    // Per requirement: Revenue amount for Today strip comes from branch_status_current.revenue.
    // Keep loose fallbacks for deployments that still expose revenue_thb/total_revenue only.
    const totalRev = pickNumFromRow(row, 'revenue', 'revenue_thb', 'total_revenue');
    return {
      branch_id: bid,
      metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
      organization_id: pickStrFromRow(row, 'organization_id'),
      branch_name: pickStrFromRow(row, 'branch_name'),
      business_type: pickStrFromRow(row, 'business_type'),
      total_revenue: totalRev,
      revenue_change_pct_day: pickNumFromRow(row, 'revenue_change_pct_day'),
      revenue_yesterday: null,
      revenue_delta_day: pickNumFromRow(row, 'revenue_delta_day'),
      occupancy_rate: pickNumFromRow(row, 'occupancy_rate', 'occupancy_pct'),
      occupancy_delta_week: null,
      rooms_sold: pickNumFromRow(row, 'rooms_sold', 'utilized'),
      rooms_available: pickNumFromRow(row, 'rooms_available', 'capacity'),
      adr: pickNumFromRow(row, 'adr', 'adr_thb'),
      revpar: pickNumFromRow(row, 'revpar', 'revpar_thb'),
      profitability: pickStrFromRow(row, 'profitability'),
      profitability_symbol: pickStrFromRow(row, 'profitability_symbol'),
      customers: pickNumFromRow(row, 'customers', 'total_customers'),
      avg_ticket: pickNumFromRow(row, 'avg_ticket', 'avg_ticket_thb'),
      avg_cost: pickNumFromRow(row, 'avg_cost', 'avg_cost_thb'),
      margin: pickStrFromRow(row, 'margin'),
      margin_symbol: pickStrFromRow(row, 'margin_symbol'),
      health_score: pickNumFromRow(row, 'health_score'),
      accommodation_revenue: null,
      fnb_revenue: null,
    };
  })().finally(() => {
    todaySummaryInFlight.delete(branchId);
  });

  todaySummaryInFlight.set(branchId, promise);
  return promise;
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

/** ↑ / → / ↓ — parsed from profitability views. */
export type ProfitabilityTrend = 'up' | 'flat' | 'down';

export function normalizeProfitabilityTrend(raw: unknown): ProfitabilityTrend | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    if (raw > 0) return 'up';
    if (raw < 0) return 'down';
    return 'flat';
  }
  const s = String(raw).toLowerCase().trim();
  if (['up', 'rising', 'positive', 'improve', 'improving', 'higher', 'gain', '↑'].includes(s)) return 'up';
  if (['down', 'falling', 'negative', 'decline', 'declining', 'lower', 'loss', '↓'].includes(s)) return 'down';
  if (['flat', 'neutral', 'stable', 'unchanged', 'steady', 'sideways', '→', 'hold', 'same'].includes(s))
    return 'flat';
  return null;
}

function pickProfitStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickProfitNum(r: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return null;
}

/** Latest row from accommodation_profitability_signal. */
export interface AccommodationProfitabilitySignal {
  branch_id: string;
  metric_date: string | null;
  trend: ProfitabilityTrend | null;
  explanation: string;
}

export async function getAccommodationProfitabilitySignal(
  branchId: string
): Promise<AccommodationProfitabilitySignal | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('accommodation_profitability_signal')
    .select('*')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] accommodation_profitability_signal:', error.message);
    }
    return null;
  }
  if (data == null) return null;
  const row = data as Record<string, unknown>;
  const trendRaw =
    row.profitability_trend ??
    row.profit_trend ??
    row.trend ??
    row.signal_direction ??
    row.direction ??
    row.arrow;
  const trend = normalizeProfitabilityTrend(trendRaw);
  const explanation = pickProfitStr(
    row,
    'profitability_explanation',
    'explanation',
    'ai_explanation',
    'narrative',
    'signal_explanation'
  );
  const md = row.metric_date;
  return {
    branch_id: branchId,
    metric_date: md != null ? String(md).slice(0, 10) : null,
    trend,
    explanation,
  };
}

/** Latest row from fnb_profitability_signal. */
export interface FnbProfitabilitySignal {
  branch_id: string;
  metric_date: string | null;
  avg_daily_cost: number | null;
  margin_trend: ProfitabilityTrend | null;
  margin_explanation: string;
}

export async function getFnbProfitabilitySignal(branchId: string): Promise<FnbProfitabilitySignal | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('fnb_profitability_signal')
    .select('*')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] fnb_profitability_signal:', error.message);
    }
    return null;
  }
  if (data == null) return null;
  const row = data as Record<string, unknown>;
  const marginRaw =
    row.margin_trend ??
    row.margin_direction ??
    row.profitability_trend ??
    row.trend ??
    row.direction;
  const margin_trend = normalizeProfitabilityTrend(marginRaw);
  const margin_explanation = pickProfitStr(
    row,
    'margin_explanation',
    'explanation',
    'profitability_explanation',
    'ai_explanation',
    'narrative'
  );
  const avg_daily_cost = pickProfitNum(
    row,
    'avg_daily_cost',
    'average_daily_cost',
    'daily_cost',
    'avg_cost',
    'estimated_daily_cost'
  );
  const md = row.metric_date;
  return {
    branch_id: branchId,
    metric_date: md != null ? String(md).slice(0, 10) : null,
    avg_daily_cost,
    margin_trend,
    margin_explanation,
  };
}

/** Row from alerts_top view (legacy; prefer branch_alerts_today). */
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

function pickBranchAlertNum(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return 0;
}

function pickBranchAlertStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** Normalized row for branch Today “Alerts & Recommendations” (source: branch_alerts_today). */
export interface BranchTodayOverviewAlertRow {
  branch_id: string;
  /** Branch row module bucket from DB (hotel_with_cafe → accommodation). */
  branch_type: string | null;
  /** Which stream this alert belongs to — use for UI filtering on hybrid branches. */
  alert_stream: 'accommodation' | 'fnb' | null;
  metric_date: string | null;
  alert_type: string;
  alert_message: string;
  impact_estimate_thb: number;
  recommended_action: string;
  isOpportunity: boolean;
}

/** When alert_stream column is missing (pre-migration), infer from alert copy + branch_type. */
function resolveAlertStream(
  r: Record<string, unknown>,
  alertType: string,
  branch_type: string | null
): 'accommodation' | 'fnb' | null {
  const raw = pickBranchAlertStr(r, 'alert_stream', 'alertStream').toLowerCase();
  if (raw === 'accommodation' || raw === 'fnb') {
    // Pure F&B branches: legacy SQL often tagged revenue alerts as accommodation (COALESCE(total) vs fnb split).
    if (branch_type === 'fnb' && raw === 'accommodation') return 'fnb';
    return raw as 'accommodation' | 'fnb';
  }
  const t = alertType.toLowerCase();
  if (t.includes('f&b') || t.includes('underperformance')) return 'fnb';
  if (t.includes('room revenue') || t.includes('low room')) return 'accommodation';
  if (t.includes('occupancy')) return 'accommodation';
  if (branch_type === 'accommodation' || branch_type === 'fnb') return branch_type;
  return null;
}

export type BranchAlertsTodayStream = 'accommodation' | 'fnb';

/** One row per (alert_stream, alert_type): keeps highest-impact / latest row after sort. */
function dedupeBranchTodayAlertsByType(rows: BranchTodayOverviewAlertRow[]): BranchTodayOverviewAlertRow[] {
  const seen = new Set<string>();
  const out: BranchTodayOverviewAlertRow[] = [];
  for (const r of rows) {
    const k = `${r.alert_stream ?? 'none'}::${(r.alert_type || 'Alert').trim().toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function debugBranchAlertsTodayRestUrl(
  branchId: string,
  stream: BranchAlertsTodayStream | null,
  message: string
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return;
  let url = `${base}/rest/v1/branch_alerts_today?select=*&branch_id=eq.${encodeURIComponent(branchId)}`;
  if (stream === 'accommodation' || stream === 'fnb') {
    url += `&alert_stream=eq.${encodeURIComponent(stream)}`;
  }
  console.warn(`[LatestMetricsService] branch_alerts_today ${message}:`, url);
}

/**
 * Today’s alerts for one branch from branch_alerts_today (not alerts_top / alerts_critical).
 * When `stream` is accommodation | fnb: API filters branch_type + client filter (defense in depth).
 * Sorted by impact_estimate_thb DESC, then metric_date DESC.
 */
export async function getBranchAlertsTodayForBranchOverview(
  branchId: string,
  stream: BranchAlertsTodayStream | null = null
): Promise<BranchTodayOverviewAlertRow[]> {
  if (branchId == null || branchId === '') return [];
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let q = supabase.from('branch_alerts_today').select('*').eq('branch_id', branchId);
  // Accommodation: filter at API. F&B: do not — DB may still have alert_stream='accommodation' for fnb-only branches.
  if (stream === 'accommodation') {
    q = q.eq('alert_stream', 'accommodation');
  }
  const { data, error } = await q;

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[LatestMetricsService] branch_alerts_today error:', error.message, error);
      debugBranchAlertsTodayRestUrl(
        branchId,
        stream,
        'test in browser (add Authorization: Bearer <access_token>)'
      );
    }
    return [];
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  let rows: BranchTodayOverviewAlertRow[] = [];

  for (const r of raw) {
    const bid = pickBranchAlertStr(r, 'branch_id', 'branchId');
    if (!bid) continue;
    const branchTypeRaw = pickBranchAlertStr(r, 'branch_type', 'branchType');
    const branch_type = branchTypeRaw !== '' ? branchTypeRaw.toLowerCase() : null;
    const alertType = pickBranchAlertStr(r, 'alert_type', 'alert_name', 'type', 'title');
    const msg = pickBranchAlertStr(r, 'alert_message', 'message', 'description');
    const impact = pickBranchAlertNum(
      r,
      'impact_estimate_thb',
      'estimated_revenue_impact',
      'impact_estimate',
      'money_impact_thb'
    );
    let action = pickBranchAlertStr(
      r,
      'recommended_action',
      'recommendation',
      'action',
      'suggested_action'
    );
    const md = r.metric_date;
    const metricDate = md != null ? String(md).slice(0, 10) : null;

    const cat = String(r.alert_category ?? '').toLowerCase();
    const sevNum = typeof r.severity === 'number' ? r.severity : Number(r.severity);
    const sevStr = String(r.alert_severity ?? '').toLowerCase();
    const isOpp =
      cat === 'opportunity' ||
      (!Number.isNaN(sevNum) && sevNum <= 1) ||
      sevStr === 'low' ||
      sevStr === 'informational' ||
      /opportunity|high demand|demand is strong/i.test(alertType + msg);

    const at = alertType || 'Alert';
    const alert_stream = resolveAlertStream(r, at, branch_type);

    rows.push({
      branch_id: bid,
      branch_type,
      alert_stream,
      metric_date: metricDate,
      alert_type: at,
      alert_message: msg,
      impact_estimate_thb: impact,
      recommended_action: action,
      isOpportunity: isOpp,
    });
  }

  rows.sort((a, b) => {
    if (b.impact_estimate_thb !== a.impact_estimate_thb) {
      return b.impact_estimate_thb - a.impact_estimate_thb;
    }
    return (b.metric_date ?? '').localeCompare(a.metric_date ?? '');
  });

  if (stream === 'fnb') {
    rows = rows.filter((a) => a.alert_stream === 'fnb');
  } else if (stream === 'accommodation') {
    rows = rows.filter((a) => a.alert_stream === 'accommodation');
  }
  return dedupeBranchTodayAlertsByType(rows);
}

/**
 * @deprecated Use getBranchAlertsTodayForBranchOverview (branch_alerts_today).
 */
export async function getAlertsTop(branchId: string): Promise<AlertTopRow[]> {
  const rows = await getBranchAlertsTodayForBranchOverview(branchId);
  return rows.map((row, i) => ({
    branch_id: row.branch_id,
    metric_date: row.metric_date,
    alert_type: row.alert_type,
    severity: row.isOpportunity ? 1 : 2,
    alert_message: row.alert_message,
    cause: null,
    recommendation: row.recommended_action,
    expected_recovery: null,
    rank: i + 1,
  }));
}

/** Aggregated 7-day window across branches (from accommodation_daily_metrics ∪ fnb_daily_metrics). */
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
 * Portfolio-level trend summary (client-side aggregation).
 * @deprecated Company Today Business Trends uses `company_business_trends_today` via fetchCompanyBusinessTrendHighlights.
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

  const [{ data: accRows, error: accErr }, { data: fnbRows, error: fnbErr }] = await Promise.all([
    supabase
      .from('accommodation_daily_metrics')
      .select('metric_date, branch_id, revenue, rooms_sold, rooms_available')
      .in('branch_id', ids)
      .gte('metric_date', startStr)
      .order('metric_date', { ascending: true }),
    supabase
      .from('fnb_daily_metrics')
      .select('metric_date, branch_id, revenue, total_customers')
      .in('branch_id', ids)
      .gte('metric_date', startStr)
      .order('metric_date', { ascending: true }),
  ]);

  if (process.env.NODE_ENV === 'development' && (accErr || fnbErr)) {
    console.warn('[LatestMetricsService] portfolio trend daily metrics:', accErr?.message || fnbErr?.message);
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

  for (const raw of accRows ?? []) {
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
    const rev = Number(r.revenue ?? 0);
    cur.revenue += rev;
    cur.accom += rev;
    const avail = Number(r.rooms_available ?? 0);
    const sold = Number(r.rooms_sold ?? 0);
    if (avail > 0) {
      cur.occSum += (sold / avail) * 100;
      cur.occCount += 1;
    }
    byDate.set(d, cur);
  }

  for (const raw of fnbRows ?? []) {
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
    const rev = Number(r.revenue ?? 0);
    cur.revenue += rev;
    cur.fnb += rev;
    cur.customers += Number(r.total_customers ?? 0);
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
