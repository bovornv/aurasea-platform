/**
 * Branch Permission Guard
 *
 * RBAC: organization_members (owner, admin); branch_members (manager, staff, viewer).
 * Uses effectiveRole only. No fallback to permissions.role.
 * - On branch route: no branch and no org role → NoBranchPage (no-access); no effectiveRole → AccessDenied (unauthorized).
 */
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { useRbacReady } from '../hooks/use-route-guard';
import { validateBranchSelection, getAccessibleBranches, canAccessAllBranchesView, type UserPermissions, type UserRole } from '../services/permissions-service';
import { businessGroupService } from '../services/business-group-service';
import { BRANCH_SETTINGS_ROLES } from '../utils/rbac/permission-matrix';

/** Branch routes viewer can access: dashboard, reports, metrics, alerts, trends. */
const BRANCH_READ_ONLY_SEGMENTS = ['overview', 'trends', 'alerts', 'reports', 'metrics'];

function isBranchReadOnlyRoute(pathname: string): boolean {
  const match = pathname.match(/\/branch\/[^/]+\/([^/]+)/);
  const segment = match?.[1] ?? '';
  return BRANCH_READ_ONLY_SEGMENTS.includes(segment);
}

function isBranchRoute(pathname: string): boolean {
  return pathname.includes('/branch/');
}

function isBranchSettingsRoute(pathname: string): boolean {
  return /^\/org\/[^/]+\/branch\/[^/]+\/settings(\/|$)/.test(pathname);
}

interface BranchPermissionGuardProps {
  children: React.ReactNode;
}

export function BranchPermissionGuard({ children }: BranchPermissionGuardProps) {
  const { branch, branchId, isAllBranches } = useCurrentBranch();
  const { permissions } = useUserSession();
  const { role, isLoading: roleLoading } = useUserRole();
  const isReady = useRbacReady();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const effectiveRole = role?.effectiveRole ?? null;
  const orgRole = role?.organizationRole ?? null;
  const permissionsWithRole: UserPermissions = { ...permissions, role: (effectiveRole || '') as UserRole | '' };

  // Only redirect to no-access/unauthorized when isReady. Do not flash error pages while loading.
  useEffect(() => {
    if (!isBranchRoute(pathname) || roleLoading || role === null || !isReady) return;
    if (!branch && !orgRole) {
      router.replace('/no-access?reason=branch');
      return;
    }
    if (!effectiveRole) {
      router.replace('/unauthorized?from=branch');
      return;
    }
    // Branch settings: BRANCH_SETTINGS_ROLES only. Staff and viewer → branch overview.
    if (isBranchSettingsRoute(pathname) && !(BRANCH_SETTINGS_ROLES as readonly string[]).includes(effectiveRole)) {
      const orgId = pathname.match(/^\/org\/([^/]+)/)?.[1];
      const bid = pathname.match(/\/branch\/([^/]+)/)?.[1];
      if (orgId && bid) router.replace(`/org/${orgId}/branch/${bid}`);
    }
  }, [pathname, roleLoading, role, branch, orgRole, effectiveRole, router, isReady]);

  useEffect(() => {
    if (!effectiveRole && !isAllBranches) return;

    if (isAllBranches) {
      if (!canAccessAllBranchesView(permissionsWithRole)) {
        const accessibleBranches = getAccessibleBranches(permissionsWithRole);
        if (accessibleBranches.length > 0) {
          businessGroupService.setCurrentBranch(accessibleBranches[0].id);
          router.refresh();
        }
      }
      return;
    }

    if (branchId && isBranchRoute(pathname)) {
      if (!validateBranchSelection(permissionsWithRole, branchId)) {
        const accessibleBranches = getAccessibleBranches(permissionsWithRole);
        if (accessibleBranches.length > 0) {
          businessGroupService.setCurrentBranch(accessibleBranches[0].id);
          router.refresh();
        }
        return;
      }
      if (effectiveRole === 'viewer' && !isBranchReadOnlyRoute(pathname)) {
        const orgId = pathname.match(/^\/org\/([^/]+)/)?.[1];
        if (orgId && branchId) router.replace(`/org/${orgId}/branch/${branchId}/overview`);
      }
    }
  }, [branchId, isAllBranches, permissions, router, pathname, effectiveRole]);

  // Only show error/redirect state when isReady. While loading, render children (parent shows FullScreenLoader until ready).
  const blockBranchSettings =
    isBranchSettingsRoute(pathname) &&
    !roleLoading &&
    effectiveRole != null &&
    !(BRANCH_SETTINGS_ROLES as readonly string[]).includes(effectiveRole);
  const redirecting =
    isReady &&
    ((isBranchRoute(pathname) && !roleLoading && role !== null && ((!branch && !orgRole) || !effectiveRole)) ||
      blockBranchSettings);

  return redirecting ? null : <>{children}</>;
}
