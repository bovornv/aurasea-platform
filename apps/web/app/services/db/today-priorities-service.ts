/**
 * GET /rest/v1/today_priorities_view?organization_id=eq.{uuid}&order=sort_score.desc&limit=3
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

export interface TodayPrioritiesRow {
  branch_id: string;
  business_type: string | null;
  organization_id: string | null;
  branch_name: string | null;
  alert_type: string | null;
  title: string | null;
  description: string | null;
  action_text: string | null;
  short_title: string | null;
  impact_estimate_thb: number | null;
  impact_thb: number | null;
  impact_label: string | null;
  reason_short: string | null;
  sort_score: number | null;
  /** 1 = highest priority within org (from SQL ROW_NUMBER). */
  rank: number | null;
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

/** Top priorities for the org (max 3 rows). */
export async function fetchTodayPriorities(
  organizationId: string | null,
  businessType?: 'accommodation' | 'fnb' | null,
  limit: number = 3
): Promise<TodayPrioritiesRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(3, Math.max(1, limit));
  let query = supabase
    .from('today_priorities_view')
    .select('*')
    .eq('organization_id', organizationId.trim());
  if (businessType) {
    query = query.eq('business_type', businessType);
  }
  const { data, error } = await query.order('sort_score', { ascending: false }).limit(cap);

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[today_priorities_view]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const title = pickStr(r, 'title', 'short_title', 'shortTitle');
    const description = pickStr(r, 'description', 'action_text', 'actionText', 'recommended_action');
    const impact = pickNum(r, 'impact_thb', 'impact_estimate_thb', 'impact');
    return {
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      business_type: pickStr(r, 'business_type', 'businessType') || null,
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      alert_type: pickStr(r, 'alert_type', 'alertType') || null,
      title: title || null,
      description: description || null,
      action_text: description || pickStr(r, 'action_text', 'actionText') || null,
      short_title: title || pickStr(r, 'short_title', 'shortTitle') || null,
      impact_thb: impact,
      impact_estimate_thb: impact,
      impact_label: pickStr(r, 'impact_label', 'impactLabel') || null,
      reason_short: pickStr(r, 'reason_short', 'reasonShort', 'cause') || null,
      sort_score: pickNum(r, 'sort_score', 'priority_score'),
      rank: pickNum(r, 'rank'),
    };
  });
}
