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
} from '../../lib/supabase/postgrest-phase1-cutover';
import {
  pickStr,
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
    const displayKey = row.title || row.description || '';
    const k = `${normalizeBranchIdKey(row.branch_id)}|${row.metric_date ?? ''}|${normalizeWhatsWorkingTitle(displayKey)}`;
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

function normalizePanelText(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Exported for branch/company selection parity (SQL fallback rows when no positive signal). */
export function isWeakWhatsWorkingText(...parts: Array<string | null | undefined>): boolean {
  const n = normalizePanelText(parts.filter(Boolean).join(' | '));
  if (!n) return true;
  return (
    n.includes('business is stable today') ||
    n.includes('operations are holding steady') ||
    n.includes('revenue flow is consistent') ||
    n.includes('all good')
  );
}

function dateKey(d: string | null | undefined): string {
  return (d ?? '').trim().slice(0, 10);
}

function sortWhatsWorkingNewestFirst(a: WhatsWorkingTodayRow, b: WhatsWorkingTodayRow): number {
  const dc = dateKey(b.metric_date).localeCompare(dateKey(a.metric_date));
  if (dc !== 0) return dc;
  return (b.sort_score ?? Number.NEGATIVE_INFINITY) - (a.sort_score ?? Number.NEGATIVE_INFINITY);
}

/** Latest meaningful row per branch; if none, latest weak row. Order: metric_date desc, sort_score desc. */
export function selectLatestMeaningfulWhatsWorkingPerBranch(rows: WhatsWorkingTodayRow[]): WhatsWorkingTodayRow[] {
  const byBranch = new Map<string, WhatsWorkingTodayRow[]>();
  for (const row of rows) {
    const id = (row.branch_id ?? '').trim();
    if (!id) continue;
    const bucket = byBranch.get(id) ?? [];
    bucket.push(row);
    byBranch.set(id, bucket);
  }
  const out: WhatsWorkingTodayRow[] = [];
  for (const list of byBranch.values()) {
    const sorted = [...list].sort(sortWhatsWorkingNewestFirst);
    const meaningful = sorted.filter((r) => !isWeakWhatsWorkingText(r.title, r.description));
    out.push((meaningful.length > 0 ? meaningful[0] : sorted[0]) as WhatsWorkingTodayRow);
  }
  return out.sort((a, b) => (b.sort_score ?? Number.NEGATIVE_INFINITY) - (a.sort_score ?? Number.NEGATIVE_INFINITY));
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

  const cap = Math.min(50, Math.max(1, limit));
  const table = 'whats_working_today';
  const { data, error } = await supabase
    .from(table)
    .select(SELECT_WHATS_WORKING_TODAY)
    .eq('organization_id', organizationId.trim())
    .order('metric_date', { ascending: false })
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
    return {
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      title,
      description,
      sort_score: pickNum(r, 'sort_score'),
    };
  });
  const deduped = dedupeWhatsWorkingRows(mapped);
  const selected = selectLatestMeaningfulWhatsWorkingPerBranch(deduped);
  return selected.slice(0, Math.max(1, limit));
}
