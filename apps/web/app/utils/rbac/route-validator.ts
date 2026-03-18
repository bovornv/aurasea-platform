/**
 * Route access validator for RBAC.
 * validateRouteAccess(userRole, pathname, context) → { allowed, reason }.
 *
 * Redirect priority (strict order; stop at first match):
 * 1. User null or not authenticated → "/login". STOP. Do NOT redirect to /unauthorized.
 * 2. Path starts with "/org" AND no active organization → "/no-access" (do NOT redirect to login; auth state separate).
 * 3. User authenticated, active org exists, but role does not allow access → "/unauthorized".
 */

import { devWarn } from '../../lib/dev-log';

/** Public routes that do not require authentication. */
const PUBLIC_PATHS = ['/login'];

export type RouteRedirectTarget = '/login' | '/no-access' | '/unauthorized' | null;

/**
 * Returns redirect target for route guard. Checks in strict order:
 * 1. !isAuthenticated → "/login" (STOP).
 * 2. path starts with "/org" and !hasActiveOrganization → "/no-access" (session valid; permission failure only).
 * 3. !accessResult.allowed → "/unauthorized".
 * 4. Otherwise → null.
 */
export function getRouteRedirectTarget(
  isAuthenticated: boolean,
  pathname: string | null,
  hasActiveOrganization: boolean,
  accessResult: RouteAccessResult
): RouteRedirectTarget {
  if (!isAuthenticated) return '/login';
  if (pathname != null && pathname.startsWith('/org') && !hasActiveOrganization) return '/no-access';
  if (accessResult.pending) return null;
  if (!accessResult.allowed) return '/unauthorized';
  return null;
}

/**
 * Returns true if pathname is public (no auth required).
 */
export function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}?`));
}

import type { RbacRole } from './permission-matrix';
import {
  BRANCH_READ_ROLES,
  BRANCH_SETTINGS_ROLES,
  canAccessCompanySettings,
  canLogData,
  canViewCompanyOverview,
} from './permission-matrix';

/** Branch path segments that are read-only (dashboard, overview, metrics, reports, trends, alerts). Viewer allowed. */
const BRANCH_READ_SEGMENTS = ['overview', 'metrics', 'reports', 'trends', 'alerts'];

function isBranchReadRoute(pathname: string, pathBranchId: string | null): boolean {
  if (!pathBranchId) return false;
  const match = pathname.match(/^\/org\/[^/]+\/branch\/[^/]+\/([^/]+)/);
  const segment = match?.[1] ?? '';
  return segment === '' || BRANCH_READ_SEGMENTS.includes(segment);
}
import { logRbacAudit } from '../rbac-audit';

export interface RouteAccessContext {
  organizationId: string | null;
  accessibleBranchIds: string[];
  isSuperAdmin?: boolean;
  /** Live membership data: organization_members.organization_id[]. Validate against this only; no localStorage. */
  memberOrganizationIds?: string[];
  /** If false, do not validate; return { allowed: true, pending: true } to avoid Access Denied before context is ready. */
  sessionReady?: boolean;
  organizationReady?: boolean;
  /** For branch roles, must be true before validating; otherwise return pending. */
  branchReady?: boolean;
}

export interface RouteAccessResult {
  allowed: boolean;
  reason?: string;
  violationCode?: string;
  /** When allowed is false and route org is not in memberOrganizationIds, redirect to this org (memberships[0]). */
  redirectToOrgId?: string;
  /** When allowed is false and role is manager/staff on company overview; caller should redirect to branch (no violation log). */
  redirectToBranch?: boolean;
  /** True when context was not ready; caller must not redirect or show Access Denied. */
  pending?: boolean;
}

const BRANCH_ROLES = ['manager', 'staff'] as const;
function isBranchRole(role: RbacRole): boolean {
  return (BRANCH_ROLES as readonly string[]).includes(role);
}

/**
 * Validates if the current user role is allowed to access the given pathname.
 * Call only when the user is authenticated. Returns { allowed: false, reason } when the user
 * lacks permission; caller should redirect to /unauthorized. Never redirect unauthenticated users to /unauthorized.
 */
export function validateRouteAccess(
  userRole: RbacRole,
  pathname: string | null,
  context?: RouteAccessContext | null
): RouteAccessResult {
  if (!pathname) return { allowed: true };
  if (context?.isSuperAdmin === true) return { allowed: true };

  // Do not validate until context is fully loaded; avoid Access Denied flash or stuck state.
  if (userRole == null || userRole === undefined) return { allowed: true, pending: true };
  if (context?.sessionReady === false) return { allowed: true, pending: true };
  if (context?.organizationReady === false) return { allowed: true, pending: true };
  if (isBranchRole(userRole) && context?.branchReady === false) return { allowed: true, pending: true };

  const orgSettingsMatch = pathname.match(/^\/org\/([^/]+)\/settings(\/|$)/);
  const orgOverviewMatch = pathname.match(/^\/org\/([^/]+)(\/|$)/);
  const orgTrendsMatch = pathname.match(/^\/org\/([^/]+)\/trends(\/|$)/);
  const branchLogMatch = pathname.match(/^\/org\/([^/]+)\/branch\/([^/]+)\/log(\/|$)/);
  const branchSettingsMatch = pathname.match(/^\/org\/([^/]+)\/branch\/([^/]+)\/settings(\/|$)/);
  const branchMatch = pathname.match(/^\/org\/([^/]+)\/branch\/([^/]+)/);

  const pathOrgId = orgSettingsMatch?.[1] ?? orgOverviewMatch?.[1] ?? orgTrendsMatch?.[1] ?? branchLogMatch?.[1] ?? branchSettingsMatch?.[1] ?? branchMatch?.[1] ?? null;
  const pathBranchId = branchLogMatch?.[2] ?? branchSettingsMatch?.[2] ?? branchMatch?.[2] ?? null;

  const isCompanyRole = userRole === 'owner' || userRole === 'admin'; // ORG_ROLES

  const memberOrgIds = context?.memberOrganizationIds ?? null;
  const validateAgainstMemberships = Array.isArray(memberOrgIds) && memberOrgIds.length > 0;
  const pathOrgNotInMemberships =
    pathOrgId != null && validateAgainstMemberships && !memberOrgIds.includes(pathOrgId);
  const redirectToOrgId = pathOrgNotInMemberships && memberOrgIds.length > 0 ? memberOrgIds[0] : undefined;
  const orgMismatch = validateAgainstMemberships
    ? pathOrgNotInMemberships
    : (context?.organizationId != null && pathOrgId != null && pathOrgId !== context.organizationId);

  // Company-level org settings: owner and admin (ROUTE_COMPANY_SETTINGS). Billing/delete org remain owner-only in UI.
  if (orgSettingsMatch) {
    if (!canAccessCompanySettings(userRole)) {
      const reason = `Role ${userRole} cannot access company settings`;
      logRouteViolation('ROUTE_COMPANY_SETTINGS', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_COMPANY_SETTINGS' };
    }
    if (orgMismatch) {
      const reason = 'User does not belong to this organization';
      logRouteViolation('ROUTE_ORG_MISMATCH', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_ORG_MISMATCH', redirectToOrgId };
    }
  }

  // Company overview: branch roles (manager, staff) → redirect to branch overview; intentional, not a denial.
  const isCompanyOverviewRoute =
    orgOverviewMatch && !pathBranchId && !pathname.includes('/settings');
  if (isCompanyOverviewRoute && isBranchRole(userRole)) {
    return {
      allowed: false,
      reason: 'Branch role: redirect to branch overview',
      violationCode: 'ROUTE_COMPANY_OVERVIEW',
      redirectToBranch: true,
    };
  }
  if (orgOverviewMatch && !pathBranchId && !pathname.includes('/settings')) {
    if (!canViewCompanyOverview(userRole)) {
      const reason = `Role ${userRole} cannot access company overview`;
      logRouteViolation('ROUTE_COMPANY_OVERVIEW', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_COMPANY_OVERVIEW' };
    }
    if (orgMismatch) {
      const reason = 'User does not belong to this organization';
      logRouteViolation('ROUTE_ORG_MISMATCH', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_ORG_MISMATCH', redirectToOrgId };
    }
  }

  // Company trends: ORG_ROLES only (owner, admin)
  if (orgTrendsMatch) {
    if (!canViewCompanyOverview(userRole)) {
      const reason = `Role ${userRole} cannot access trends`;
      logRouteViolation('ROUTE_TRENDS', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_TRENDS' };
    }
    if (orgMismatch) {
      const reason = 'User does not belong to this organization';
      logRouteViolation('ROUTE_ORG_MISMATCH', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_ORG_MISMATCH', redirectToOrgId };
    }
  }

  // Branch log: manager, staff (no view-only role)
  if (branchLogMatch) {
    if (!canLogData(userRole)) {
      const reason = `Role ${userRole} cannot access Log Today`;
      logRouteViolation('ROUTE_LOG', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_LOG' };
    }
    if (!isCompanyRole && context && pathBranchId && context.accessibleBranchIds.length > 0 && !context.accessibleBranchIds.includes(pathBranchId)) {
      const reason = 'User does not have access to this branch';
      logRouteViolation('ROUTE_BRANCH_ACCESS', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_BRANCH_ACCESS' };
    }
  }

  // Branch settings: BRANCH_SETTINGS_ROLES only (owner, admin, manager). Block staff.
  if (branchSettingsMatch) {
    const branchSettingsAllowed = (BRANCH_SETTINGS_ROLES as readonly string[]).includes(userRole);
    if (!branchSettingsAllowed) {
      const reason = `Role ${userRole} cannot access branch settings (owner, admin, manager only)`;
      logRouteViolation('ROUTE_BRANCH_SETTINGS', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_BRANCH_SETTINGS' };
    }
    if (!isCompanyRole && context && pathBranchId && context.accessibleBranchIds.length > 0 && !context.accessibleBranchIds.includes(pathBranchId)) {
      const reason = 'User does not have access to this branch';
      logRouteViolation('ROUTE_BRANCH_ACCESS', userRole, pathname, reason);
      return { allowed: false, reason, violationCode: 'ROUTE_BRANCH_ACCESS' };
    }
  }

  // Branch READ routes (dashboard, overview, metrics, reports, trends, alerts): BRANCH_READ_ROLES (manager, staff)
  if (
    branchMatch &&
    pathBranchId &&
    isBranchReadRoute(pathname, pathBranchId) &&
    (BRANCH_READ_ROLES as readonly string[]).includes(userRole) &&
    context?.accessibleBranchIds?.includes(pathBranchId)
  ) {
    return { allowed: true };
  }

  // Any branch route: must be allowed to access this branch (owner/admin = org-level can access any branch)
  if (!isCompanyRole && branchMatch && context && pathBranchId && context.accessibleBranchIds.length > 0 && !context.accessibleBranchIds.includes(pathBranchId)) {
    const reason = 'User does not have access to this branch';
    logRouteViolation('ROUTE_BRANCH_ACCESS', userRole, pathname, reason);
    return { allowed: false, reason, violationCode: 'ROUTE_BRANCH_ACCESS' };
  }

  // Org mismatch for any /org/:id route (validated against live memberOrganizationIds when provided)
  if (orgMismatch) {
    const reason = 'User does not belong to this organization';
    logRouteViolation('ROUTE_ORG_MISMATCH', userRole, pathname, reason);
    return { allowed: false, reason, violationCode: 'ROUTE_ORG_MISMATCH', redirectToOrgId };
  }

  return { allowed: true };
}

function logRouteViolation(code: string, role: RbacRole, pathname: string, reason: string): void {
  if (typeof window === 'undefined') return;
  devWarn(`[RBAC_ROUTE_VIOLATION] ${code} role=${role} path=${pathname} reason=${reason}`);
  logRbacAudit('permission_denied', 'route', null, { path: pathname, role, reason, code }).catch(() => {});
}
