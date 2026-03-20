/**
 * AI / batch-generated org-level copy for Company Today (top of page).
 * Table: company_daily_summary (filter organization_id).
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

function pickSummaryText(row: Record<string, unknown> | null): string {
  if (!row) return '';
  const keys = ['summary_text', 'summaryText', 'body', 'content', 'text'] as const;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/**
 * Latest row for the organization (by updated_at / created_at / generated_at when present).
 */
export async function fetchCompanyDailySummary(organizationId: string | null): Promise<{
  summaryText: string | null;
  error: string | null;
}> {
  if (!isSupabaseAvailable() || !organizationId?.trim()) {
    return { summaryText: null, error: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) return { summaryText: null, error: null };

  const { data, error } = await supabase
    .from('company_daily_summary')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[company_daily_summary]', error.message);
    }
    return { summaryText: null, error: error.message };
  }

  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const text = pickSummaryText(row);
  return { summaryText: text || null, error: null };
}
