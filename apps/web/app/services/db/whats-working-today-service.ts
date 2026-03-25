/**
 * GET /rest/v1/whats_working_today — explicit column list (no select=*).
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
import {
  pickStr,
  resolveTodayPanelDisplay,
  SELECT_WHATS_WORKING_TODAY,
} from './today-panels-columns';

export interface WhatsWorkingTodayRow {
  organization_id: string | null;
  branch_id: string;
  /** @deprecated Not in compatibility view; kept for typing only. */
  branch_name: string | null;
  metric_date: string | null;
  title: string | null;
  description: string | null;
  /** Primary line for UI + dedupe: highlight_text if set, else title/description. */
  highlight_text: string | null;
  sort_score: number | null;
}

/** Trim + lowercase for dedupe keys (matches SQL lower(trim(...))). */
export function normalizeWhatsWorkingTitle(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase();
}

function normalizeBranchIdKey(id: string | null | undefined): string {
  return (id ?? '').trim().toLowerCase();
}

/** Dedupe by branch_id + metric_date + normalized display line. */
export function dedupeWhatsWorkingRows(rows: WhatsWorkingTodayRow[]): WhatsWorkingTodayRow[] {
  const seen = new Set<string>();
  const out: WhatsWorkingTodayRow[] = [];
  for (const row of rows) {
    const k = `${normalizeBranchIdKey(row.branch_id)}|${row.metric_date ?? ''}|${normalizeWhatsWorkingTitle(row.highlight_text)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/** Plain string lines (branch Today) — dedupe by normalized text only. */
export function dedupeWhatsWorkingHighlightLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const k = normalizeWhatsWorkingTitle(line);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
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
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.whats_working_today)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(10, Math.max(1, limit));
  const table = resolvePostgrestPhase1Table('whats_working_today');
  const { data, error } = await supabase
    .from(table)
    .select(SELECT_WHATS_WORKING_TODAY)
    .eq('organization_id', organizationId.trim())
    .order('sort_score', { ascending: false })
    .limit(cap);

  const rawForLog = Array.isArray(data) ? data : [];
  logPostgrestPhase1Read('whats_working_today', {
    organizationId: organizationId.trim(),
    rowCount: rawForLog.length,
    error: error ? { message: error.message, code: String(error.code ?? '') } : null,
  });

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.whats_working_today);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[whats_working_today]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  const mapped = raw.map((row) => {
    const r = row as Record<string, unknown>;
    const title = pickStr(r, 'title') || null;
    const description = pickStr(r, 'description') || null;
    const resolved =
      resolveTodayPanelDisplay(r, ['highlight_text', 'highlightText']) || null;
    return {
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: null,
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      title,
      description,
      highlight_text: resolved,
      sort_score: pickNum(r, 'sort_score'),
    };
  });
  return dedupeWhatsWorkingRows(mapped);
}
