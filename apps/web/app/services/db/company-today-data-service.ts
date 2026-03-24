/**
 * Company Today — branch_business_status + alerts_* (no today_summary_clean_safe).
 * When views/RPC are missing in PostgREST, we remember per-session and fall back to branches + daily_metrics.
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';
import { normalizeProfitabilityTrend, type ProfitabilityTrend } from './latest-metrics-service';

const companyTodayBundleInFlight = new Map<string, Promise<CompanyTodayBundle>>();

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

export interface CompanyTodayDailySummary {
  underperformingBelow80: number;
  revenueAtRiskFromAlertsTodayThb: number;
}

export interface CompanyTodayBundle {
  businessStatus: NormalizedBusinessRow[];
  criticalAlerts: NormalizedCriticalAlertRow[];
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
    alertsTodayRaw: [],
    dailySummary: { underperformingBelow80: 0, revenueAtRiskFromAlertsTodayThb: 0 },
    errors: errorTags,
  };
}

function makeBundleRequestKey(organizationId: string | null, branchIds: string[]): string {
  return `${organizationId ?? 'none'}::${[...branchIds].sort().join(',')}`;
}

function logSupabaseStructured(
  scope: string,
  branchIds: string[],
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): void {
  if (process.env.NODE_ENV !== 'development' || !error) return;
  if (isPostgrestObjectMissingError(error)) return;
  console.warn('[CompanyToday][SupabaseError]', {
    scope,
    branch_ids: branchIds,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

/** Latest daily_metrics row per branch → shape compatible with normalizeBusinessRow. */
async function fetchBusinessStatusFallbackRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  organizationId: string | null,
  branchIds: string[]
): Promise<Record<string, unknown>[]> {
  if (branchIds.length === 0) return [];
  const { data: branchRows, error: bErr } = await supabase
    .from('branches')
    .select('id, name, branch_name, module_type, organization_id')
    .in('id', branchIds);
  if (bErr || !Array.isArray(branchRows)) return [];

  const metaById = new Map<string, { name: string; module: string; org: string | null }>();
  for (const b of branchRows as Record<string, unknown>[]) {
    const id = pickStr(b, 'id');
    if (!id || !branchIds.includes(id)) continue;
    if (organizationId) {
      const oid = pickStr(b, 'organization_id', 'organizationId');
      if (oid && oid !== organizationId.trim()) continue;
    }
    const name =
      pickStr(b, 'branch_name', 'branchName', 'name') || id;
    metaById.set(id, {
      name,
      module: pickStr(b, 'module_type', 'moduleType', 'business_type'),
      org: pickStr(b, 'organization_id', 'organizationId') || null,
    });
  }

  const { data: dmRows, error: dErr } = await supabase
    .from('daily_metrics')
    .select('*')
    .in('branch_id', branchIds);
  if (dErr || !Array.isArray(dmRows)) return [];

  const latestByBranch = new Map<string, Record<string, unknown>>();
  for (const row of dmRows as Record<string, unknown>[]) {
    const bid = pickStr(row, 'branch_id', 'branchId');
    if (!bid) continue;
    const d = pickStr(row, 'metric_date', 'date') || '';
    const prev = latestByBranch.get(bid);
    const prevD = prev ? pickStr(prev, 'metric_date', 'date') || '' : '';
    if (!prev || d > prevD) latestByBranch.set(bid, row);
  }

  const out: Record<string, unknown>[] = [];
  for (const bid of branchIds) {
    const meta = metaById.get(bid);
    const dm = latestByBranch.get(bid);
    if (!meta || !dm) continue;
    const bt = normalizeBranchType(meta.module);
    if (!bt) continue;
    const revenue = pickNum(dm, 'revenue', 'total_revenue_thb');
    const roomsSold = Math.round(pickNum(dm, 'rooms_sold', 'roomsSold'));
    const roomsAvail = Math.round(pickNum(dm, 'rooms_available', 'roomsAvailable', 'rooms_available_count'));
    const occ =
      roomsAvail > 0 && roomsSold >= 0 ? Math.min(100, (roomsSold / roomsAvail) * 100) : 0;
    const customers = Math.round(pickNum(dm, 'total_customers', 'customers'));
    const avgTicket =
      customers > 0 && revenue > 0 ? revenue / customers : pickNum(dm, 'avg_ticket', 'average_ticket');

    out.push({
      branch_id: bid,
      branch_type: bt,
      branch_name: meta.name,
      metric_date: dm.metric_date ?? dm.date ?? null,
      revenue_thb: revenue,
      rooms_sold: roomsSold,
      rooms_total: roomsAvail,
      occupancy_pct: bt === 'accommodation' ? occ : 0,
      adr: pickNum(dm, 'adr', 'average_daily_rate'),
      customers: customers,
      avg_ticket: avgTicket,
      health_score: null,
      profitability_trend: null,
      margin_trend: null,
      avg_daily_cost: null,
    });
  }
  return out;
}

async function fetchCompanyTodayBundleCore(
  organizationId: string | null,
  branchIds: string[]
): Promise<CompanyTodayBundle> {
  const errors: string[] = [];
  const empty: CompanyTodayBundle = {
    businessStatus: [],
    criticalAlerts: [],
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
  const getAlertsCriticalArgs = { branch_ids: idFilter } as never;

  const skipBs = isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.branch_business_status);
  const skipCrit = isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.get_alerts_critical);
  const skipToday = isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.alerts_today);

  const [bsRes, critRes, todayRes] = await Promise.all([
    skipBs
      ? Promise.resolve({ data: null, error: null } as const)
      : supabase.from('branch_business_status').select('*').in('branch_id', idFilter),
    skipCrit
      ? Promise.resolve({ data: null, error: null } as const)
      : supabase.rpc('get_alerts_critical', getAlertsCriticalArgs),
    skipToday
      ? Promise.resolve({ data: null, error: null } as const)
      : supabase.from('alerts_today').select('*').in('branch_id', idFilter),
  ]);

  const logDev = (label: string, res: { data?: unknown; error?: { message?: string } | null }) => {
    if (process.env.NODE_ENV !== 'development') return;
    const rows = asRecordArray(res.data);
    if (res.error) {
      console.warn(`[CompanyToday] ${label} error:`, { branch_ids: idFilter, message: res.error.message ?? null });
    } else {
      console.log(`[CompanyToday] ${label} → ${rows.length} row(s)`, { branch_ids: idFilter, rows });
    }
  };

  if (!skipBs) logDev('branch_business_status', bsRes);
  if (!skipToday) logDev('alerts_today', todayRes);
  if (!skipCrit) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[CompanyToday] get_alerts_critical RPC payload:', { branch_ids: idFilter });
      console.log('[CompanyToday] get_alerts_critical RPC response:', {
        data: critRes.data,
        error: critRes.error
          ? {
              message: critRes.error.message,
              code: (critRes.error as { code?: string }).code,
              details: (critRes.error as { details?: string }).details,
              hint: (critRes.error as { hint?: string }).hint,
            }
          : null,
      });
    } else {
      logDev('get_alerts_critical(rpc)', critRes);
    }
  }

  if (bsRes.error) {
    if (isPostgrestObjectMissingError(bsRes.error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.branch_business_status);
    } else {
      errors.push(`branch_business_status:${bsRes.error.message}`);
      logSupabaseStructured('branch_business_status', idFilter, bsRes.error);
    }
  }
  if (critRes.error) {
    if (isPostgrestObjectMissingError(critRes.error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.get_alerts_critical);
    } else {
      errors.push(`get_alerts_critical:${critRes.error.message}`);
      logSupabaseStructured('get_alerts_critical', idFilter, critRes.error);
    }
  }
  if (todayRes.error) {
    if (isPostgrestObjectMissingError(todayRes.error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.alerts_today);
    } else {
      errors.push(`alerts_today:${todayRes.error.message}`);
      logSupabaseStructured('alerts_today', idFilter, todayRes.error);
    }
  }

  let bsRows = asRecordArray(bsRes.data);
  if (!skipBs && bsRows.length === 0 && organizationId) {
    const orgRes = await supabase.from('branch_business_status').select('*').eq('organization_id', organizationId);
    logDev('branch_business_status (org fallback)', orgRes);
    if (orgRes.error) {
      if (isPostgrestObjectMissingError(orgRes.error)) {
        markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.branch_business_status);
      } else {
        logSupabaseStructured('branch_business_status(org_fallback)', idFilter, orgRes.error);
      }
    } else {
      bsRows = asRecordArray(orgRes.data).filter((r) => idFilter.includes(pickStr(r, 'branch_id', 'branchId')));
    }
  }

  if (bsRows.length === 0) {
    const fb = await fetchBusinessStatusFallbackRows(supabase, organizationId, idFilter);
    if (fb.length > 0) bsRows = fb;
  }

  const businessStatus: NormalizedBusinessRow[] = [];
  for (const r of bsRows) {
    const bid = pickStr(r, 'branch_id', 'branchId');
    const normalized = normalizeBusinessRow(r, branchNameFromLocal(bid));
    if (normalized) businessStatus.push(normalized);
  }

  const alertsTodayRaw = skipToday || todayRes.error ? [] : asRecordArray(todayRes.data);
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

  const criticalAlertsRaw: NormalizedCriticalAlertRow[] = asRecordArray(
    skipCrit || critRes.error ? [] : critRes.data
  )
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

  return {
    businessStatus,
    criticalAlerts,
    alertsTodayRaw,
    dailySummary: {
      underperformingBelow80: underperformingBelow80.size,
      revenueAtRiskFromAlertsTodayThb: Math.round(revenueAtRiskFromAlertsTodayThb),
    },
    errors,
  };
}

/**
 * Fetch all Company Today datasets for accessible branches.
 */
export async function fetchCompanyTodayBundle(
  organizationId: string | null,
  branchIds: string[]
): Promise<CompanyTodayBundle> {
  const key = makeBundleRequestKey(organizationId, branchIds);
  const inFlight = companyTodayBundleInFlight.get(key);
  if (inFlight) return inFlight;
  const promise = fetchCompanyTodayBundleCore(organizationId, branchIds).finally(() => {
    companyTodayBundleInFlight.delete(key);
  });
  companyTodayBundleInFlight.set(key, promise);
  return promise;
}
