/**
 * Company Today — Latest business status (canonical current source).
 * GET /rest/v1/company_status_current
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

const SELECT_CURRENT =
  'organization_id,branch_id,branch_name,business_type,metric_date,health_score,revenue_thb,occupancy_pct,adr_thb,revpar_thb,profitability_symbol,customers,avg_ticket_thb,avg_cost_thb,margin_symbol';

export type CompanyBusinessTypeV3 = 'accommodation' | 'fnb';

export interface CompanyLatestBusinessStatusV3Row {
  organization_id: string;
  branch_id: string;
  branch_name: string;
  business_type: CompanyBusinessTypeV3;
  metric_date: string | null;
  health_score: number | null;
  revenue_thb: number | null;
  occupancy_pct: number | null;
  adr_thb: number | null;
  revpar_thb: number | null;
  profitability_symbol: string | null;
  customers: number | null;
  avg_ticket_thb: number | null;
  avg_cost_thb: number | null;
  margin_symbol: string | null;
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
  return {
    organization_id: orgId,
    branch_id: branchId,
    branch_name: pickStr(r, 'branch_name', 'branchName') || branchId,
    business_type,
    metric_date: md || null,
    health_score: pickNum(r, 'health_score', 'healthScore'),
    revenue_thb: pickNum(r, 'revenue_thb', 'revenueThb'),
    occupancy_pct: pickNum(r, 'occupancy_pct', 'occupancyPct'),
    adr_thb: pickNum(r, 'adr_thb', 'adrThb'),
    revpar_thb: pickNum(r, 'revpar_thb', 'revparThb'),
    profitability_symbol: pickStr(r, 'profitability_symbol', 'profitabilitySymbol') || null,
    customers: pickNum(r, 'customers'),
    avg_ticket_thb: pickNum(r, 'avg_ticket_thb', 'avgTicketThb'),
    avg_cost_thb: pickNum(r, 'avg_cost_thb', 'avgCostThb'),
    margin_symbol: pickStr(r, 'margin_symbol', 'marginSymbol') || null,
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
    .from('company_status_current')
    .select(SELECT_CURRENT)
    .eq('organization_id', oid)
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
      console.warn('[company_status_current]', error.message);
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
    .from('company_status_current')
    .select(SELECT_CURRENT)
    .eq('branch_id', bid)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[company_status_current by branch]', error.message);
    }
    return null;
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

