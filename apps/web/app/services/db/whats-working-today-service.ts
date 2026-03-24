/**
 * GET /rest/v1/whats_working_today?select=*&order=sort_score.desc&limit=3
 * Optional: organization_id=eq.{uuid}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

export interface WhatsWorkingTodayRow {
  organization_id: string | null;
  branch_id: string;
  branch_name: string | null;
  metric_date: string | null;
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

/** Dedupe by branch_id + metric_date + normalized highlight_text; preserves first occurrence (highest sort_score if input pre-sorted desc). */
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
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.whats_working_today)) return [];
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
    return {
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      highlight_text: pickStr(r, 'highlight_text', 'highlightText') || null,
      sort_score: pickNum(r, 'sort_score'),
    };
  });
  return dedupeWhatsWorkingRows(mapped);
}
