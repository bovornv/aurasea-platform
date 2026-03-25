/**
 * Branch Today — Today's Priorities
 * GET /rest/v1/today_priorities_view?branch_id=eq.{id}&business_type=eq.{type}
 *   &order=sort_score.desc&limit=4
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

export interface TodayBranchPriorityRow {
  branch_id: string;
  business_type: 'accommodation' | 'fnb' | string;
  metric_date: string | null;
  title: string | null;
  description: string | null;
  short_title: string | null;
  action_text: string | null;
  impact_thb: number | null;
  impact_estimate_thb: number | null;
  impact_label: string | null;
  urgency: string | null;
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

function mapRow(row: Record<string, unknown>, branchId: string): TodayBranchPriorityRow {
  const title = pickStr(row, 'title', 'short_title', 'shortTitle');
  const description = pickStr(row, 'description', 'action_text', 'actionText');
  const impact = pickNum(row, 'impact_thb', 'impact_estimate_thb', 'impact');
  return {
    branch_id: pickStr(row, 'branch_id', 'branchId') || branchId,
    business_type: pickStr(row, 'business_type', 'businessType') || 'unknown',
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
    title: title || null,
    description: description || null,
    short_title: title || pickStr(row, 'short_title', 'shortTitle') || null,
    action_text: description || pickStr(row, 'action_text', 'actionText') || null,
    impact_thb: impact,
    impact_estimate_thb: impact,
    impact_label: pickStr(row, 'impact_label', 'impactLabel') || null,
    urgency: pickStr(row, 'urgency') || null,
    sort_score: pickNum(row, 'sort_score', 'priority_score'),
  };
}

export async function fetchTodayBranchPriorities(
  branchId: string | null,
  businessType: 'accommodation' | 'fnb' | null | undefined,
  limit: number = 4,
  locale: 'en' | 'th' = 'en'
): Promise<TodayBranchPriorityRow[]> {
  if (!branchId?.trim() || !businessType || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view)) {
    return [];
  }
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(10, Math.max(1, limit));
  const { data, error } = await supabase
    .from('today_priorities_view')
    .select('*')
    .eq('branch_id', branchId.trim())
    .eq('business_type', businessType)
    .order('sort_score', { ascending: false })
    .limit(cap);

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[today_priorities_view branch]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  if (raw.length === 0) return [];
  return raw.map((row) => mapRow(row as Record<string, unknown>, branchId.trim()));
}
