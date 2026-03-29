/**
 * Company Today — top business trend from public.business_trends_today for the org.
 * Latest metric_date in the table for that organization, then highest sort_score (PostgREST multi-column order).
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

const TABLE = 'business_trends_today';
const SELECT_COLUMNS =
  'organization_id,branch_id,branch_name,metric_date,trend_text,read_text,meaning_text,sort_score';

export interface CompanyBusinessTrendHighlightRow {
  organization_id: string;
  branch_id: string;
  branch_name: string | null;
  metric_date: string | null;
  trend_text: string;
  read_text: string;
  meaning_text: string;
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

export async function fetchCompanyBusinessTrendHighlight(
  organizationId: string | null,
): Promise<CompanyBusinessTrendHighlightRow | null> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return null;
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.business_trends_today)) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId.trim())
    .order('metric_date', { ascending: false })
    .order('sort_score', { ascending: false })
    .limit(1);

  const raw = Array.isArray(data) ? data : [];
  if (process.env.NODE_ENV === 'development') {
    console.log('[business-trends-company]', {
      organization_id: organizationId.trim(),
      row_count: raw.length,
      error: error ? { message: error.message, code: String(error.code ?? '') } : null,
    });
  }

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.business_trends_today);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[business_trends_today]', error.message);
    }
    return null;
  }

  const r = raw[0] as Record<string, unknown> | undefined;
  if (!r) return null;

  const trend_text = pickStr(r, 'trend_text', 'trendText');
  const read_text = pickStr(r, 'read_text', 'readText');
  const meaning_text = pickStr(r, 'meaning_text', 'meaningText');
  if (!trend_text && !read_text && !meaning_text) return null;

  return {
    organization_id: pickStr(r, 'organization_id', 'organizationId') || organizationId.trim(),
    branch_id: pickStr(r, 'branch_id', 'branchId'),
    branch_name: pickStr(r, 'branch_name', 'branchName') || null,
    metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
    trend_text: trend_text || '',
    read_text: read_text || '',
    meaning_text: meaning_text || '',
    sort_score: pickNum(r, 'sort_score', 'sortScore'),
  };
}
