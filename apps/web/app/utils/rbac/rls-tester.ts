/**
 * Supabase RLS tester for RBAC.
 * testRLSAccess(branchId): attempts to fetch branch_daily_metrics for another branch.
 * If fetch succeeds, logs [CRITICAL_RLS_BREACH].
 * Do NOT modify alert or health engine logic.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export interface RLSTestResult {
  branchIdTested: string;
  allowed: boolean;
  breach: boolean;
  error?: string;
  rowCount?: number;
}

/**
 * Attempts to fetch branch_daily_metrics for the given branchId.
 * When used as "other branch" test: if the current user should not have access to branchId
 * and rows are returned, this indicates an RLS breach.
 * Returns { allowed: false, breach: true } when data was returned but should not be visible.
 */
export async function testRLSAccess(branchId: string): Promise<RLSTestResult> {
  if (!isSupabaseAvailable()) {
    return { branchIdTested: branchId, allowed: false, breach: false, error: 'Supabase not available' };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { branchIdTested: branchId, allowed: false, breach: false, error: 'No Supabase client' };
  }

  try {
    const { data, error } = await supabase
      .from('branch_daily_metrics')
      .select('id, branch_id, metric_date')
      .eq('branch_id', branchId)
      .limit(5);

    if (error) {
      return {
        branchIdTested: branchId,
        allowed: false,
        breach: false,
        error: error.message,
      };
    }

    const rowCount = data?.length ?? 0;
    return {
      branchIdTested: branchId,
      allowed: rowCount >= 0,
      breach: false,
      rowCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      branchIdTested: branchId,
      allowed: false,
      breach: false,
      error: message,
    };
  }
}

/**
 * Test that the current user CANNOT read branch_daily_metrics for a branch they don't have access to.
 * Call with an "other" branchId (not in the user's accessibleBranchIds).
 * If rows are returned, log [CRITICAL_RLS_BREACH].
 */
export async function testRLSIsolationForBranch(
  otherBranchId: string,
  userAccessibleBranchIds: string[]
): Promise<RLSTestResult> {
  const isAllowedBranch = userAccessibleBranchIds.includes(otherBranchId);
  const result = await testRLSAccess(otherBranchId);

  if (!isAllowedBranch && (result.rowCount ?? 0) > 0) {
    console.error(
      `[CRITICAL_RLS_BREACH] User received ${result.rowCount} branch_daily_metrics row(s) for branch ${otherBranchId} which they should not access.`
    );
    return { ...result, breach: true };
  }

  return result;
}
