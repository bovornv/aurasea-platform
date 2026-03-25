/**
 * Company: GET /rest/v1/today_priorities_company_view?organization_id=eq.{uuid}&order=rank.asc&limit=5
 * Branch: GET /rest/v1/today_priorities_view?branch_id=eq.{uuid}&business_type=eq.{type}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';
import {
  logPostgrestPhase1Read,
  resolvePostgrestPhase1Table,
} from '../../lib/supabase/postgrest-phase1-cutover';

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
  /** Company view: 1..5 org-wide; branch view: per-branch rank from SQL. */
  rank: number | null;
  /** Company view only: fix_first | next_moves | more */
  priority_segment?: string | null;
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

function mapPriorityRow(r: Record<string, unknown>): TodayPrioritiesRow {
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
    priority_segment: pickStr(r, 'priority_segment', 'prioritySegment') || null,
  };
}

/** Cross-branch top signals for Company Today (max 5, org-ranked). */
export async function fetchCompanyTodayPriorities(
  organizationId: string | null,
  limit: number = 5
): Promise<TodayPrioritiesRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.today_priorities_company_view)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(5, Math.max(1, limit));
  const table = resolvePostgrestPhase1Table('today_priorities_company_view');
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('organization_id', organizationId.trim())
    .order('rank', { ascending: true })
    .limit(cap);

  const rawForLog = Array.isArray(data) ? data : [];
  logPostgrestPhase1Read('today_priorities_company_view', {
    organizationId: organizationId.trim(),
    rowCount: rawForLog.length,
    error: error ? { message: error.message, code: String(error.code ?? '') } : null,
  });

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.today_priorities_company_view);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[today_priorities_company_view]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => mapPriorityRow(row as Record<string, unknown>));
}

/**
 * Org priorities: uses `today_priorities_company_view` when businessType is unset (cross-branch).
 * With businessType, falls back to `today_priorities_view` (per-branch rows, sort_score).
 */
export async function fetchTodayPriorities(
  organizationId: string | null,
  businessType?: 'accommodation' | 'fnb' | null,
  limit: number = 5
): Promise<TodayPrioritiesRow[]> {
  if (!businessType) {
    return fetchCompanyTodayPriorities(organizationId, limit);
  }
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(5, Math.max(1, limit));
  const table = resolvePostgrestPhase1Table('today_priorities_view');
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('organization_id', organizationId.trim())
    .eq('business_type', businessType)
    .order('sort_score', { ascending: false })
    .limit(cap);

  const rawForLog = Array.isArray(data) ? data : [];
  logPostgrestPhase1Read('today_priorities_view', {
    organizationId: organizationId.trim(),
    rowCount: rawForLog.length,
    error: error ? { message: error.message, code: String(error.code ?? '') } : null,
  });

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[today_priorities_view]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => mapPriorityRow(row as Record<string, unknown>));
}
