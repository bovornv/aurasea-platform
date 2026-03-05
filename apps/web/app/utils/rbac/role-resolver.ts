/**
 * Role resolution for RBAC validation.
 * Backend: organization_members (owner, admin); branch_members (manager, staff, viewer).
 * Validation must use effectiveRole only — never require org-level role for branch users.
 */

import type { RbacRole } from './permission-matrix';

function normalize(s: string | null | undefined): string {
  return s?.toLowerCase().trim() ?? '';
}

/**
 * Resolve effective role from org and branch role.
 * - If orgRole is owner or admin → return orgRole (org-level).
 * - Else if branchRole exists (manager, staff, viewer) → return branchRole.
 * - Else → null.
 * Do not treat branch manager as organization manager.
 */
export function resolveEffectiveRole(
  orgRole: string | null | undefined,
  branchRole: string | null | undefined
): RbacRole | null {
  const org = normalize(orgRole);
  const branch = normalize(branchRole);
  if (org === 'owner' || org === 'admin') return org as RbacRole;
  if (branch === 'manager' || branch === 'staff' || branch === 'viewer') return branch as RbacRole;
  return null;
}

/** True if role is org-level (can access all branches in org). */
export function isOrgLevelRole(role: RbacRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** True if role is branch-only (manager, staff, viewer). */
export function isBranchRole(role: RbacRole | null): boolean {
  return role === 'manager' || role === 'staff' || role === 'viewer';
}
