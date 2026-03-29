/**
 * PostgREST `select` fragments for compatibility views where legacy columns are preserved
 * and new columns (title, description, …) are appended. Do not use `select=*` (breaks when
 * extra client-only assumptions exist); do not request columns not on the view.
 */

export const SELECT_WHATS_WORKING_TODAY =
  'organization_id,branch_id,branch_name,metric_date,title,description,sort_score';

export const SELECT_OPPORTUNITIES_TODAY =
  'organization_id,branch_id,metric_date,title,description,sort_score,opportunity_text';

export const SELECT_WATCHLIST_TODAY =
  'organization_id,branch_id,branch_name,metric_date,title,description,sort_score,watchlist_text';

/** Branch-scoped fetch: enough to render one line per row. */
export const SELECT_WHATS_WORKING_TODAY_BRANCH = 'metric_date,title,description,sort_score';

export const SELECT_OPPORTUNITIES_TODAY_BRANCH = 'title,description,sort_score,opportunity_text';

export const SELECT_WATCHLIST_TODAY_BRANCH =
  'branch_name,metric_date,title,description,sort_score,watchlist_text';

export function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/**
 * Prefer legacy single-line column(s), then title + description (compatibility append).
 */
export function resolveTodayPanelDisplay(
  r: Record<string, unknown>,
  legacyPrimaryKeys: readonly string[]
): string {
  for (const k of legacyPrimaryKeys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  const title = pickStr(r, 'title');
  const desc = pickStr(r, 'description');
  if (title && desc) {
    const sep = /^[\s(]/.test(desc) ? ' ' : ': ';
    return `${title}${sep}${desc}`;
  }
  return title || desc;
}
