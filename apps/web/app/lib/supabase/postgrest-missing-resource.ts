/**
 * Remember PostgREST objects that returned "missing" (404 / schema cache) so we stop
 * hammering the same endpoint for the rest of the browser session.
 */

const missing = new Set<string>();

/** Logical feature keys for session “missing” cache; physical `.from()` name may differ (see `postgrest-phase1-cutover.ts`). */
export const POSTGREST_RESOURCE_KEYS = {
  /** Stable PostgREST contract: `public.branch_business_status_api` */
  branch_business_status_api: 'table:branch_business_status_api',
  /** Same rows as legacy `alerts_today`; branch UI reads this name — use for company bundle too. */
  branch_alerts_today: 'table:branch_alerts_today',
  get_alerts_critical: 'rpc:get_alerts_critical',
  branch_recommendations: 'table:branch_recommendations',
  /** F&B purchase log (add-fnb-purchase-log.sql); optional until migration is applied. */
  fnb_purchase_log: 'table:fnb_purchase_log',
  today_priorities_view: 'table:today_priorities_view',
  /** Canonical branch priorities snapshot (latest metric_date per branch); branch Today section reads only this. */
  branch_priorities_current: 'table:branch_priorities_current',
  /** Company Today priorities rollup; same logical shape as today_priorities_company_view when present. */
  company_priorities_current: 'table:company_priorities_current',
  today_priorities_company_view: 'table:today_priorities_company_view',
  today_company_dashboard: 'table:today_company_dashboard',
  company_latest_business_status_v3: 'table:company_latest_business_status_v3',
  whats_working_today: 'table:whats_working_today',
  opportunities_today: 'table:opportunities_today',
  watchlist_today: 'table:watchlist_today',
  business_trends_today: 'table:business_trends_today',
  company_business_trends_today: 'table:company_business_trends_today',
  branch_performance_drivers_accommodation: 'table:branch_performance_drivers_accommodation',
  branch_performance_drivers_fnb: 'table:branch_performance_drivers_fnb',
} as const;

export type PostgrestResourceKey = (typeof POSTGREST_RESOURCE_KEYS)[keyof typeof POSTGREST_RESOURCE_KEYS];

export function isPostgrestObjectMissingError(
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  /** PostgREST HTTP status from `{ data, error, status }` — 404 almost always means relation/RPC not in schema. */
  httpStatus?: number
): boolean {
  if (httpStatus === 404) return true;
  if (!err) return false;
  const code = String(err.code ?? '');
  const msg = (err.message ?? '').toLowerCase();
  const details = (err.details ?? '').toLowerCase();
  const hint = (err.hint ?? '').toLowerCase();
  const blob = `${msg} ${details} ${hint}`;
  if (code === 'PGRST202' || code === 'PGRST205') return true;
  if (blob.includes('schema cache') || blob.includes('could not find the table')) return true;
  if (blob.includes('could not find') && blob.includes('function')) return true;
  if (
    (blob.includes('does not exist') || blob.includes('undefined table')) &&
    (blob.includes('relation') || blob.includes('view') || blob.includes('function'))
  )
    return true;
  if (details.includes('does not exist') || hint.includes('does not exist')) return true;
  if (code === '404') return true;
  return false;
}

export function markPostgrestResourceMissing(key: PostgrestResourceKey): void {
  missing.add(key);
}

export function isPostgrestResourceKnownMissing(key: PostgrestResourceKey): boolean {
  return missing.has(key);
}

/** Test / SSR: clear session gate */
export function clearPostgrestMissingResourceCache(): void {
  missing.clear();
}
