/**
 * Phase 1 app-side cutover: map logical PostgREST resources to `*_v_next` views when enabled.
 *
 * Toggle (build / runtime):
 * - `NEXT_PUBLIC_POSTGREST_PHASE1_V_NEXT=true` (client + server)
 * - `POSTGREST_PHASE1_V_NEXT=true` (server-only fallback)
 *
 * Rollback: unset or set to anything other than `true` / `1` → all reads use live names.
 *
 * Phase 1 logical → physical when enabled:
 * - whats_working_today → whats_working_today_v_next
 * - watchlist_today → watchlist_today_v_next
 * - branch_business_status_api → branch_business_status_api_v_next
 * - today_priorities_view → today_priorities_view_v_next
 * - today_priorities_company_view → today_priorities_company_view_v_next
 *
 * Wired in TS (services): whats-working-today-service, watchlist-today-service, today-priorities-service,
 * today-branch-priorities-service, company-today-dashboard-service (branch panels), branch-business-status-api
 * via getBranchBusinessStatusApiTable() (latest-metrics, health-score-kpi, company-today-data, anomaly-signals).
 *
 * No direct `.from()` in app for: `today_summary_clean`, `branch_business_status` (base view), `today_priorities_ranked`.
 * DB may expose `today_summary_clean_v_next`, `branch_business_status_v_next`, `today_priorities_ranked_v_next`;
 * they are not toggled here until a later phase wires new reads.
 *
 * Intentionally NOT switched by phase-1 mapping (stay on live): `today_company_dashboard`,
 * `alerts_today` / `alerts_enriched` chain, `today_summary` / `today_summary_clean`, `daily_metrics_legacy`.
 *
 * Alerts/opportunities track (separate toggle, OFF by default):
 * - opportunities_today → opportunities_today_v_next when `NEXT_PUBLIC_POSTGREST_ALERTS_V_NEXT=true`
 * - get_alerts_critical → get_alerts_critical__candidate when `NEXT_PUBLIC_POSTGREST_ALERTS_V_NEXT=true`
 *   (or `POSTGREST_ALERTS_V_NEXT=true` on server).
 */

export type PostgrestPhase1Logical =
  | 'whats_working_today'
  | 'watchlist_today'
  | 'branch_business_status_api'
  | 'today_priorities_view'
  | 'today_priorities_company_view';

export type PostgrestAlertsLogical = 'opportunities_today' | 'get_alerts_critical';

const LIVE: Record<PostgrestPhase1Logical, string> = {
  whats_working_today: 'whats_working_today',
  watchlist_today: 'watchlist_today',
  branch_business_status_api: 'branch_business_status_api',
  today_priorities_view: 'today_priorities_view',
  today_priorities_company_view: 'today_priorities_company_view',
};

const V_NEXT: Record<PostgrestPhase1Logical, string> = {
  whats_working_today: 'whats_working_today_v_next',
  watchlist_today: 'watchlist_today_v_next',
  branch_business_status_api: 'branch_business_status_api_v_next',
  today_priorities_view: 'today_priorities_view_v_next',
  today_priorities_company_view: 'today_priorities_company_view_v_next',
};

const ALERTS_LIVE: Record<PostgrestAlertsLogical, string> = {
  opportunities_today: 'opportunities_today',
  get_alerts_critical: 'get_alerts_critical',
};

const ALERTS_V_NEXT: Record<PostgrestAlertsLogical, string> = {
  opportunities_today: 'opportunities_today_v_next',
  get_alerts_critical: 'get_alerts_critical__candidate',
};

export function isPostgrestPhase1VNextEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  const v = process.env.NEXT_PUBLIC_POSTGREST_PHASE1_V_NEXT ?? process.env.POSTGREST_PHASE1_V_NEXT;
  return v === 'true' || v === '1';
}

/** Resolved physical relation name for Supabase `.from(...)`. */
export function resolvePostgrestPhase1Table(logical: PostgrestPhase1Logical): string {
  return isPostgrestPhase1VNextEnabled() ? V_NEXT[logical] : LIVE[logical];
}

export function isPostgrestAlertsVNextEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  const v = process.env.NEXT_PUBLIC_POSTGREST_ALERTS_V_NEXT ?? process.env.POSTGREST_ALERTS_V_NEXT;
  return v === 'true' || v === '1';
}

/** Resolved physical relation name for alerts-track reads (currently opportunities only). */
export function resolvePostgrestAlertsTable(logical: PostgrestAlertsLogical): string {
  return isPostgrestAlertsVNextEnabled() ? ALERTS_V_NEXT[logical] : ALERTS_LIVE[logical];
}

/** Resolved RPC function name for alerts-track calls. */
export function resolvePostgrestAlertsRpc(logical: PostgrestAlertsLogical): string {
  return resolvePostgrestAlertsTable(logical);
}

export function logPostgrestPhase1Read(
  logical: PostgrestPhase1Logical,
  detail: {
    organizationId?: string | null;
    branchId?: string | null;
    rowCount: number;
    error?: { message?: string; code?: string } | null;
  }
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[postgrest-phase1]', {
    logical,
    physical: resolvePostgrestPhase1Table(logical),
    phase1VNext: isPostgrestPhase1VNextEnabled(),
    organizationId: detail.organizationId ?? null,
    branchId: detail.branchId ?? null,
    rowCount: detail.rowCount,
    error: detail.error
      ? { message: detail.error.message ?? null, code: detail.error.code ?? null }
      : null,
  });
}

export function logPostgrestAlertsRead(
  logical: PostgrestAlertsLogical,
  detail: {
    organizationId?: string | null;
    branchId?: string | null;
    rowCount: number;
    error?: { message?: string; code?: string } | null;
  }
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[postgrest-alerts-track]', {
    logical,
    physical: resolvePostgrestAlertsTable(logical),
    alertsVNext: isPostgrestAlertsVNextEnabled(),
    organizationId: detail.organizationId ?? null,
    branchId: detail.branchId ?? null,
    rowCount: detail.rowCount,
    error: detail.error
      ? { message: detail.error.message ?? null, code: detail.error.code ?? null }
      : null,
  });
}
