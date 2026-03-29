/**
 * Company Today — up to 2 rows from public.company_business_trends_today (acc + fnb),
 * latest metric_date per business_type, top sort_score per type (view-defined).
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

const TABLE = 'company_business_trends_today';
const SELECT_COLUMNS =
  'organization_id,branch_id,branch_name,business_type,metric_date,trend_text,read_text,meaning_text,sort_score';

export interface CompanyBusinessTrendHighlightRow {
  organization_id: string;
  branch_id: string;
  branch_name: string | null;
  /** accommodation | fnb from company view */
  business_type: string;
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

/** Display order: accommodation first, then fnb */
function sortCompanyTrendRows(rows: CompanyBusinessTrendHighlightRow[]): CompanyBusinessTrendHighlightRow[] {
  const rank = (bt: string): number => {
    const x = bt.toLowerCase();
    if (x === 'accommodation') return 0;
    if (x === 'fnb') return 1;
    return 9;
  };
  return [...rows].sort((a, b) => rank(a.business_type) - rank(b.business_type)).slice(0, 2);
}

function rowFromRecord(r: Record<string, unknown>, organizationId: string): CompanyBusinessTrendHighlightRow | null {
  const trend_text = pickStr(r, 'trend_text', 'trendText');
  const read_text = pickStr(r, 'read_text', 'readText');
  const meaning_text = pickStr(r, 'meaning_text', 'meaningText');
  if (!trend_text && !read_text && !meaning_text) return null;
  return {
    organization_id: pickStr(r, 'organization_id', 'organizationId') || organizationId,
    branch_id: pickStr(r, 'branch_id', 'branchId'),
    branch_name: pickStr(r, 'branch_name', 'branchName') || null,
    business_type: pickStr(r, 'business_type', 'businessType') || 'unknown',
    metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
    trend_text: trend_text || '',
    read_text: read_text || '',
    meaning_text: meaning_text || '',
    sort_score: pickNum(r, 'sort_score', 'sortScore'),
  };
}

export async function fetchCompanyBusinessTrendHighlights(
  organizationId: string | null,
): Promise<CompanyBusinessTrendHighlightRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.company_business_trends_today)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId.trim())
    .limit(10);

  const raw = Array.isArray(data) ? data : [];
  if (process.env.NODE_ENV === 'development') {
    console.log('[business-trends-company]', {
      organization_id: organizationId.trim(),
      source: TABLE,
      row_count: raw.length,
      error: error ? { message: error.message, code: String(error.code ?? '') } : null,
    });
  }

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.company_business_trends_today);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[company_business_trends_today]', error.message);
    }
    return [];
  }

  const oid = organizationId.trim();
  const parsed = raw
    .map((row) => rowFromRecord(row as Record<string, unknown>, oid))
    .filter((x): x is CompanyBusinessTrendHighlightRow => x != null);

  return sortCompanyTrendRows(parsed);
}
