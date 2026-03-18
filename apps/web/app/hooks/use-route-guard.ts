/**
 * Route Guard Hook
 *
 * Strict separation: LOADING vs UNAUTHORIZED. No redirects or error UI until isReady.
 * isReady = session + org + branch context + role resolved. AccessDenied only when isReady && truly no access.
 */
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserRole } from '../contexts/user-role-context';
import { useUserSession } from '../contexts/user-session-context';
import { useOrganization } from '../contexts/organization-context';
import { validateRouteAccess } from '../utils/rbac/route-validator';
import type { RbacRole } from '../utils/rbac/permission-matrix';
import {
  BRANCH_READ_ROLES,
  BRANCH_SETTINGS_ROLES,
  BRANCH_WRITE_ROLES,
  ORG_ROLES,
} from '../utils/rbac/permission-matrix';
import { getAccessibleBranches, type UserRole, type UserPermissions } from '../services/permissions-service';
import { devLog } from '../lib/dev-log';

/** Deterministic RBAC permission matrix (company + branch). */
export const ROUTE_PERMISSIONS = {
  company: {
    overview: ['owner', 'admin'],
    settings: ['owner', 'admin'],
  },
  branch: {
    overview: ['owner', 'admin', 'manager', 'staff'],
    operating: ['owner', 'admin', 'manager', 'staff'],
    trends: ['owner', 'admin', 'manager'],
    log: ['owner', 'admin', 'manager'],
    settings: ['owner', 'admin'],
  },
} as const;

/** Resolve first allowed branch route for role. Returns path or null. */
export function resolveFallbackRoute(role: string, branchId: string, orgId: string): string | null {
  const branchRoutes = ROUTE_PERMISSIONS.branch;
  const entry = Object.entries(branchRoutes).find(([, roles]) => (roles as readonly string[]).includes(role));
  if (!entry) return null;
  const [routeKey] = entry;
  return `/org/${orgId}/branch/${branchId}/${routeKey}`;
}

/** Global RBAC ready: session, org, branch context, and role must all be resolved before any redirect/error UI. */
export function useRbacReady(): boolean {
  const { isLoggedIn } = useUserSession();
  const { isInitialized: orgInitialized, isLoading: orgLoading } = useOrganization();
  const { role, isLoading: roleLoading } = useUserRole();
  const sessionLoaded = isLoggedIn;
  const orgLoaded = Boolean(orgInitialized && !orgLoading);
  const roleResolved = Boolean(!roleLoading && role != null);
  const isCompanyRole = role?.effectiveRole === 'owner' || role?.effectiveRole === 'admin';
  const branchContextResolved = Boolean(isCompanyRole || role?.accessibleBranchIds !== undefined);
  return useMemo(
    () => sessionLoaded && orgLoaded && roleResolved && branchContextResolved,
    [sessionLoaded, orgLoaded, roleResolved, branchContextResolved]
  );
}

const BRANCH_ROLES = ['manager', 'staff'] as const;
function isBranchRole(role: string | null | undefined): boolean {
  return role != null && (BRANCH_ROLES as readonly string[]).includes(role);
}

/** Branch sub-route permission map. Order defines fallback priority (first allowed wins). */
const BRANCH_ROUTE_PERMISSIONS: Record<string, string[]> = {
  overview: ['owner', 'admin', 'manager', 'staff'],
  operating: ['owner', 'admin', 'manager', 'staff'],
  trends: ['owner', 'admin', 'manager'],
  log: ['owner', 'admin', 'manager'],
  settings: ['owner', 'admin'],
};
const BRANCH_FALLBACK_ORDER = ['overview', 'operating', 'trends', 'log', 'settings'] as const;

/** Map URL segment to permission key for BRANCH_ROUTE_PERMISSIONS. */
const SEGMENT_TO_ROUTE_KEY: Record<string, string> = {
  overview: 'overview',
  operating: 'operating',
  trends: 'trends',
  log: 'log',
  settings: 'settings',
  alerts: 'overview',
  reports: 'overview',
  metrics: 'overview',
};

function getBranchRouteKey(path: string): string | null {
  const m = path.match(/^\/org\/[^/]+\/branch\/[^/]+\/([^/]+)/);
  const segment = m ? m[1] : null;
  return segment ? (SEGMENT_TO_ROUTE_KEY[segment] ?? segment) : null;
}

function getFallbackBranchRoute(role: string): string {
  for (const routeKey of BRANCH_FALLBACK_ORDER) {
    const roles = BRANCH_ROUTE_PERMISSIONS[routeKey];
    if (roles?.includes(role)) return routeKey;
  }
  return 'overview';
}

/** Resolve branch sub-route: if role not allowed for current route but has branch membership, redirect to first allowed route. Returns true if redirected. */
function resolveBranchFallbackRoute(
  path: string,
  effectiveRole: string | null,
  accessibleBranchIds: string[] | undefined,
  router: { replace: (u: string) => void }
): boolean {
  if (!effectiveRole || !accessibleBranchIds?.length) return false;
  const branchMatch = path.match(/^\/org\/([^/]+)\/branch\/([^/]+)\/([^/]+)/);
  if (!branchMatch) return false;
  const [, orgId, pathBranchId, segment] = branchMatch;
  if (!orgId || !pathBranchId) return false;
  const hasMembership = accessibleBranchIds.includes(pathBranchId);
  if (!hasMembership) return false;

  const routeKey = getBranchRouteKey(path);
  const allowedRoles = routeKey ? BRANCH_ROUTE_PERMISSIONS[routeKey] : null;
  const roleAllowed = allowedRoles?.includes(effectiveRole);
  if (roleAllowed) return false;

  const fallbackRoute = getFallbackBranchRoute(effectiveRole);
  const target = `/org/${orgId}/branch/${pathBranchId}/${fallbackRoute}`;
  devLog('[RBAC RESOLUTION]', {
    role: effectiveRole,
    currentRoute: routeKey ?? segment,
    fallbackRoute,
    hasMembership,
  });
  router.replace(target);
  return true;
}

/** Redirect branch role off company overview. Only redirects when branchId is resolved; otherwise returns false so caller doesn't show Access Denied. */
function redirectBranchRoleOffOrgOverview(
  path: string,
  permissions: { organizationId?: string; branchIds?: string[]; role?: string },
  accessibleBranchIds: string[] | undefined,
  effectiveRole: string | null,
  router: { replace: (u: string) => void }
): boolean {
  const orgId = path.match(/^\/org\/([^/]+)/)?.[1];
  if (!orgId) return false;
  const perms: UserPermissions = {
    ...permissions,
    role: (effectiveRole || '') as UserRole | '',
    organizationId: permissions.organizationId ?? '',
    branchIds: permissions.branchIds ?? [],
    email: (permissions as UserPermissions).email ?? '',
  };
  const branches = getAccessibleBranches(perms).filter(
    (b) => b.businessGroupId === orgId
  );
  const branchId =
    accessibleBranchIds?.find((id) => branches.some((b) => b.id === id)) ?? branches[0]?.id ?? accessibleBranchIds?.[0];
  if (branchId) {
    router.replace(`/org/${orgId}/branch/${branchId}/overview`);
    return true;
  }
  return false;
}

/** Branch role on a branch sub-route they're not allowed for (e.g. /log as staff): redirect to branch overview. Do NOT show Access Denied. */
function redirectBranchRoleToBranchOverview(
  path: string,
  accessibleBranchIds: string[] | undefined,
  router: { replace: (u: string) => void }
): boolean {
  const branchMatch = path.match(/^\/org\/([^/]+)\/branch\/([^/]+)/);
  if (!branchMatch) return false;
  const [, orgId, pathBranchId] = branchMatch;
  if (!orgId || !pathBranchId || !accessibleBranchIds?.length) return false;
  const hasAccessToThisBranch = accessibleBranchIds.includes(pathBranchId);
  if (!hasAccessToThisBranch) return false;
  router.replace(`/org/${orgId}/branch/${pathBranchId}/overview`);
  return true;
}

type RoutePermission = {
  allowedRoles: Array<RbacRole>;
  requiresOrganization?: boolean;
  requiresBranch?: boolean;
};

/** Company overview + trends: ORG_ROLES only (owner, admin). Viewer is branch-only. */
const COMPANY_PERMISSION: RoutePermission = {
  allowedRoles: [...ORG_ROLES],
  requiresOrganization: true,
};
const COMPANY_SETTINGS_PERMISSION: RoutePermission = {
  allowedRoles: ['owner', 'admin'],
  requiresOrganization: true,
};
/** Branch dashboard, reports, metrics, alerts, trends: BRANCH_READ_ROLES (manager, staff). */
const BRANCH_PERMISSION: RoutePermission = {
  allowedRoles: [...BRANCH_READ_ROLES],
  requiresBranch: true,
};
const BRANCH_LOG_PERMISSION: RoutePermission = {
  allowedRoles: [...BRANCH_WRITE_ROLES],
  requiresBranch: true,
};
const BRANCH_SETTINGS_PERMISSION: RoutePermission = {
  allowedRoles: [...BRANCH_SETTINGS_ROLES],
  requiresBranch: true,
};

const LEGACY_ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/group/settings': COMPANY_SETTINGS_PERMISSION,
  '/group/overview': COMPANY_PERMISSION,
  '/group/alerts': COMPANY_PERMISSION,
  '/group/trends': COMPANY_PERMISSION,
  '/branch/settings': BRANCH_SETTINGS_PERMISSION,
  '/branch/log-today': BRANCH_LOG_PERMISSION,
  '/branch/overview': BRANCH_PERMISSION,
  '/branch/alerts': BRANCH_PERMISSION,
  '/branch/trends': BRANCH_PERMISSION,
};

function getPermission(pathname: string | null): RoutePermission | null {
  if (!pathname) return null;
  const legacy = Object.keys(LEGACY_ROUTE_PERMISSIONS).find((k) => pathname.startsWith(k));
  if (legacy) return LEGACY_ROUTE_PERMISSIONS[legacy];
  if (/^\/org\/[^/]+\/branch\/[^/]+\/log(\/|$)/.test(pathname)) return BRANCH_LOG_PERMISSION;
  if (/^\/org\/[^/]+\/branch\/[^/]+\/settings(\/|$)/.test(pathname)) return BRANCH_SETTINGS_PERMISSION;
  if (/^\/org\/[^/]+\/branch\//.test(pathname)) return BRANCH_PERMISSION;
  if (/^\/org\/[^/]+\/settings(\/|$)/.test(pathname)) return COMPANY_SETTINGS_PERMISSION;
  if (/^\/org\/[^/]+\/trends(\/|$)/.test(pathname)) return COMPANY_PERMISSION;
  if (/^\/org\/[^/]+\/overview(\/|)$/.test(pathname)) return COMPANY_PERMISSION;
  if (/^\/org\/[^/]+(\/|)$/.test(pathname)) return COMPANY_PERMISSION;
  return null;
}

export function useRouteGuard(): { isReady: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { role, isLoading: roleLoading } = useUserRole();
  const { isLoggedIn, permissions } = useUserSession();
  const { activeOrganizationId, isInitialized: orgInitialized, isLoading: orgLoading } = useOrganization();

  const isReady = useRbacReady();

  useEffect(() => {
    if (!isLoggedIn || roleLoading || !role) return;
    if (role.isSuperAdmin) return;

    const sessionLoaded = isLoggedIn;
    const orgLoaded = Boolean(orgInitialized && !orgLoading);
    const roleResolved = !roleLoading && role != null;
    const isCompanyRole = role.effectiveRole === 'owner' || role.effectiveRole === 'admin';
    const branchContextResolved = isCompanyRole || role.accessibleBranchIds !== undefined;
    const guardReady = sessionLoaded && orgLoaded && roleResolved && branchContextResolved;

    if (!guardReady) return;

    const path = pathname || '';
    const permission = getPermission(path);
    if (!permission) return;

    const branchLoaded = role.accessibleBranchIds !== undefined;
    devLog('[RBAC DEBUG]', {
      sessionLoaded,
      orgLoaded,
      branchLoaded,
      role: role.effectiveRole,
      currentPath: path,
    });

    const resolvedOrgId = role.organizationId ?? activeOrganizationId ?? null;
    const result = validateRouteAccess((role.effectiveRole ?? 'staff') as RbacRole, path, {
      organizationId: resolvedOrgId,
      accessibleBranchIds: role.accessibleBranchIds,
      isSuperAdmin: role.isSuperAdmin,
      sessionReady: sessionLoaded,
      organizationReady: orgLoaded,
      branchReady: isCompanyRole || branchLoaded,
    });

    if (result.pending) return;

    const { allowedRoles, requiresOrganization, requiresBranch } = permission;

    if (role.effectiveRole == null || !allowedRoles.includes(role.effectiveRole)) {
      const orgSettingsMatch = path.match(/^\/org\/([^/]+)\/settings/);
      const branchSettingsMatch = path.match(/^\/org\/([^/]+)\/branch\/([^/]+)\/settings/);
      if (permission === COMPANY_SETTINGS_PERMISSION && orgSettingsMatch) {
        const orgId = orgSettingsMatch[1];
        router.replace(`/org/${orgId}/overview?access_denied=company_settings`);
      } else if (permission === BRANCH_SETTINGS_PERMISSION && branchSettingsMatch) {
        const [, orgId, branchId] = branchSettingsMatch;
        if (orgId && branchId) router.replace(`/org/${orgId}/branch/${branchId}/overview`);
      } else if (permission === COMPANY_PERMISSION && isBranchRole(role.effectiveRole)) {
        const didRedirect = redirectBranchRoleOffOrgOverview(path, permissions, role.accessibleBranchIds, role.effectiveRole, router);
        if (!didRedirect) return;
      } else if (isBranchRole(role.effectiveRole) && /^\/org\/[^/]+\/branch\/[^/]+/.test(path)) {
        const didRedirect =
          resolveBranchFallbackRoute(path, role.effectiveRole, role.accessibleBranchIds, router) ||
          redirectBranchRoleToBranchOverview(path, role.accessibleBranchIds, router);
        if (!didRedirect) router.push(`/unauthorized?from=${encodeURIComponent(path)}`);
      } else {
        router.push(`/unauthorized?from=${encodeURIComponent(path)}`);
      }
      return;
    }

    if (requiresOrganization && !role.organizationId && !isCompanyRole) {
      const orgId = role.organizationId;
      const firstBranch = role.accessibleBranchIds?.[0];
      if (orgId && firstBranch) router.push(`/org/${orgId}/branch/${firstBranch}/overview`);
      else router.push('/no-access');
      return;
    }

    if (requiresBranch && (role.accessibleBranchIds?.length ?? 0) === 0 && !isCompanyRole) {
      router.push('/no-access?reason=branch');
      return;
    }

    if (!result.allowed) {
      const orgSettingsMatch = path.match(/^\/org\/([^/]+)\/settings/);
      const branchSettingsMatch = path.match(/^\/org\/([^/]+)\/branch\/([^/]+)\/settings/);
      if (result.violationCode === 'ROUTE_COMPANY_SETTINGS' && orgSettingsMatch) {
        const orgId = orgSettingsMatch[1];
        router.replace(`/org/${orgId}/overview?access_denied=company_settings`);
      } else if (result.violationCode === 'ROUTE_BRANCH_SETTINGS' && branchSettingsMatch) {
        const [, orgId, branchId] = branchSettingsMatch;
        if (orgId && branchId) router.replace(`/org/${orgId}/branch/${branchId}/overview`);
      } else if (
        (result.violationCode === 'ROUTE_COMPANY_OVERVIEW' && isBranchRole(role.effectiveRole)) ||
        result.redirectToBranch
      ) {
        const didRedirect = redirectBranchRoleOffOrgOverview(path, permissions, role.accessibleBranchIds, role.effectiveRole, router);
        if (!didRedirect) return;
      } else if (isBranchRole(role.effectiveRole) && /^\/org\/[^/]+\/branch\/[^/]+/.test(path)) {
        const didRedirect =
          resolveBranchFallbackRoute(path, role.effectiveRole, role.accessibleBranchIds, router) ||
          redirectBranchRoleToBranchOverview(path, role.accessibleBranchIds, router);
        if (!didRedirect) router.push(`/unauthorized?from=${encodeURIComponent(path)}`);
      } else {
        router.push(`/unauthorized?from=${encodeURIComponent(path)}`);
      }
    }
  }, [pathname, role, roleLoading, isLoggedIn, activeOrganizationId, orgInitialized, orgLoading, permissions, router]);

  return { isReady };
}
