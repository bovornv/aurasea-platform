/**
 * Company Today — company-level rollup for Latest business status.
 * Source: public.company_status_summary (latest row per org by metric_date).
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface CompanyStatusSummaryRow {
  organization_id: string;
  metric_date: string | null;
  revenue_agg: number | null;
  updated_branches_count: number | null;
  branches_count: number | null;
  rooms_sold_agg: number | null;
  rooms_available_agg: number | null;
  occupancy_rate_weighted: number | null;
  customers_agg: number | null;
  avg_ticket_weighted: number | null;
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
    const v = r[k];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function fetchCompanyStatusSummary(
  organizationId: string | null
): Promise<CompanyStatusSummaryRow | null> {
  const oid = organizationId?.trim();
  if (!oid || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('company_status_summary')
    .select('*')
    .eq('organization_id', oid)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const org = pickStr(r, 'organization_id', 'organizationId');
  if (!org) return null;

  return {
    organization_id: org,
    metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
    revenue_agg: pickNum(r, 'revenue_agg'),
    updated_branches_count: pickNum(r, 'updated_branches_count'),
    branches_count: pickNum(r, 'branches_count'),
    rooms_sold_agg: pickNum(r, 'rooms_sold_agg'),
    rooms_available_agg: pickNum(r, 'rooms_available_agg'),
    occupancy_rate_weighted: pickNum(r, 'occupancy_rate_weighted'),
    customers_agg: pickNum(r, 'customers_agg'),
    avg_ticket_weighted: pickNum(r, 'avg_ticket_weighted'),
  };
}

