/**
 * Remember PostgREST objects that returned "missing" (404 / schema cache) so we stop
 * hammering the same endpoint for the rest of the browser session.
 */

const missing = new Set<string>();

export const POSTGREST_RESOURCE_KEYS = {
  /** Stable PostgREST contract: `public.branch_business_status_api` */
  branch_business_status_api: 'table:branch_business_status_api',
  alerts_today: 'table:alerts_today',
  get_alerts_critical: 'rpc:get_alerts_critical',
  today_priorities_view: 'table:today_priorities_view',
  today_priorities_company_view: 'table:today_priorities_company_view',
  whats_working_today: 'table:whats_working_today',
  opportunities_today: 'table:opportunities_today',
  watchlist_today: 'table:watchlist_today',
} as const;

export type PostgrestResourceKey = (typeof POSTGREST_RESOURCE_KEYS)[keyof typeof POSTGREST_RESOURCE_KEYS];

export function isPostgrestObjectMissingError(
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  const msg = (err.message ?? '').toLowerCase();
  const details = (err.details ?? '').toLowerCase();
  const hint = (err.hint ?? '').toLowerCase();
  if (code === 'PGRST202' || code === 'PGRST205') return true;
  if (msg.includes('schema cache') || msg.includes('could not find the table')) return true;
  if (msg.includes('could not find') && msg.includes('function')) return true;
  if ((msg.includes('does not exist') || msg.includes('undefined table')) && (msg.includes('relation') || msg.includes('view') || msg.includes('function')))
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
