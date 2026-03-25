/**
 * PostgREST reads for `public.branch_business_status_api` — explicit selects only (no *).
 * Physical relation: live `branch_business_status_api` or `branch_business_status_api_v_next` when phase 1 is on.
 */
import { resolvePostgrestPhase1Table } from '../../lib/supabase/postgrest-phase1-cutover';

export function getBranchBusinessStatusApiTable(): string {
  return resolvePostgrestPhase1Table('branch_business_status_api');
}

/** Company Today owner tables — all API columns needed for normalization + org filter. */
export const SELECT_BRANCH_BUSINESS_STATUS_API_COMPANY =
  'branch_id,organization_id,branch_name,status_label,status_subtitle,health_score,updated_at,metric_date,revenue_thb,customers,avg_ticket';

/** Branch Today summary card — revenue + health + F&B fields (null-safe for accommodation). */
export const SELECT_BRANCH_BUSINESS_STATUS_API_TODAY_SUMMARY =
  'branch_id,metric_date,revenue_thb,customers,avg_ticket,health_score';

export const SELECT_BRANCH_BUSINESS_STATUS_API_ANOMALY =
  'branch_id,metric_date,revenue_thb,health_score';

export const SELECT_BRANCH_BUSINESS_STATUS_API_HEALTH_ONLY = 'health_score';

export type BranchBusinessStatusApiCallSite =
  | 'company_today_bundle'
  | 'company_today_org_fallback'
  | 'branch_today_summary'
  | 'anomaly_signals'
  | 'health_kpi_accommodation'
  | 'health_kpi_fnb';

export type BranchBusinessStatusApiUiSurface = 'accommodation' | 'fnb' | 'company_today' | 'unknown';

export function logBranchBusinessStatusApiDev(
  site: BranchBusinessStatusApiCallSite,
  detail: {
    branchIds?: string[];
    organizationId?: string | null;
    select: string;
    data?: unknown;
    error?: { message?: string; code?: string; details?: string; hint?: string } | null;
    /** Which product surface issued the read (dev-only disambiguation). */
    uiSurface?: BranchBusinessStatusApiUiSurface;
  }
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const payload = {
    endpoint: getBranchBusinessStatusApiTable(),
    callSite: site,
    uiSurface: detail.uiSurface ?? null,
    select: detail.select,
    branchIds: detail.branchIds ?? null,
    organizationId: detail.organizationId ?? null,
    responseBody: detail.data ?? null,
    errorBody: detail.error
      ? {
          message: detail.error.message ?? null,
          code: detail.error.code ?? null,
          details: detail.error.details ?? null,
          hint: detail.error.hint ?? null,
        }
      : null,
  };
  if (detail.error) {
    console.warn('[branch_business_status_api]', payload);
  } else {
    console.log('[branch_business_status_api]', payload);
  }
}
