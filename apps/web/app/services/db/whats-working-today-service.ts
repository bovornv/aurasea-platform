/**
 * GET /rest/v1/whats_working_today?select=*&order=sort_score.desc&limit=3
 * Optional: organization_id=eq.{uuid}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface WhatsWorkingTodayRow {
  organization_id: string | null;
  branch_id: string;
  branch_name: string | null;
  metric_date: string | null;
  highlight_text: string | null;
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

export async function fetchWhatsWorkingToday(
  organizationId: string | null,
  limit: number = 3
): Promise<WhatsWorkingTodayRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(10, Math.max(1, limit));
  const { data, error } = await supabase
    .from('whats_working_today')
    .select('*')
    .eq('organization_id', organizationId.trim())
    .order('sort_score', { ascending: false })
    .limit(cap);

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[whats_working_today]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      highlight_text: pickStr(r, 'highlight_text', 'highlightText') || null,
      sort_score: pickNum(r, 'sort_score'),
    };
  });
}
