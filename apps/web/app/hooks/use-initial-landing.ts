/**
 * Initial Landing Hook
 *
 * Handles role-based redirects ONLY on initial app load.
 * owner/admin → org overview; manager/staff/viewer → branch overview (no fallback to org overview).
 */
'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';

let initialLandingResolved = false;

export function useInitialLanding() {
  const router = useRouter();
  const pathname = usePathname();
  const { permissions, isLoggedIn } = useUserSession();
  const { role, isLoading: roleLoading } = useUserRole();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current || initialLandingResolved) return;
    if (!isLoggedIn || roleLoading || !role?.effectiveRole) return;

    if (pathname !== '/') {
      initialLandingResolved = true;
      hasRunRef.current = true;
      return;
    }

    const effectiveRole = role.effectiveRole;
    const group = businessGroupService.getBusinessGroup();
    const organization = group ?? (role.organizationId ? { id: role.organizationId, name: '' } : null);
    const orgId = role.organizationId ?? permissions.organizationId ?? group?.id;
    if (!organization || !orgId) return;

    if (['owner', 'admin'].includes(effectiveRole)) {
      router.replace(`/org/${orgId}/overview`);
      initialLandingResolved = true;
      hasRunRef.current = true;
      return;
    }

    const branches = getAccessibleBranches({ ...permissions, role: effectiveRole }).filter((b) => b.businessGroupId === orgId);
    const branchId = role.accessibleBranchIds?.find((id) => branches.some((b) => b.id === id)) ?? branches[0]?.id;
    if (!branchId) return;
    router.replace(`/org/${orgId}/branch/${branchId}/overview`);
    initialLandingResolved = true;
    hasRunRef.current = true;
  }, [isLoggedIn, roleLoading, role, pathname, router, permissions]);

  // Reset on page reload (when component unmounts and remounts)
  useEffect(() => {
    return () => {
      // Only reset if we're actually reloading (not just navigating)
      if (typeof window !== 'undefined') {
        // Check if this is a full page reload vs client-side navigation
        const isReload = window.performance.navigation.type === 1;
        if (isReload) {
          initialLandingResolved = false;
        }
      }
    };
  }, []);
}
