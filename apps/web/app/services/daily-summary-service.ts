/**
 * Company Today — Daily Summary aggregation (data-driven).
 * Prefers Supabase alert views (branch_alerts_display, alerts_final), then metrics fallback, then in-memory alerts.
 */
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from './monitoring-service';
import { safeNumber } from '../utils/safe-number';

export type DailySummarySource =
  | 'branch_alerts_display'
  | 'alerts_final'
  | 'metrics_fallback'
  | 'client_alerts'
  | 'empty';

export interface GroupDailySummaryDbPartial {
  underperformingCount: number;
  revenueAtRiskThb: number;
  metricsFallbackRevenue: number;
  source: DailySummarySource;
  /** Rows used from branch_alerts_display or alerts_final */
  alertRowCount: number;
  /** True when severity columns classified at least one row (not all ignore). */
  hasUsableSeverity: boolean;
}

interface CacheEntry {
  expires: number;
  value: GroupDailySummaryDbPartial;
}

const CACHE_TTL_MS = 45_000;
let cache: { key: string; entry: CacheEntry } | null = null;

function cacheKey(branchIds: string[]): string {
  return [...branchIds].sort().join(',');
}

/** Classify DB / numeric severities → critical vs risk+early bucket. */
export function classifyAlertSeverity(raw: unknown): 'critical' | 'risk_early' | 'ignore' {
  if (raw === 3 || raw === '3') return 'critical';
  if (raw === 2 || raw === '2') return 'risk_early';
  if (raw === 1 || raw === '1') return 'risk_early';
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (['critical', 'high', 'severe'].includes(s)) return 'critical';
  if (['risk', 'early', 'warning', 'medium', 'low', 'moderate'].includes(s)) return 'risk_early';
  return 'ignore';
}

function impactFromRow(row: Record<string, unknown>): number {
  const v =
    row.impact_estimate_thb ??
    row.estimated_revenue_impact_thb ??
    row.estimated_revenue_impact ??
    row.revenue_impact_thb;
  return safeNumber(v, 0);
}

function severityFromRow(row: Record<string, unknown>): unknown {
  return (
    row.severity ??
    row.alert_severity ??
    row.alertSeverity ??
    row.severity_level ??
    row.severity_code
  );
}

/** Per-branch counts from alert rows; underperforming = ≥1 critical OR ≥2 risk_early. */
export function aggregateUnderperformingFromRows(
  rows: Array<Record<string, unknown>>
): { underperforming: Set<string> } {
  const stats = new Map<string, { critical: number; riskEarly: number }>();

  for (const row of rows) {
    const branchId = row.branch_id != null ? String(row.branch_id) : '';
    if (!branchId) continue;

    const tier = classifyAlertSeverity(severityFromRow(row));

    const cur = stats.get(branchId) ?? { critical: 0, riskEarly: 0 };
    if (tier === 'critical') cur.critical += 1;
    else if (tier === 'risk_early') cur.riskEarly += 1;
    stats.set(branchId, cur);
  }

  const underperforming = new Set<string>();
  for (const [bid, { critical, riskEarly }] of stats) {
    if (critical >= 1 || riskEarly >= 2) underperforming.add(bid);
  }
  return { underperforming };
}

/** Sum revenue at risk only for branches flagged underperforming (tighter owner read). */
export function revenueAtRiskForUnderperformingBranches(
  rows: Array<Record<string, unknown>>,
  underperforming: Set<string>
): number {
  let sum = 0;
  for (const row of rows) {
    const branchId = row.branch_id != null ? String(row.branch_id) : '';
    if (!branchId || !underperforming.has(branchId)) continue;
    const tier = classifyAlertSeverity(severityFromRow(row));
    if (tier === 'ignore') continue;
    sum += Math.max(0, impactFromRow(row));
  }
  return sum;
}

function rowsHaveUsableSeverity(rows: Array<Record<string, unknown>>): boolean {
  if (rows.length === 0) return false;
  return rows.some((r) => classifyAlertSeverity(severityFromRow(r)) !== 'ignore');
}

/** Latest vs prior-7-day average; if drop > 15% → risk = avg - latest. */
export function revenueRiskFromSeries(datesAndRevenue: Array<{ date: string; revenue: number }>): number {
  const sorted = [...datesAndRevenue].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length < 2) return 0;
  const latest = sorted[0]?.revenue ?? 0;
  const prev = sorted.slice(1, 8);
  if (prev.length === 0) return 0;
  const avg = prev.reduce((s, x) => s + x.revenue, 0) / prev.length;
  if (avg <= 0) return 0;
  if (latest < avg * 0.85) {
    return Math.max(0, Math.round(avg - latest));
  }
  return 0;
}

export interface MetricsFallbackResult {
  underperformingBranches: Set<string>;
  totalRiskThb: number;
}

/**
 * Parallel fetch: accommodation_daily_metrics + fnb_daily_metrics (one query each).
 * A branch is “at risk” from metrics if either stream shows >15% drop vs 7d avg.
 */
export async function fetchMetricsFallbackSummary(branchIds: string[]): Promise<MetricsFallbackResult> {
  const empty = (): MetricsFallbackResult => ({ underperformingBranches: new Set(), totalRiskThb: 0 });

  if (!isSupabaseAvailable() || branchIds.length === 0) return empty();
  const supabase = getSupabaseClient();
  if (!supabase) return empty();

  const start = new Date();
  start.setDate(start.getDate() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const [accRes, fnbRes] = await Promise.all([
    supabase
      .from('accommodation_daily_metrics')
      .select('branch_id, metric_date, revenue')
      .in('branch_id', branchIds)
      .gte('metric_date', startStr),
    supabase
      .from('fnb_daily_metrics')
      .select('branch_id, metric_date, revenue')
      .in('branch_id', branchIds)
      .gte('metric_date', startStr),
  ]);

  const byBranchAcc = new Map<string, Array<{ date: string; revenue: number }>>();
  const byBranchFnb = new Map<string, Array<{ date: string; revenue: number }>>();

  for (const row of (accRes.data ?? []) as Array<{ branch_id: string; metric_date: string; revenue: number | null }>) {
    const bid = row.branch_id;
    const arr = byBranchAcc.get(bid) ?? [];
    arr.push({ date: row.metric_date, revenue: safeNumber(row.revenue, 0) });
    byBranchAcc.set(bid, arr);
  }
  for (const row of (fnbRes.data ?? []) as Array<{ branch_id: string; metric_date: string; revenue: number | null }>) {
    const bid = row.branch_id;
    const arr = byBranchFnb.get(bid) ?? [];
    arr.push({ date: row.metric_date, revenue: safeNumber(row.revenue, 0) });
    byBranchFnb.set(bid, arr);
  }

  const underperformingBranches = new Set<string>();
  let totalRiskThb = 0;

  for (const [bid, arr] of byBranchAcc) {
    const r = revenueRiskFromSeries(arr);
    if (r > 0) {
      underperformingBranches.add(bid);
      totalRiskThb += r;
    }
  }
  for (const [bid, arr] of byBranchFnb) {
    const r = revenueRiskFromSeries(arr);
    if (r > 0) {
      underperformingBranches.add(bid);
      totalRiskThb += r;
    }
  }

  return { underperformingBranches, totalRiskThb: Math.round(totalRiskThb) };
}

/**
 * One round-trip alert query (branch_alerts_display), optional second (alerts_final) only if first empty.
 * Metrics fallback runs only when summed alert impact is 0.
 */
export async function fetchGroupDailySummaryDbPartial(branchIds: string[]): Promise<GroupDailySummaryDbPartial> {
  const empty = (source: DailySummarySource): GroupDailySummaryDbPartial => ({
    underperformingCount: 0,
    revenueAtRiskThb: 0,
    metricsFallbackRevenue: 0,
    source,
    alertRowCount: 0,
    hasUsableSeverity: false,
  });

  if (branchIds.length === 0) {
    return empty('empty');
  }

  const key = cacheKey(branchIds);
  const now = Date.now();
  if (cache && cache.key === key && cache.entry.expires > now) {
    return cache.entry.value;
  }

  if (!isSupabaseAvailable()) {
    const v = empty('empty');
    cache = { key, entry: { expires: now + CACHE_TTL_MS, value: v } };
    return v;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    const v = empty('empty');
    cache = { key, entry: { expires: now + CACHE_TTL_MS, value: v } };
    return v;
  }

  let rows: Array<Record<string, unknown>> = [];
  let source: DailySummarySource = 'empty';

  const displayRes = await supabase.from('branch_alerts_display').select('*').in('branch_id', branchIds);

  if (!displayRes.error && displayRes.data && displayRes.data.length > 0) {
    rows = displayRes.data as Array<Record<string, unknown>>;
    source = 'branch_alerts_display';
  } else {
    const finalRes = await supabase.from('alerts_final').select('*').in('branch_id', branchIds);
    if (!finalRes.error && finalRes.data && finalRes.data.length > 0) {
      rows = finalRes.data as Array<Record<string, unknown>>;
      source = 'alerts_final';
    }
  }

  if (rows.length === 0) {
    const m = await fetchMetricsFallbackSummary(branchIds);
    const v: GroupDailySummaryDbPartial = {
      underperformingCount: m.underperformingBranches.size,
      revenueAtRiskThb: m.totalRiskThb,
      metricsFallbackRevenue: m.totalRiskThb,
      source: m.totalRiskThb > 0 ? 'metrics_fallback' : 'empty',
      alertRowCount: 0,
      hasUsableSeverity: false,
    };
    cache = { key, entry: { expires: now + CACHE_TTL_MS, value: v } };
    return v;
  }

  const hasUsableSeverity = rowsHaveUsableSeverity(rows);
  let underperforming: Set<string>;
  let revenueSum: number;
  let effectiveSource: DailySummarySource = source;

  if (hasUsableSeverity) {
    const agg = aggregateUnderperformingFromRows(rows);
    underperforming = agg.underperforming;
    revenueSum = revenueAtRiskForUnderperformingBranches(rows, underperforming);
  } else {
    underperforming = new Set<string>();
    revenueSum = 0;
  }

  let metricsFallbackRevenue = 0;
  if (hasUsableSeverity && underperforming.size > 0 && revenueSum <= 0) {
    const m = await fetchMetricsFallbackSummary(branchIds);
    metricsFallbackRevenue = m.totalRiskThb;
    revenueSum = m.totalRiskThb;
    if (m.totalRiskThb > 0) effectiveSource = 'metrics_fallback';
  } else if (!hasUsableSeverity && rows.length > 0) {
    const m = await fetchMetricsFallbackSummary(branchIds);
    metricsFallbackRevenue = m.totalRiskThb;
    underperforming = m.underperformingBranches;
    revenueSum = m.totalRiskThb;
    if (m.totalRiskThb > 0) effectiveSource = 'metrics_fallback';
  }

  const v: GroupDailySummaryDbPartial = {
    underperformingCount: underperforming.size,
    revenueAtRiskThb: Math.round(revenueSum),
    metricsFallbackRevenue,
    source: effectiveSource,
    alertRowCount: rows.length,
    hasUsableSeverity,
  };

  cache = { key, entry: { expires: now + CACHE_TTL_MS, value: v } };
  return v;
}

export function invalidateDailySummaryCache(): void {
  cache = null;
}

/** Monthly SME OS impact → approximate daily THB for “today” copy. */
const MONTHLY_TO_DAILY = 1 / 30;

function isPhaseSynthetic(a: AlertContract): boolean {
  const id = String(a.id ?? '');
  return id.startsWith('phase-');
}

/**
 * Merge DB partial with in-memory alerts: KPI views win when severity is usable; else rules-engine alerts.
 */
export function mergeGroupDailySummary(
  db: GroupDailySummaryDbPartial | null,
  clientAlerts: AlertContract[]
): {
  underperformingCount: number;
  revenueAtRiskThb: number;
  hasAlertData: boolean;
  source: DailySummarySource;
} {
  const filtered = (clientAlerts ?? []).filter((a) => a?.branchId && !isPhaseSynthetic(a));

  const byBranch = new Map<string, { critical: number; warning: number }>();
  for (const a of filtered) {
    if (!a.branchId) continue;
    const cur = byBranch.get(a.branchId) ?? { critical: 0, warning: 0 };
    if (a.severity === 'critical') cur.critical += 1;
    else if (a.severity === 'warning') cur.warning += 1;
    byBranch.set(a.branchId, cur);
  }

  let clientUnder = 0;
  for (const { critical, warning } of byBranch.values()) {
    if (critical >= 1 || warning >= 2) clientUnder += 1;
  }

  let clientRevenue = 0;
  for (const a of filtered) {
    if (a.severity !== 'critical' && a.severity !== 'warning') continue;
    const ext = a as ExtendedAlertContract;
    const monthly = safeNumber(ext.revenueImpact, 0);
    if (monthly > 0) {
      clientRevenue += monthly * MONTHLY_TO_DAILY;
    }
  }
  clientRevenue = Math.round(clientRevenue);

  if (
    db &&
    db.alertRowCount > 0 &&
    db.hasUsableSeverity &&
    (db.source === 'branch_alerts_display' || db.source === 'alerts_final')
  ) {
    return {
      underperformingCount: db.underperformingCount,
      revenueAtRiskThb: db.revenueAtRiskThb,
      hasAlertData: true,
      source: db.source,
    };
  }

  if (filtered.length > 0) {
    const blendDb =
      db &&
      !db.hasUsableSeverity &&
      db.alertRowCount > 0 &&
      (db.source === 'branch_alerts_display' || db.source === 'alerts_final' || db.source === 'metrics_fallback');
    const u = blendDb ? Math.max(clientUnder, db.underperformingCount) : clientUnder;
    const r = blendDb ? Math.max(clientRevenue, db.revenueAtRiskThb) : clientRevenue;
    return {
      underperformingCount: u,
      revenueAtRiskThb: r,
      hasAlertData: true,
      source: 'client_alerts',
    };
  }

  if (db && db.source === 'metrics_fallback' && db.revenueAtRiskThb > 0) {
    return {
      underperformingCount: db.underperformingCount,
      revenueAtRiskThb: db.revenueAtRiskThb,
      hasAlertData: true,
      source: 'metrics_fallback',
    };
  }

  return {
    underperformingCount: 0,
    revenueAtRiskThb: 0,
    hasAlertData: false,
    source: 'empty',
  };
}

export function formatDailySummaryCompactThb(amount: number): string {
  const x = Math.round(Math.max(0, amount));
  if (x >= 1_000_000) return `฿${Math.round(x / 1_000_000)}M`;
  if (x >= 1000) return `฿${Math.round(x / 1000)}K`;
  return `฿${x}`;
}
