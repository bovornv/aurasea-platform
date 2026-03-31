/**
 * AI / batch-generated org-level copy for Company Today (top of page).
 *
 * NOTE: `public.company_daily_summary` was removed in schema cleanup.
 * This client now returns null without calling the endpoint.
 */

/**
 * Latest row for the organization (by updated_at / created_at / generated_at when present).
 */
export async function fetchCompanyDailySummary(organizationId: string | null): Promise<{
  summaryText: string | null;
  error: string | null;
}> {
  void organizationId;
  return { summaryText: null, error: null };
}
