/**
 * Hook to run RBAC UI and isolation validation after render.
 * Validation uses effectiveRole only (org-level: owner/admin; branch-level: manager/staff/viewer).
 * Does not require org-level role for branch users; does not fail if org loads after branch.
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useUserRole } from '../contexts/user-role-context';
import { validateUIPermissions } from '../utils/rbac/ui-validator';
import {
  checkCrossBranchViolation,
  checkCrossOrgViolation,
  parseOrgBranchFromPath,
} from '../utils/rbac/isolation-tests';
import type { RbacRole } from '../utils/rbac/permission-matrix';

export function useRBACValidation(): void {
  const pathname = usePathname();
  const { role } = useUserRole();
  const ran = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !role) return;

    const path = pathname || '';
    const { pathOrgId, pathBranchId } = parseOrgBranchFromPath(path);

    const effectiveRole: RbacRole = (role.effectiveRole ?? 'viewer') as RbacRole;
    const ctx = {
      role: effectiveRole,
      organizationId: role.organizationId,
      accessibleBranchIds: role.accessibleBranchIds,
      pathOrgId,
      pathBranchId,
      pathname: path,
    };

    checkCrossOrgViolation(ctx);
    checkCrossBranchViolation(ctx);

    const t = setTimeout(() => {
      validateUIPermissions(effectiveRole);
      ran.current = true;
    }, 500);

    return () => clearTimeout(t);
  }, [pathname, role]);
}
