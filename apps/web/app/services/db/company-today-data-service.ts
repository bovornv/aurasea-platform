/**
 * Company Today — branch_business_status + alerts_* (no today_summary_clean_safe).
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { normalizeProfitabilityTrend, type ProfitabilityTrend } from './latest-metrics-service';

export interface NormalizedBusinessRow {
  branchId: string;
  branchName: string;
  branchType: 'accommodation' | 'fnb';
  healthScore: number | null;
  occupancyPct: number;
  revenueThb: number;
  adrThb: number;
  roomsSold: number;
  roomsTotal: number;
  revparThb: number;
  customers: number;
  avgTicketThb: number;
  /** Accommodation: ↑ / → / ↓ from branch_business_status.profitability_trend */
  profitabilityTrend: ProfitabilityTrend | null;
  /** F&B: ↑ / → / ↓ from margin_trend */
  marginTrend: ProfitabilityTrend | null;
  /** F&B: avg daily cost (฿) */
  avgDailyCostThb: number | null;
  /** From branch_business_status (YYYY-MM-DD or ISO). */
  metricDate: string | null;
  /** Calendar days since metric / last update; null if unknown. */
  daysSinceUpdate: number | null;
  /** Raw status from view (e.g. fresh | stale); reserved for styling hooks. */
  freshnessStatus: string | null;
}

export interface NormalizedCriticalAlertRow {
  branchId: string;
  branchName: string;
  /** Display line 2 — from alert_type (then title aliases). */
  alertType: string;
  cause: string;
  impactThb: number;
  /** Null/empty from DB → UI shows “Review performance”. */
  action: string | null;
  /** Stable list key */
  rowKey: string;
}

export interface NormalizedRevenueLeakRow {
  branchId: string;
  branchName: string;
  /** Title line: branch — alert_type */
  alertType: string;
  impactThb: number;
  cause: string;
  /** Null/empty from DB → UI shows “Review performance”. */
  recommendedAction: string | null;
  rank: number;
  rowKey: string;
}

export interface CompanyTodayDailySummary {
  underperformingBelow80: number;
  revenueAtRiskFromAlertsTodayThb: number;
}

export interface CompanyTodayBundle {
  businessStatus: NormalizedBusinessRow[];
  criticalAlerts: NormalizedCriticalAlertRow[];
  revenueLeaks: NormalizedRevenueLeakRow[];
  alertsTodayRaw: Record<string, unknown>[];
  dailySummary: CompanyTodayDailySummary;
  errors: string[];
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number {
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

/** Like pickNum but returns null when the field is absent / null (0 is valid). */
function pickNumOrNull(r: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    if (!(k in r)) continue;
    const v = r[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return null;
}

/** Local calendar days from metric_date to today (>= 0). */
function daysSinceMetricDate(metricDateStr: string): number | null {
  const trimmed = metricDateStr.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let metric: Date;
  if (ymd) {
    metric = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  } else {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    metric = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (isNaN(metric.getTime())) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t0.getTime() - metric.getTime()) / 86400000);
  return Math.max(0, diff);
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickTrendRaw(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (!(k in r)) continue;
    const v = r[k];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

function slugDedupePart(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Collapse accidental duplicates if the view returns more than one row per logical alert. */
function dedupeCriticalAlertsByBranchTypeCause(rows: NormalizedCriticalAlertRow[]): NormalizedCriticalAlertRow[] {
  const seen = new Set<string>();
  const out: NormalizedCriticalAlertRow[] = [];
  for (const row of rows) {
    const key = `${row.branchId}|${slugDedupePart(row.alertType)}|${slugDedupePart(row.cause)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function normalizeBranchType(raw: string): 'accommodation' | 'fnb' | null {
  const s = raw.toLowerCase();
  if (['accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'].includes(s)) return 'accommodation';
  if (['fnb', 'restaurant', 'cafe', 'cafe_restaurant'].includes(s)) return 'fnb';
  return null;
}

function asRecordArray(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
}

function normalizeBusinessRow(r: Record<string, unknown>, branchNameFallback: string): NormalizedBusinessRow | null {
  const branchId = pickStr(r, 'branch_id', 'branchId');
  if (!branchId) return null;
  const bt = normalizeBranchType(pickStr(r, 'branch_type', 'branchType', 'module_type', 'business_type'));
  if (!bt) return null;

  const occ =
    pickNum(r, 'occupancy_pct', 'occupancy_rate', 'occupancy', 'occupancy_pct_30d') ||
    (pickNum(r, 'occupancy_ratio') > 0 && pickNum(r, 'occupancy_ratio') <= 1
      ? pickNum(r, 'occupancy_ratio') * 100
      : 0);

  const revenueThb = pickNum(r, 'revenue_thb', 'revenue', 'total_revenue_thb', 'revenue_30d');
  const adrThb = pickNum(r, 'adr', 'average_daily_rate', 'avg_adr', 'adr_thb');
  let roomsSold = Math.round(pickNum(r, 'rooms_sold', 'roomsSold'));
  let roomsTotal = Math.round(
    pickNum(r, 'rooms_total', 'rooms_available', 'roomsTotal', 'total_rooms', 'inventory_rooms')
  );
  if (roomsTotal <= 0 && occ > 0 && roomsSold > 0) {
    roomsTotal = Math.max(roomsTotal, Math.round((roomsSold * 100) / occ));
  }
  const revparDirect = pickNum(r, 'revpar', 'rev_par', 'revpar_thb');
  /** Infer room inventory when the view omits it but daily RevPAR + revenue exist. */
  if (roomsTotal <= 0 && revenueThb > 0 && revparDirect > 0) {
    roomsTotal = Math.max(1, Math.round(revenueThb / revparDirect));
  }
  if (roomsSold <= 0 && roomsTotal > 0 && occ > 0) {
    roomsSold = Math.round((occ / 100) * roomsTotal);
  }
  if (roomsTotal <= 0 && revenueThb > 0 && adrThb > 0 && occ > 0) {
    const estSold = Math.max(0, Math.round(revenueThb / adrThb));
    if (estSold > 0) {
      roomsTotal = Math.max(1, Math.round(estSold / (occ / 100)));
      if (roomsSold <= 0) roomsSold = estSold;
    }
  }
  const revparThb =
    revparDirect > 0
      ? revparDirect
      : roomsTotal > 0 && revenueThb > 0
        ? revenueThb / (30 * roomsTotal)
        : adrThb > 0 && occ > 0
          ? (adrThb * occ) / 100
          : 0;

  const healthFromRow = pickNumOrNull(
    r,
    'health_score',
    'healthScore',
    'business_health_score',
    'kpi_health_score'
  );
  const healthScore =
    healthFromRow != null && !Number.isNaN(healthFromRow)
      ? Math.min(100, Math.max(0, healthFromRow))
      : null;

  const metricDateRaw = pickStr(r, 'metric_date', 'as_of_date', 'snapshot_date', 'data_date', 'metric_as_of');
  let daysSinceUpdate = pickNumOrNull(
    r,
    'days_since_update',
    'days_since_metric',
    'days_since_snapshot',
    'stale_days'
  );
  if (daysSinceUpdate == null && metricDateRaw) {
    daysSinceUpdate = daysSinceMetricDate(metricDateRaw);
  }

  const profitabilityTrend =
    bt === 'accommodation'
      ? normalizeProfitabilityTrend(
          pickTrendRaw(
            r,
            'profitability_trend',
            'profit_margin_trend',
            'profitabilityTrend',
            'accommodation_profitability_trend'
          )
        )
      : null;

  const marginTrend =
    bt === 'fnb'
      ? normalizeProfitabilityTrend(
          pickTrendRaw(r, 'margin_trend', 'marginTrend', 'profit_margin_trend', 'fnb_margin_trend')
        )
      : null;

  const avgDailyCostThb =
    bt === 'fnb'
      ? pickNumOrNull(
          r,
          'avg_daily_cost',
          'avgDailyCost',
          'average_daily_cost',
          'daily_cost',
          'avg_cost'
        )
      : null;

  return {
    branchId,
    branchName: pickStr(r, 'branch_name', 'branchName', 'name') || branchNameFallback,
    branchType: bt,
    healthScore,
    occupancyPct: occ,
    revenueThb,
    adrThb,
    roomsSold:
      roomsSold ||
      (roomsTotal > 0 && occ > 0 ? Math.round((occ / 100) * roomsTotal) : 0),
    roomsTotal,
    revparThb,
    customers: Math.round(pickNum(r, 'customers', 'total_customers', 'customers_7d', 'customer_count')),
    avgTicketThb: pickNum(r, 'avg_ticket', 'average_ticket', 'avg_ticket_thb'),
    profitabilityTrend,
    marginTrend,
    avgDailyCostThb,
    metricDate: metricDateRaw || null,
    daysSinceUpdate,
    freshnessStatus: pickStr(r, 'freshness_status', 'data_freshness', 'freshness') || null,
  };
}

function branchNameFromLocal(branchId: string): string {
  if (typeof window === 'undefined') return branchId;
  try {
    const { businessGroupService } = require('../business-group-service');
    const b = businessGroupService.getBranchById(branchId);
    return b?.branchName || branchId;
  } catch {
    return branchId;
  }
}

export function createEmptyCompanyTodayBundle(errorTags: string[]): CompanyTodayBundle {
  return {
    businessStatus: [],
    criticalAlerts: [],
    revenueLeaks: [],
    alertsTodayRaw: [],
    dailySummary: { underperformingBelow80: 0, revenueAtRiskFromAlertsTodayThb: 0 },
    errors: errorTags,
  };
}

/**
 * Fetch all Company Today datasets for accessible branches.
 */
export async function fetchCompanyTodayBundle(
  organizationId: string | null,
  branchIds: string[]
): Promise<CompanyTodayBundle> {
  const errors: string[] = [];
  const empty: CompanyTodayBundle = {
    businessStatus: [],
    criticalAlerts: [],
    revenueLeaks: [],
    alertsTodayRaw: [],
    dailySummary: { underperformingBelow80: 0, revenueAtRiskFromAlertsTodayThb: 0 },
    errors: [],
  };

  if (!isSupabaseAvailable() || branchIds.length === 0) {
    return { ...empty, errors: ['no_supabase_or_branches'] };
  }

  const supabase = getSupabaseClient();
  if (!supabase) return { ...empty, errors: ['no_client'] };

  const idFilter = branchIds;

  const [bsRes, critRes, leaksRes, todayRes] = await Promise.all([
    supabase.from('branch_business_status').select('*').in('branch_id', idFilter),
    supabase.from('alerts_critical').select('*').in('branch_id', idFilter),
    supabase.from('alerts_top3_revenue_leaks').select('*').in('branch_id', idFilter),
    supabase.from('alerts_today').select('*').in('branch_id', idFilter),
  ]);

  const logDev = (label: string, res: { data?: unknown; error?: { message?: string } | null }) => {
    if (process.env.NODE_ENV !== 'development') return;
    const rows = asRecordArray(res.data);
    if (res.error) {
      console.warn(`[CompanyToday] ${label} error:`, res.error.message);
    } else {
      console.log(`[CompanyToday] ${label} → ${rows.length} row(s)`, rows);
    }
  };

  logDev('branch_business_status', bsRes);
  logDev('alerts_today', todayRes);
  logDev('alerts_critical', critRes);
  logDev('alerts_top3_revenue_leaks', leaksRes);

  if (bsRes.error) errors.push(`branch_business_status:${bsRes.error.message}`);
  if (critRes.error) errors.push(`alerts_critical:${critRes.error.message}`);
  if (leaksRes.error) errors.push(`alerts_top3_revenue_leaks:${leaksRes.error.message}`);
  if (todayRes.error) errors.push(`alerts_today:${todayRes.error.message}`);

  let bsRows = asRecordArray(bsRes.data);
  if (bsRows.length === 0 && organizationId) {
    const orgRes = await supabase.from('branch_business_status').select('*').eq('organization_id', organizationId);
    logDev('branch_business_status (org fallback)', orgRes);
    if (!orgRes.error) {
      bsRows = asRecordArray(orgRes.data).filter((r) => idFilter.includes(pickStr(r, 'branch_id', 'branchId')));
    }
  }

  const businessStatus: NormalizedBusinessRow[] = [];
  for (const r of bsRows) {
    const bid = pickStr(r, 'branch_id', 'branchId');
    const normalized = normalizeBusinessRow(r, branchNameFromLocal(bid));
    if (normalized) businessStatus.push(normalized);
  }

  const alertsTodayRaw = asRecordArray(todayRes.data);
  let revenueAtRiskFromAlertsTodayThb = 0;
  for (const r of alertsTodayRaw) {
    revenueAtRiskFromAlertsTodayThb += pickNum(
      r,
      'impact_estimate_thb',
      'impact_estimate',
      'estimated_revenue_impact',
      'estimated_impact_thb'
    );
  }

  const underperformingBelow80 = new Set<string>();
  for (const row of businessStatus) {
    const h = row.healthScore;
    if (h != null && !isNaN(h) && h < 80) underperformingBelow80.add(row.branchId);
  }

  const criticalAlertsRaw: NormalizedCriticalAlertRow[] = asRecordArray(critRes.data)
    .map((r) => {
      const branchId = pickStr(r, 'branch_id', 'branchId');
      const alertType = pickStr(
        r,
        'alert_type',
        'type',
        'alert_title',
        'alert_name',
        'title',
        'name'
      );
      const cause = pickStr(r, 'cause', 'alert_message', 'message', 'description', 'detail');
      const impactThb = pickNum(
        r,
        'impact_estimate_thb',
        'impact_estimate',
        'estimated_revenue_impact',
        'money_impact_thb'
      );
      const actionStr = pickStr(
        r,
        'action',
        'next_action',
        'recommended_action',
        'recommendation',
        'suggested_action',
        'expected_recovery',
        'remediation'
      );
      const rowKey =
        pickStr(r, 'id', 'alert_id', 'uuid', 'row_id') ||
        `${branchId}:${slugDedupePart(alertType)}:${slugDedupePart(cause)}`;
      return {
        branchId,
        branchName: pickStr(r, 'branch_name', 'branchName') || branchNameFromLocal(branchId),
        alertType: alertType || pickStr(r, 'alert_title', 'alert_name', 'title') || '—',
        cause,
        impactThb,
        action: actionStr || null,
        rowKey,
      };
    })
    .filter((x) => x.branchId)
    .sort((a, b) => b.impactThb - a.impactThb);

  const criticalAlerts = dedupeCriticalAlertsByBranchTypeCause(criticalAlertsRaw);

  const revenueLeaks: NormalizedRevenueLeakRow[] = asRecordArray(leaksRes.data)
    .map((r, i) => {
      const branchId = pickStr(r, 'branch_id', 'branchId');
      const alertType = pickStr(
        r,
        'alert_type',
        'alert_title',
        'alert_name',
        'issue',
        'title',
        'name'
      );
      const rec = pickStr(r, 'recommended_action', 'recommendation', 'action', 'suggested_action');
      const rowKey =
        pickStr(r, 'id', 'alert_id', 'uuid', 'row_id') ||
        `${branchId}:${slugDedupePart(alertType)}:${i}`;
      return {
        branchId,
        branchName: pickStr(r, 'branch_name', 'branchName') || branchNameFromLocal(branchId),
        alertType,
        impactThb: pickNum(
          r,
          'impact_estimate_thb',
          'impact_estimate',
          'estimated_revenue_impact',
          'money_leak_thb'
        ),
        cause: pickStr(r, 'cause', 'reason', 'alert_message', 'message', 'description'),
        recommendedAction: rec || null,
        rank: pickNum(r, 'rank', 'leak_rank') || i + 1,
        rowKey,
      };
    })
    .filter((x) => x.branchId)
    .sort((a, b) => b.impactThb - a.impactThb || a.rank - b.rank);

  return {
    businessStatus,
    criticalAlerts,
    revenueLeaks,
    alertsTodayRaw,
    dailySummary: {
      underperformingBelow80: underperformingBelow80.size,
      revenueAtRiskFromAlertsTodayThb: Math.round(revenueAtRiskFromAlertsTodayThb),
    },
    errors,
  };
}
