/**
 * Cross-branch and company-level isolation tests for RBAC.
 * Backend: organization_members (owner, admin); branch_members (manager, staff, viewer).
 * - Branch user on Branch A attempting Branch B URL → log [CROSS_BRANCH_ACCESS_VIOLATION].
 * - User in Org A attempting Org B URL → log [CROSS_ORG_ACCESS_VIOLATION].
 * Do NOT require org-level role for branch users. Do NOT fail if org loads after branch.
 */

import type { RbacRole } from './permission-matrix';
import { isOrgLevelRole } from './role-resolver';

export interface IsolationTestContext {
  /** Resolved effectiveRole only (from resolveEffectiveRole). */
  role: RbacRole;
  organizationId: string | null;
  accessibleBranchIds: string[];
  pathOrgId: string | null;
  pathBranchId: string | null;
  pathname: string;
}

/**
 * Returns true if the current route is a cross-branch access attempt.
 * Only owner and admin (org-level) can access any branch; manager, staff, viewer are branch-scoped.
 */
export function isCrossBranchAccessAttempt(ctx: IsolationTestContext): boolean {
  if (isOrgLevelRole(ctx.role)) return false;
  if (!ctx.pathBranchId || ctx.accessibleBranchIds.length === 0) return false;
  return !ctx.accessibleBranchIds.includes(ctx.pathBranchId);
}

/**
 * Returns true if the current route is a different-org access attempt.
 * Do not treat as violation when organizationId is null (org may load slightly after branch).
 */
export function isCrossOrgAccessAttempt(ctx: IsolationTestContext): boolean {
  if (!ctx.pathOrgId) return false;
  if (ctx.organizationId == null) return false;
  return ctx.pathOrgId !== ctx.organizationId;
}

/**
 * Call when a branch page has loaded. If ctx indicates cross-branch access and we're still here, log violation.
 */
export function checkCrossBranchViolation(ctx: IsolationTestContext): void {
  if (isCrossBranchAccessAttempt(ctx)) {
    console.error(
      `[CROSS_BRANCH_ACCESS_VIOLATION] User (role=${ctx.role}) loaded branch ${ctx.pathBranchId} but has access only to: ${ctx.accessibleBranchIds.join(', ')}`
    );
  }
}

/**
 * Call when an org page has loaded. If ctx indicates cross-org access and we're still here, log violation.
 */
export function checkCrossOrgViolation(ctx: IsolationTestContext): void {
  if (isCrossOrgAccessAttempt(ctx)) {
    console.error(
      `[CROSS_ORG_ACCESS_VIOLATION] User (org=${ctx.organizationId}) loaded org ${ctx.pathOrgId}`
    );
  }
}

/**
 * Parse pathname to get pathOrgId and pathBranchId.
 */
export function parseOrgBranchFromPath(pathname: string): { pathOrgId: string | null; pathBranchId: string | null } {
  const orgMatch = pathname.match(/^\/org\/([^/]+)/);
  const branchMatch = pathname.match(/^\/org\/[^/]+\/branch\/([^/]+)/);
  return {
    pathOrgId: orgMatch?.[1] ?? null,
    pathBranchId: branchMatch?.[1] ?? null,
  };
}
