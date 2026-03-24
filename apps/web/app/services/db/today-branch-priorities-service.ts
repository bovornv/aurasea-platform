/**
 * GET /rest/v1/today_branch_priorities?select=*&branch_id=eq.{branchId}&order=rank.asc&limit=3
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface TodayBranchPriorityRow {
  branch_id: string;
  metric_date: string | null;
  short_title: string | null;
  action_text: string | null;
  impact_estimate_thb: number | null;
  impact_label: string | null;
  sort_score: number | null;
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

export async function fetchTodayBranchPriorities(
  branchId: string | null,
  limit: number = 3
): Promise<TodayBranchPriorityRow[]> {
  if (!branchId?.trim() || !isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(3, Math.max(1, limit));
  const { data, error } = await supabase
    .from('today_branch_priorities')
    .select('*')
    .eq('branch_id', branchId.trim())
    .order('rank', { ascending: true })
    .limit(cap);

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[today_branch_priorities]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      short_title: pickStr(r, 'short_title', 'shortTitle') || null,
      action_text: pickStr(r, 'action_text', 'actionText') || null,
      impact_estimate_thb: pickNum(r, 'impact_estimate_thb', 'impact'),
      impact_label: pickStr(r, 'impact_label', 'impactLabel') || null,
      sort_score: pickNum(r, 'sort_score', 'priority_score'),
      rank: pickNum(r, 'rank'),
    };
  });
}

