/**
 * Branch layout: RBAC (user must have access to orgId and branchId).
 * Syncs current branch from URL so useCurrentBranch() works. Renders breadcrumb + nav + children.
 */
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUserSession } from '../../../../contexts/user-session-context';
import { useOrganization } from '../../../../contexts/organization-context';
import { useUserRole } from '../../../../contexts/user-role-context';
import { useRbacReady } from '../../../../hooks/use-route-guard';
import { businessGroupService } from '../../../../services/business-group-service';
import { getAccessibleBranches, mergeOrgRoleForBranchList } from '../../../../services/permissions-service';

export default function OrgBranchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string | undefined;
  const branchId = params?.branchId as string | undefined;
  const { isLoggedIn, permissions } = useUserSession();
  const { memberOrganizationIds } = useOrganization();
  const { role } = useUserRole();
  const isReady = useRbacReady();

  useEffect(() => {
    if (!isLoggedIn || !orgId || !branchId || !isReady) return;

    if (!memberOrganizationIds.includes(orgId)) {
      router.replace('/unauthorized?from=branch');
      return;
    }

    const isOrgLevel = role?.effectiveRole === 'owner' || role?.effectiveRole === 'admin';
    const hasBranchMembership = role?.accessibleBranchIds?.includes(branchId) ?? false;
    if (!isOrgLevel && !hasBranchMembership) {
      router.replace('/unauthorized?from=branch');
      return;
    }

    const permsForList = mergeOrgRoleForBranchList(permissions, role?.effectiveRole);
    const accessible = getAccessibleBranches(permsForList).filter((b) => b.businessGroupId === orgId);
    const branch = accessible.find((b) => b.id === branchId);
    if (!branch && !isOrgLevel) {
      router.replace('/unauthorized?from=branch');
      return;
    }

    businessGroupService.setCurrentBranch(branchId);
  }, [
    isLoggedIn,
    orgId,
    branchId,
    permissions,
    memberOrganizationIds,
    role?.effectiveRole,
    role?.accessibleBranchIds,
    router,
    isReady,
  ]);

  if (!isLoggedIn || !orgId || !branchId) return null;

  return <>{children}</>;
}
