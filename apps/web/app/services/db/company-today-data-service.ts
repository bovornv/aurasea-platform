/**
 * Company Today — reads rebuilt KPI views (post–today_summary_clean).
 * Views: branch_business_status, alerts_critical, alerts_top3_revenue_leaks, alerts_today
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

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
}

export interface NormalizedCriticalAlertRow {
  branchId: string;
  branchName: string;
  title: string;
  cause: string;
  impactThb: number;
  action: string;
}

export interface NormalizedRevenueLeakRow {
  branchId: string;
  branchName: string;
  issue: string;
  impactThb: number;
  reason: string;
  action: string;
  rank: number;
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

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
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
  const roomsSold = Math.round(pickNum(r, 'rooms_sold', 'roomsSold'));
  let roomsTotal = Math.round(pickNum(r, 'rooms_total', 'rooms_available', 'roomsTotal', 'total_rooms'));
  if (roomsTotal <= 0 && occ > 0 && roomsSold > 0) {
    roomsTotal = Math.max(roomsTotal, Math.round((roomsSold * 100) / occ));
  }
  const revparDirect = pickNum(r, 'revpar', 'rev_par', 'revpar_thb');
  const revparThb =
    revparDirect > 0
      ? revparDirect
      : roomsTotal > 0 && revenueThb > 0
        ? revenueThb / (30 * roomsTotal)
        : adrThb > 0 && occ > 0
          ? (adrThb * occ) / 100
          : 0;

  const healthRaw = pickNum(r, 'health_score', 'healthScore');
  const healthScore = healthRaw > 0 || r.health_score != null || r.healthScore != null ? healthRaw : null;

  return {
    branchId,
    branchName: pickStr(r, 'branch_name', 'branchName', 'name') || branchNameFallback,
    branchType: bt,
    healthScore: healthScore !== null && !isNaN(healthScore) ? Math.min(100, Math.max(0, healthScore)) : null,
    occupancyPct: occ,
    revenueThb,
    adrThb,
    roomsSold: roomsSold || (roomsTotal > 0 && occ > 0 ? Math.round((occ / 100) * roomsTotal) : 0),
    roomsTotal,
    revparThb,
    customers: Math.round(pickNum(r, 'customers', 'total_customers', 'customers_7d', 'customer_count')),
    avgTicketThb: pickNum(r, 'avg_ticket', 'average_ticket', 'avg_ticket_thb'),
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

  const criticalAlerts: NormalizedCriticalAlertRow[] = asRecordArray(critRes.data)
    .map((r) => {
      const branchId = pickStr(r, 'branch_id', 'branchId');
      const impactThb = pickNum(
        r,
        'impact_estimate_thb',
        'impact_estimate',
        'estimated_revenue_impact',
        'money_impact_thb'
      );
      return {
        branchId,
        branchName: pickStr(r, 'branch_name', 'branchName') || branchNameFromLocal(branchId),
        title: pickStr(r, 'alert_title', 'alert_name', 'title', 'alert_type'),
        cause: pickStr(r, 'cause', 'alert_message', 'message', 'description'),
        impactThb,
        action: pickStr(r, 'action', 'recommendation', 'suggested_action', 'expected_recovery'),
      };
    })
    .filter((x) => x.branchId)
    .sort((a, b) => b.impactThb - a.impactThb);

  const revenueLeaks: NormalizedRevenueLeakRow[] = asRecordArray(leaksRes.data)
    .map((r, i) => {
      const branchId = pickStr(r, 'branch_id', 'branchId');
      return {
        branchId,
        branchName: pickStr(r, 'branch_name', 'branchName') || branchNameFromLocal(branchId),
        issue: pickStr(r, 'issue', 'alert_name', 'alert_title', 'alert_type'),
        impactThb: pickNum(r, 'impact_estimate_thb', 'estimated_revenue_impact', 'money_leak_thb'),
        reason: pickStr(r, 'reason', 'cause', 'alert_message'),
        action: pickStr(r, 'recommended_action', 'recommendation', 'action'),
        rank: pickNum(r, 'rank', 'leak_rank') || i + 1,
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
