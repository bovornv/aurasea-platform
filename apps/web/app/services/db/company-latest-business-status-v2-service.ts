/**
 * Company Today — Latest business status (single source).
 * GET /rest/v1/company_latest_business_status_v2
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

const SELECT_V2 =
  'organization_id,branch_id,branch_name,business_type,metric_date,health_score,revenue_thb,occupancy_pct,adr_thb,revpar_thb,profitability_label,customers,avg_ticket_thb,avg_cost_thb,margin_pct';

export type CompanyBusinessTypeV2 = 'accommodation' | 'fnb';

export interface CompanyLatestBusinessStatusV2Row {
  organization_id: string;
  branch_id: string;
  branch_name: string;
  business_type: CompanyBusinessTypeV2;
  metric_date: string | null;
  health_score: number | null;
  revenue_thb: number | null;
  occupancy_pct: number | null;
  adr_thb: number | null;
  revpar_thb: number | null;
  profitability_label: string | null;
  customers: number | null;
  avg_ticket_thb: number | null;
  avg_cost_thb: number | null;
  margin_pct: number | null;
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

function mapRow(r: Record<string, unknown>): CompanyLatestBusinessStatusV2Row | null {
  const branchId = pickStr(r, 'branch_id', 'branchId');
  const orgId = pickStr(r, 'organization_id', 'organizationId');
  if (!branchId || !orgId) return null;
  const btRaw = pickStr(r, 'business_type', 'businessType').toLowerCase();
  const business_type: CompanyBusinessTypeV2 = btRaw === 'fnb' ? 'fnb' : 'accommodation';
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
    profitability_label: pickStr(r, 'profitability_label', 'profitabilityLabel') || null,
    customers: pickNum(r, 'customers'),
    avg_ticket_thb: pickNum(r, 'avg_ticket_thb', 'avgTicketThb'),
    avg_cost_thb: pickNum(r, 'avg_cost_thb', 'avgCostThb'),
    margin_pct: pickNum(r, 'margin_pct', 'marginPct'),
  };
}

/**
 * Rows for the signed-in org, optionally restricted to known branch IDs (e.g. current business group).
 */
export async function fetchCompanyLatestBusinessStatusV2(
  organizationId: string | null,
  branchIds: string[]
): Promise<CompanyLatestBusinessStatusV2Row[]> {
  const oid = organizationId?.trim();
  if (!oid || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.company_latest_business_status_v2)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from('company_latest_business_status_v2')
    .select(SELECT_V2)
    .eq('organization_id', oid)
    .order('branch_name', { ascending: true });

  const ids = [...new Set(branchIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length > 0) {
    query = query.in('branch_id', ids);
  }

  const { data, error } = await query;

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.company_latest_business_status_v2);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[company_latest_business_status_v2]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((x): x is CompanyLatestBusinessStatusV2Row => x != null);
}
