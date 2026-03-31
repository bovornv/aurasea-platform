/**
 * Company confidence (learning maturity) — sourced from `public.company_learning_status`.
 *
 * Kept API shape for UI compatibility (`CompanyDataConfidence` expects data_days/max_days/confidence_level).
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface CompanyDataConfidenceRow {
  organization_id: string;
  data_days: number;
  max_days: number;
  confidence_level: string;
}

function confidenceLevelFromLearningDays(days: number): 'Low' | 'Medium' | 'High' {
  if (days >= 20) return 'High';
  if (days >= 7) return 'Medium';
  return 'Low';
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
    .from('company_learning_status')
    .select('*')
    .eq('organization_id', organizationId.trim())
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[company_learning_status]', error.message);
    }
    return null;
  }

  if (data == null || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const org = pickStr(r, 'organization_id', 'organizationId');
  if (!org) return null;

  const learningDays = pickNum(r, 'learning_days', 'learningDays') ?? 0;
  const maxDays = pickNum(r, 'max_learning_days', 'maxLearningDays') ?? 30;
  const level = confidenceLevelFromLearningDays(learningDays);

  return {
    organization_id: org,
    data_days: Math.max(0, Math.min(30, learningDays)),
    max_days: maxDays,
    confidence_level: level,
  };
}
