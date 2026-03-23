/**
 * GET /rest/v1/company_data_confidence?select=*&organization_id=eq.{uuid}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface CompanyDataConfidenceRow {
  organization_id: string;
  data_days: number;
  max_days: number;
  confidence_level: string;
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
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) return Math.round(v);
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (!isNaN(n) && isFinite(n)) return Math.round(n);
    }
  }
  return null;
}

export async function fetchCompanyDataConfidence(
  organizationId: string | null
): Promise<CompanyDataConfidenceRow | null> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('company_data_confidence')
    .select('*')
    .eq('organization_id', organizationId.trim())
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[company_data_confidence]', error.message);
    }
    return null;
  }

  if (data == null || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const org = pickStr(r, 'organization_id', 'organizationId');
  if (!org) return null;

  const dataDays = pickNum(r, 'data_days', 'dataDays');
  const maxDays = pickNum(r, 'max_days', 'maxDays') ?? 30;
  const level = pickStr(r, 'confidence_level', 'confidenceLevel') || 'Low';

  return {
    organization_id: org,
    data_days: Math.max(0, Math.min(30, dataDays ?? 0)),
    max_days: maxDays,
    confidence_level: level,
  };
}
