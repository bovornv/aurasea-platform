/**
 * GET /rest/v1/alerts_fix_this_first?select=*&order=priority_score.desc&limit=3
 * Optional: organization_id=eq.{uuid}
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface AlertsFixThisFirstRow {
  branch_id: string;
  organization_id: string | null;
  branch_name: string | null;
  metric_date: string | null;
  alert_type: string | null;
  severity: number | null;
  impact_estimate_thb: number | null;
  cause: string | null;
  recommended_action: string | null;
  priority_score: number | null;
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

/**
 * Top priority actionable alerts for the org (max `limit` rows, default 3).
 * Requires organization_id (no unscoped query).
 */
export async function fetchAlertsFixThisFirst(
  organizationId: string | null,
  limit: number = 3
): Promise<AlertsFixThisFirstRow[]> {
  if (!organizationId?.trim() || !isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(20, Math.max(1, limit));
  const { data, error } = await supabase
    .from('alerts_fix_this_first')
    .select('*')
    .eq('organization_id', organizationId.trim())
    .order('priority_score', { ascending: false })
    .limit(cap);

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[alerts_fix_this_first]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      organization_id: pickStr(r, 'organization_id', 'organizationId') || null,
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      metric_date: r.metric_date != null ? String(r.metric_date).slice(0, 10) : null,
      alert_type: pickStr(r, 'alert_type', 'alertType') || null,
      severity: pickNum(r, 'severity', 'alert_severity'),
      impact_estimate_thb: pickNum(r, 'impact_estimate_thb', 'impact_estimate', 'estimated_revenue_impact'),
      cause: pickStr(r, 'cause', 'alert_message', 'message') || null,
      recommended_action:
        pickStr(r, 'recommended_action', 'recommendation', 'action', 'suggested_action') || null,
      priority_score: pickNum(r, 'priority_score'),
    };
  });
}
