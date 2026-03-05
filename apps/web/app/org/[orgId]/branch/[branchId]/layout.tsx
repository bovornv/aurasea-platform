/**
 * Branch layout: RBAC (user must have access to orgId and branchId).
 * Syncs current branch from URL so useCurrentBranch() works. Renders breadcrumb + nav + children.
 */
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUserSession } from '../../../../contexts/user-session-context';
import { useRbacReady } from '../../../../hooks/use-route-guard';
import { businessGroupService } from '../../../../services/business-group-service';
import { getAccessibleBranches, canAccessBranch } from '../../../../services/permissions-service';

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
  const isReady = useRbacReady();

  useEffect(() => {
    if (!isLoggedIn || !orgId || !branchId || !isReady) return;

    const group = businessGroupService.getBusinessGroup();
    const allowedOrgId = permissions.organizationId || group?.id;
    if (allowedOrgId && orgId !== allowedOrgId) {
      router.replace('/unauthorized?from=branch');
      return;
    }

    const accessible = getAccessibleBranches(permissions).filter(
      (b) => b.businessGroupId === orgId
    );
    if (!canAccessBranch(permissions, branchId)) {
      router.replace('/unauthorized?from=branch');
      return;
    }
    const branch = accessible.find((b) => b.id === branchId);
    if (!branch) {
      router.replace('/unauthorized?from=branch');
      return;
    }

    businessGroupService.setCurrentBranch(branchId);
  }, [isLoggedIn, orgId, branchId, permissions, router, isReady]);

  if (!isLoggedIn || !orgId || !branchId) return null;

  return <>{children}</>;
}
