/**
 * GET /rest/v1/company_trends_summary?select=*&organization_id=eq.{uuid}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface CompanyTrendsSummaryRow {
  organization_id: string;
  is_ready: boolean;
  revenue_pct_vs_prior_week: number | null;
  drivers_text: string | null;
  occupancy_pct: number | null;
  customers_total: number | null;
  mix_rooms_pct: number | null;
  mix_fnb_pct: number | null;
  trend_line: string | null;
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number | null {
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

function pickBool(r: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = r[k];
    if (v === true) return true;
    if (v === false) return false;
    if (typeof v === 'string') {
      const s = v.toLowerCase();
      if (s === 'true' || s === 't' || s === '1') return true;
    }
  }
  return false;
}

export async function fetchCompanyTrendsSummary(organizationId: string | null): Promise<CompanyTrendsSummaryRow | null> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('company_trends_summary')
    .select('*')
    .eq('organization_id', organizationId.trim())
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[company_trends_summary]', error.message);
    }
    return null;
  }

  if (data == null || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const org = pickStr(r, 'organization_id', 'organizationId');
  if (!org) return null;

  return {
    organization_id: org,
    is_ready: pickBool(r, 'is_ready', 'isReady'),
    revenue_pct_vs_prior_week: pickNum(r, 'revenue_pct_vs_prior_week', 'revenuePctVsPriorWeek'),
    drivers_text: pickStr(r, 'drivers_text', 'driversText'),
    occupancy_pct: pickNum(r, 'occupancy_pct', 'occupancyPct'),
    customers_total: pickNum(r, 'customers_total', 'customersTotal'),
    mix_rooms_pct: pickNum(r, 'mix_rooms_pct', 'mixRoomsPct'),
    mix_fnb_pct: pickNum(r, 'mix_fnb_pct', 'mixFnbPct'),
    trend_line: pickStr(r, 'trend_line', 'trendLine'),
  };
}
