/**
 * Company Today — Latest business status (canonical current source).
 * GET /rest/v1/branch_status_current
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

// Keep this select list aligned to the *current* public.branch_status_current schema only.
// If a column is removed from the DB, it must be removed here to avoid PostgREST 400.
const SELECT_CURRENT =
  [
    'organization_id',
    'branch_id',
    'branch_name',
    'business_type',
    'metric_date',
    'revenue',
    'revenue_change_pct_day',
    'occupancy_rate',
    'rooms_sold',
    'rooms_available',
    'adr',
    'revpar',
    'profitability',
    'profitability_symbol',
    'customers',
    'avg_ticket',
    'avg_cost',
    'margin',
    'margin_symbol',
    'health_score',
  ].join(',');

export type CompanyBusinessTypeV3 = 'accommodation' | 'fnb';

export interface CompanyLatestBusinessStatusV3Row {
  organization_id: string;
  branch_id: string;
  branch_name: string;
  business_type: CompanyBusinessTypeV3;
  metric_date: string | null;
  health_score: number | null;
  revenue: number | null;
  /** Legacy/compat aliases (some call sites still reference these). */
  revenue_thb?: number | null;
  revenue_delta_day?: number | null;
  revenue_yesterday?: number | null;
  occupancy_pct?: number | null;
  rooms_sold?: number | null;
  rooms_available?: number | null;
  occupancy_rate: number | null;
  occupancy_delta_week?: number | null;
  utilized?: number | null;
  capacity?: number | null;
  adr: number | null;
  adr_thb?: number | null;
  revpar: number | null;
  revpar_thb?: number | null;
  profitability_symbol: string | null;
  profitability: string | null;
  customers: number | null;
  transactions?: number | null;
  avg_ticket: number | null;
  avg_ticket_thb?: number | null;
  avg_cost: number | null;
  avg_cost_thb?: number | null;
  margin_symbol: string | null;
  margin: string | null;
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number | null {
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

function mapRow(r: Record<string, unknown>): CompanyLatestBusinessStatusV3Row | null {
  const branchId = pickStr(r, 'branch_id', 'branchId');
  const orgId = pickStr(r, 'organization_id', 'organizationId');
  if (!branchId || !orgId) return null;
  const btRaw = pickStr(r, 'business_type', 'businessType').toLowerCase();
  const business_type: CompanyBusinessTypeV3 = btRaw === 'fnb' ? 'fnb' : 'accommodation';
  const md = r.metric_date != null ? String(r.metric_date).slice(0, 10) : null;
  const profSym = pickStr(r, 'profitability_symbol', 'profitabilitySymbol');
  const prof = pickStr(r, 'profitability');
  const marginSym = pickStr(r, 'margin_symbol', 'marginSymbol');
  const margin = pickStr(r, 'margin');
  return {
    organization_id: orgId,
    branch_id: branchId,
    branch_name: pickStr(r, 'branch_name', 'branchName') || branchId,
    business_type,
    metric_date: md || null,
    health_score: pickNum(r, 'health_score', 'healthScore'),
    revenue: pickNum(r, 'revenue'),
    occupancy_rate: pickNum(r, 'occupancy_rate'),
    adr: pickNum(r, 'adr'),
    revpar: pickNum(r, 'revpar'),
    rooms_sold: pickNum(r, 'rooms_sold'),
    rooms_available: pickNum(r, 'rooms_available'),
    profitability_symbol: profSym || prof || null,
    profitability: prof || profSym || null,
    customers: pickNum(r, 'customers'),
    avg_ticket: pickNum(r, 'avg_ticket'),
    avg_cost: pickNum(r, 'avg_cost'),
    margin_symbol: marginSym || margin || null,
    margin: margin || marginSym || null,
  };
}

export async function fetchCompanyLatestBusinessStatusV3(
  organizationId: string | null,
  branchIds: string[]
): Promise<CompanyLatestBusinessStatusV3Row[]> {
  const oid = organizationId?.trim();
  if (!oid || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.company_latest_business_status_v3)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from('branch_status_current')
    .select(SELECT_CURRENT)
    .eq('organization_id', oid)
    .order('health_score', { ascending: false, nullsFirst: false })
    .order('branch_name', { ascending: true });

  const ids = [...new Set(branchIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length > 0) {
    query = query.in('branch_id', ids);
  }

  const { data, error } = await query;
  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.company_latest_business_status_v3);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[branch_status_current]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((x): x is CompanyLatestBusinessStatusV3Row => x != null);
}

export async function fetchCompanyStatusCurrentByBranchId(
  branchId: string | null
): Promise<CompanyLatestBusinessStatusV3Row | null> {
  const bid = branchId?.trim();
  if (!bid || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('branch_status_current')
    .select(SELECT_CURRENT)
    .eq('branch_id', bid)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[branch_status_current by branch]', error.message);
    }
    return null;
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

