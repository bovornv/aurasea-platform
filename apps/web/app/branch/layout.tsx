/**
 * Legacy /branch/* — redirect to /org/[orgId]/branch/[branchId]/*. Deprecated.
 */
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { useRbacReady } from '../hooks/use-route-guard';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches, mergeOrgRoleForBranchList } from '../services/permissions-service';

const BRANCH_TO_PATH: Record<string, string> = {
  overview: 'overview',
  'log-today': 'log',
  alerts: 'overview',
  trends: 'trends',
  scenario: 'overview',
  settings: 'settings',
};

export default function BranchLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, permissions } = useUserSession();
  const { role: userRole } = useUserRole();
  const isReady = useRbacReady();

  const permsForBranches = useMemo(
    () => mergeOrgRoleForBranchList(permissions, userRole?.effectiveRole),
    [permissions.organizationId, permissions.branchIds, permissions.role, permissions.email, userRole?.effectiveRole]
  );

  useEffect(() => {
    if (!isLoggedIn || !pathname?.startsWith('/branch')) return;
    if (!isReady) return;

    const group = businessGroupService.getBusinessGroup();
    const orgId = permissions.organizationId || group?.id;
    if (!orgId) return;
    const branches = getAccessibleBranches(permsForBranches).filter((b) => b.businessGroupId === orgId);
    if (branches.length === 0) {
      router.replace('/no-access?reason=branch');
      return;
    }
    const branchId = businessGroupService.getCurrentBranchId();
    const validId = branchId && branches.some((b) => b.id === branchId) ? branchId : branches[0].id;
    const segment = pathname.replace(/^\/branch\/?/, '').split('/')[0] || 'overview';
    const path = BRANCH_TO_PATH[segment] ?? 'overview';
    router.replace(`/org/${orgId}/branch/${validId}/${path}`);
  }, [isLoggedIn, pathname, permissions.organizationId, permsForBranches, router, isReady]);

  return null;
}
