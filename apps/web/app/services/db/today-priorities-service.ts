/**
 * GET /rest/v1/today_priorities?select=*&order=sort_score.desc&limit=5
 * Optional: organization_id=eq.{uuid}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface TodayPrioritiesRow {
  branch_id: string;
  organization_id: string | null;
  branch_name: string | null;
  alert_type: string | null;
  action_text: string | null;
  action_short: string | null;
  impact: number | null;
  sort_score: number | null;
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
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return null;
}

export async function fetchTodayPriorities(
  organizationId: string | null,
  limit: number = 5
): Promise<TodayPrioritiesRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(10, Math.max(1, limit));
  const { data, error } = await supabase
    .from('today_priorities')
    .select('*')
    .eq('organization_id', organizationId.trim())
    .order('sort_score', { ascending: false })
    .limit(cap);

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[today_priorities]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      alert_type: pickStr(r, 'alert_type', 'alertType') || null,
      action_text: pickStr(r, 'action_text', 'actionText', 'recommended_action') || null,
      action_short: pickStr(r, 'action_short', 'actionShort') || null,
      impact: pickNum(r, 'impact', 'impact_estimate_thb'),
      sort_score: pickNum(r, 'sort_score', 'priority_score'),
    };
  });
}
