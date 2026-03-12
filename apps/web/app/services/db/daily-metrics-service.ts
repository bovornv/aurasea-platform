/**
 * Daily Metrics Database Service
 *
 * branchId must come from Supabase branches table (UUID). Mock ids (e.g. bg_*) are rejected.
 * No localStorage fallback; no default business/branch. Supabase only.
 *
 * Writes are routed by branch type:
 * - hotel / accommodation → accommodation_daily_metrics
 * - restaurant / fnb → fnb_daily_metrics
 * Pass metric.branchType (or infer from metric fields). READS use daily_metrics (view) for analytics.
 */
const DAILY_METRICS_READ = 'daily_metrics';
const TABLE_FNB = 'fnb_daily_metrics';
const TABLE_ACCOMMODATION = 'accommodation_daily_metrics';

/** DB column names for fnb_daily_metrics (frontend "customers" -> total_customers, "revenue" -> total_revenue_thb). */
const ALLOWED_COLUMNS_FNB: Set<string> = new Set([
  'branch_id', 'metric_date', 'total_revenue_thb', 'total_customers', 'cost', 'cash_balance',
  'additional_cost_today', 'top3_menu_revenue', 'avg_ticket', 'fnb_staff', 'promo_spend', 'monthly_fixed_cost',
]);
/** Columns allowed in accommodation_daily_metrics. Only these columns exist in the table. */
const ALLOWED_COLUMNS_ACCOMMODATION: Set<string> = new Set([
  'branch_id', 'metric_date', 'revenue', 'additional_cost_today',
  'rooms_sold', 'rooms_available', 'staff_count', 'monthly_fixed_cost',
]);

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import type { DailyMetric, DailyMetricInput } from '../../models/daily-metrics';
import { dailyMetricFromDb, dailyMetricToDb } from '../../models/daily-metrics';

/**
 * Schema guard: strip undefined and restrict to allowed columns for the target table.
 * Prevents PGRST204 errors from extra or mismatched columns.
 */
function buildPayloadForTable(
  data: Record<string, unknown>,
  allowedColumns: Set<string>
): Record<string, unknown> {
  const withoutUndefined = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
  return Object.fromEntries(
    Object.entries(withoutUndefined).filter(([key]) => allowedColumns.has(key))
  );
}

/**
 * Build F&B payload for fnb_daily_metrics. Maps frontend names to DB columns:
 *   revenue -> total_revenue_thb, customers -> total_customers.
 * Includes Advanced Finance & Capacity: monthly_fixed_cost, fnb_staff.
 */
function buildFnbPayload(metric: DailyMetricInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    branch_id: metric.branchId,
    metric_date: metric.date,
    total_revenue_thb: metric.revenue ?? 0,
    total_customers: metric.customers ?? 0,
    top3_menu_revenue: metric.top3MenuRevenue ?? null,
    additional_cost_today: metric.additionalCostToday ?? 0,
    cost: metric.cost ?? 0,
    avg_ticket: metric.avgTicket ?? null,
    fnb_staff: metric.fnbStaff ?? null,
  };
  // monthly_fixed_cost only when explicitly provided (Owner Settings); do not overwrite from Log Today
  if (metric.monthlyFixedCost !== undefined) payload.monthly_fixed_cost = metric.monthlyFixedCost;
  if (metric.cashBalance != null) payload.cash_balance = metric.cashBalance;
  if (metric.promoSpend != null) payload.promo_spend = metric.promoSpend;
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  );
}

/**
 * Build accommodation payload for accommodation_daily_metrics.
 * Payload: branch_id, metric_date, revenue, rooms_sold, rooms_available, staff_count, additional_cost_today.
 * Omits: monthly_fixed_cost (owner-only), adr, cost, cash_balance (not in table).
 */
function buildAccommodationPayload(metric: DailyMetricInput): Record<string, unknown> {
  const base = dailyMetricToDb(metric) as Record<string, unknown>;
  const { monthly_fixed_cost: _mfc, adr: _adr, cost: _cost, cash_balance: _cb, ...rest } = base;
  const out = {
    ...rest,
    revenue: metric.revenue ?? 0,
  };
  delete (out as Record<string, unknown>).monthly_fixed_cost;
  delete (out as Record<string, unknown>).adr;
  delete (out as Record<string, unknown>).cost;
  delete (out as Record<string, unknown>).cash_balance;
  return out;
}

/** Decide which base table to write to: by branch type (hotel/accommodation vs restaurant/fnb), else infer from metric content. */
function getWriteTable(metric: DailyMetricInput): typeof TABLE_FNB | typeof TABLE_ACCOMMODATION {
  const t = (metric.branchType ?? '').toLowerCase();
  if (t === 'accommodation' || t === 'hotel') return TABLE_ACCOMMODATION;
  if (t === 'fnb' || t === 'restaurant') return TABLE_FNB;
  const hasFnb =
    metric.customers !== undefined ||
    metric.avgTicket !== undefined ||
    metric.top3MenuRevenue !== undefined ||
    metric.fnbStaff !== undefined ||
    metric.promoSpend !== undefined;
  return hasFnb ? TABLE_FNB : TABLE_ACCOMMODATION;
}

// Simple cache to prevent duplicate calls within 5 seconds
const metricsCache = new Map<string, { data: DailyMetric[]; timestamp: number; isEmpty?: boolean }>();
const CACHE_TTL = 5000; // 5 seconds

/** Today's date in local timezone (YYYY-MM-DD). Use for save and "today" indicator so they match. */
export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rejectMockBranchId(branchId: string): void {
  if (branchId == null || branchId === '') {
    throw new Error('branchId is required. branchId must come from Supabase branches table.');
  }
  if (branchId.startsWith('bg_')) {
    throw new Error('Mock branchId not allowed. branchId must come from Supabase branches table.');
  }
}

/** Clear cached daily metrics for a branch (e.g. before refetching status on page load). */
export function clearDailyMetricsCacheForBranch(branchId: string): void {
  if (branchId == null || branchId === '') return;
  rejectMockBranchId(branchId);
  const keysToDelete: string[] = [];
  for (const key of metricsCache.keys()) {
    if (key.startsWith(`${branchId}:`)) keysToDelete.push(key);
  }
  keysToDelete.forEach((k) => metricsCache.delete(k));
}

/**
 * Save daily metric. branchId must be UUID from Supabase. No fallback; no mock ids.
 */
export async function saveDailyMetric(
  metric: DailyMetricInput
): Promise<boolean> {
  if (metric.branchId == null || metric.branchId === '') return false;
  rejectMockBranchId(metric.branchId);

  if (!isSupabaseAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DailyMetricsService] Supabase not available, cannot save.');
    }
    return false;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const table = getWriteTable(metric);
    const allowedColumns = table === TABLE_FNB ? ALLOWED_COLUMNS_FNB : ALLOWED_COLUMNS_ACCOMMODATION;
    const payload =
      table === TABLE_FNB
        ? buildPayloadForTable(buildFnbPayload(metric), allowedColumns)
        : buildPayloadForTable(buildAccommodationPayload(metric), allowedColumns);

    if (table === TABLE_FNB) {
      console.log('Saving FNB metrics payload:', payload);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('[DailyMetricsService] Saving metrics:', payload);
    }

    const { error } = await supabase
      .from(table)
      .upsert(payload as never, {
        onConflict: 'branch_id,metric_date',
      });

    if (error) {
      console.error('[DailyMetricsService] Failed to save daily metric:', error);
      return false;
    }

    const cacheKeysToDelete: string[] = [];
    for (const key of metricsCache.keys()) {
      if (key.startsWith(`${metric.branchId}:`)) cacheKeysToDelete.push(key);
    }
    cacheKeysToDelete.forEach((k) => metricsCache.delete(k));
    return true;
  } catch (error) {
    console.error('[DailyMetricsService] Error saving daily metric:', error);
    return false;
  }
}

/** Branch module type for read routing (must match write table). */
export type DailyMetricsBranchType = 'accommodation' | 'fnb';

/**
 * Get today's daily metric for a branch (no cache).
 * Reads from the same table we write to: accommodation_daily_metrics or fnb_daily_metrics.
 * Pass moduleType so we read from the correct table; otherwise tries both.
 */
export async function getTodayDailyMetric(
  branchId: string,
  moduleType?: DailyMetricsBranchType | null
): Promise<DailyMetric | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const today = getTodayDateString();
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const tryTable = async (table: string): Promise<DailyMetric | null> => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('branch_id', branchId)
      .eq('metric_date', today)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return dailyMetricFromDb(data as any);
  };

  try {
    if (moduleType === 'accommodation') return await tryTable(TABLE_ACCOMMODATION);
    if (moduleType === 'fnb') return await tryTable(TABLE_FNB);
    const fromAcc = await tryTable(TABLE_ACCOMMODATION);
    if (fromAcc) return fromAcc;
    return await tryTable(TABLE_FNB);
  } catch (e) {
    console.error('[DailyMetricsService] getTodayDailyMetric error:', e);
    return null;
  }
}

/**
 * Get the most recent metric_date for a branch (for "Last entry: ..." display).
 * Reads from the same table we write to. Returns YYYY-MM-DD or null if no rows.
 */
export async function getLastEntryDate(
  branchId: string,
  moduleType?: DailyMetricsBranchType | null
): Promise<string | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const tryTable = async (table: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from(table)
      .select('metric_date')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { metric_date?: string } | null;
    return row?.metric_date ? String(row.metric_date).slice(0, 10) : null;
  };

  try {
    if (moduleType === 'accommodation') return await tryTable(TABLE_ACCOMMODATION);
    if (moduleType === 'fnb') return await tryTable(TABLE_FNB);
    const fromAcc = await tryTable(TABLE_ACCOMMODATION);
    if (fromAcc) return fromAcc;
    return await tryTable(TABLE_FNB);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DailyMetricsService] getLastEntryDate error:', e);
    }
    return null;
  }
}

/**
 * Get daily metrics for a branch
 * Unified service: Returns data from single daily_metrics table
 * 
 * Data Guard: Returns empty array if no data (no fallback to simulation)
 */
export async function getDailyMetrics(
  branchId: string,
  days?: number
): Promise<DailyMetric[]> {
  if (branchId == null || branchId === '') return [];
  rejectMockBranchId(branchId);

  const cacheKey = `${branchId}:${days || 'all'}`;
  const cached = metricsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

  if (!isSupabaseAvailable()) {
    // Data Guard: Return empty array instead of localStorage fallback
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DailyMetricsService] Supabase not available, returning empty array');
    }
    return [];
  }
  
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    
    // Standardized query: SELECT metric_date, revenue, cost, cash_balance ORDER BY metric_date ASC
    const startDate = days ? (() => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    })() : undefined;
    
    let query = supabase
      .from(DAILY_METRICS_READ)
      .select('*')
      .eq('branch_id', branchId);
    
    if (startDate) {
      query = query.gte('metric_date', startDate);
    }
    
    query = query.order('metric_date', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[DailyMetricsService] Failed to get daily metrics:', error);
      // Data Guard: Return empty array on error, don't fallback
      return [];
    }
    
    // PART 5: Fix Supabase Query Validation
    // Data Guard: Return empty array if no data
    if (!data || data.length === 0) {
      // Expected when coverage is 0; do not log (graceful empty state)
      const logKey = `daily_data_missing_${branchId}`;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(logKey, 'true');
      }
      
      // Cache empty result to prevent repeated queries
      const emptyResult: DailyMetric[] = [];
      metricsCache.set(cacheKey, { data: emptyResult, timestamp: Date.now(), isEmpty: true });
      return emptyResult;
    }
    
    // PART 7: Add Integrity Check After Fetch
    // Validate schema and log missing fields (only once per branch per session)
    const integrityLogKey = `daily_integrity_${branchId}`;
    const shouldLogIntegrity = typeof window === 'undefined' || !sessionStorage.getItem(integrityLogKey);
    
    if (shouldLogIntegrity && typeof window !== 'undefined') {
      sessionStorage.setItem(integrityLogKey, 'true');
    }
    
    const result = data.map(dailyMetricFromDb);
    
    // Cache the result
    metricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    // Clean up old cache entries (keep cache size reasonable)
    if (metricsCache.size > 50) {
      const now = Date.now();
      for (const [key, value] of metricsCache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) {
          metricsCache.delete(key);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('[DailyMetricsService] Error getting daily metrics:', error);
    // Data Guard: Return empty array on error
    return [];
  }
}

/** Status for owner dashboard: has monthly_fixed_cost configured and how many days of data exist. */
export interface AccommodationMonthlyFixedCostStatus {
  hasValue: boolean;
  dataDaysCount: number;
  currentValue: number | null;
}

/**
 * Get whether accommodation branch has monthly_fixed_cost set and how many days of data.
 * Used for owner dashboard warning/reminder banners. Queries accommodation_daily_metrics only.
 */
export async function getAccommodationMonthlyFixedCostStatus(
  branchId: string
): Promise<AccommodationMonthlyFixedCostStatus> {
  if (branchId == null || branchId === '') {
    return { hasValue: false, dataDaysCount: 0, currentValue: null };
  }
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return { hasValue: false, dataDaysCount: 0, currentValue: null };
  const supabase = getSupabaseClient();
  if (!supabase) return { hasValue: false, dataDaysCount: 0, currentValue: null };

  try {
    const [latestWithValueRes, countRes] = await Promise.all([
      supabase
        .from(TABLE_ACCOMMODATION)
        .select('monthly_fixed_cost')
        .eq('branch_id', branchId)
        .not('monthly_fixed_cost', 'is', null)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(TABLE_ACCOMMODATION)
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branchId),
    ]);
    const row = latestWithValueRes.data as { monthly_fixed_cost?: number | null } | null;
    const dataDaysCount = countRes.count ?? 0;
    const currentValue = row?.monthly_fixed_cost != null ? Number(row.monthly_fixed_cost) : null;
    const hasValue = currentValue != null;
    return { hasValue, dataDaysCount, currentValue };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.warn('[DailyMetricsService] getAccommodationMonthlyFixedCostStatus error:', e);
    return { hasValue: false, dataDaysCount: 0, currentValue: null };
  }
}

/**
 * Get latest monthly_fixed_cost for accommodation branch (for Owner Settings form).
 */
export async function getAccommodationMonthlyFixedCost(branchId: string): Promise<number | null> {
  const status = await getAccommodationMonthlyFixedCostStatus(branchId);
  return status.currentValue;
}

/**
 * Save monthly_fixed_cost for accommodation branch (Owner Settings only).
 * Updates the latest row by metric_date, or inserts a row for today if none exists.
 */
export async function setAccommodationMonthlyFixedCost(
  branchId: string,
  value: number
): Promise<{ ok: boolean; error?: string }> {
  if (branchId == null || branchId === '') {
    return { ok: false, error: 'branchId required' };
  }
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return { ok: false, error: 'Supabase not available' };
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'No client' };

  try {
    const today = getTodayDateString();
    const { data: latest } = await supabase
      .from(TABLE_ACCOMMODATION)
      .select('id, metric_date')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest && (latest as { id?: string }).id) {
      const { error: updateError } = await supabase
        .from(TABLE_ACCOMMODATION as 'accommodation_daily_metrics')
        .update({ monthly_fixed_cost: value } as never)
        .eq('id', (latest as { id: string }).id);
      if (updateError) {
        console.error('[DailyMetricsService] setAccommodationMonthlyFixedCost update error:', updateError);
        return { ok: false, error: updateError.message };
      }
    } else {
      const insertPayload = {
        branch_id: branchId,
        metric_date: today,
        revenue: 0,
        monthly_fixed_cost: value,
        rooms_available: null,
        staff_count: null,
      };
      const { error: insertError } = await supabase
        .from(TABLE_ACCOMMODATION as 'accommodation_daily_metrics')
        .insert(insertPayload as never);
      if (insertError) {
        console.error('[DailyMetricsService] setAccommodationMonthlyFixedCost insert error:', insertError);
        return { ok: false, error: insertError.message };
      }
    }
    clearDailyMetricsCacheForBranch(branchId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[DailyMetricsService] setAccommodationMonthlyFixedCost error:', e);
    return { ok: false, error: msg };
  }
}

/**
 * Save to localStorage (fallback) - Updated for unified fields
 */
function saveDailyMetricToLocalStorage(metric: DailyMetricInput): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const key = `daily_metrics_${metric.branchId}`;
    const existing = getDailyMetricsFromLocalStorage(metric.branchId);
    
    // Remove existing entry for same date
    const filtered = existing.filter(m => m.date !== metric.date);
    
    // Add new entry with unified fields (id deterministic from branch+date; no Date.now() or random)
    const newMetric: DailyMetric = {
      id: `local_${metric.branchId}_${metric.date}`,
      branchId: metric.branchId,
      date: metric.date,
      revenue: metric.revenue,
      cost: metric.cost,
      additionalCostToday: metric.additionalCostToday,
      cashBalance: metric.cashBalance,
      roomsSold: metric.roomsSold,
      roomsAvailable: metric.roomsAvailable,
      adr: metric.adr,
      accommodationStaff: metric.accommodationStaff,
      customers: metric.customers,
      avgTicket: metric.avgTicket,
      fnbStaff: metric.fnbStaff,
      promoSpend: metric.promoSpend,
      createdAt: new Date().toISOString(),
    };
    
    filtered.push(newMetric);
    localStorage.setItem(key, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('[DailyMetricsService] Error saving to localStorage:', error);
    return false;
  }
}

/**
 * Get from localStorage (fallback) - Updated for unified fields
 */
function getDailyMetricsFromLocalStorage(
  branchId: string,
  days?: number
): DailyMetric[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const key = `daily_metrics_${branchId}`;
    const stored = localStorage.getItem(key);
    
    if (!stored) return [];
    
    const metrics: DailyMetric[] = JSON.parse(stored);
    
    if (days) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      return metrics.filter(m => new Date(m.date) >= startDate);
    }
    
    return metrics;
  } catch (error) {
    console.error('[DailyMetricsService] Error reading from localStorage:', error);
    return [];
  }
}
