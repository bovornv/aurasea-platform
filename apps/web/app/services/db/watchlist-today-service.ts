/**
 * GET /rest/v1/watchlist_today — explicit column list (no select=*).
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
} from '../../lib/supabase/postgrest-phase1-cutover';
import {
  pickStr,
  resolveTodayPanelDisplay,
  SELECT_WATCHLIST_TODAY,
} from './today-panels-columns';

export interface WatchlistTodayRow {
  organization_id: string | null;
  branch_id: string;
  /** @deprecated Not in compatibility view. */
  branch_name: string | null;
  metric_date: string | null;
  title: string | null;
  description: string | null;
  /** Primary line: warning_text if set, else title/description. */
  warning_text: string | null;
  sort_score: number | null;
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

export async function fetchWatchlistToday(
  organizationId: string | null,
  limit: number = 3
): Promise<WatchlistTodayRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.watchlist_today)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(50, Math.max(1, limit));
  // Runtime lock: Watchlist must read from v_next in all active UI paths.
  const table = 'watchlist_today_v_next';
  const { data, error } = await supabase
    .from(table)
    .select(SELECT_WATCHLIST_TODAY)
    .eq('organization_id', organizationId.trim())
    .order('metric_date', { ascending: false })
    .order('sort_score', { ascending: false })
    .limit(cap);

  const rawForLog = Array.isArray(data) ? data : [];
  logPostgrestPhase1Read('watchlist_today', {
    organizationId: organizationId.trim(),
    rowCount: rawForLog.length,
    error: error ? { message: error.message, code: String(error.code ?? '') } : null,
  });

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.watchlist_today);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[watchlist_today]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const resolved =
      resolveTodayPanelDisplay(r, ['warning_text', 'warningText']) || null;
    return {
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: null,
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      title: pickStr(r, 'title') || null,
      description: pickStr(r, 'description') || null,
      warning_text: resolved,
      sort_score: pickNum(r, 'sort_score'),
    };
  });
}
