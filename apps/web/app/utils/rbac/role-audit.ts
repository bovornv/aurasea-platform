/**
 * Automated role audit: runRoleAudit(userId) iterates through roles (simulated), tests routes and API,
 * outputs pass/fail report. For use in dev or CI; does not modify alert or health engine.
 */

import type { RbacRole } from './permission-matrix';
import { validateRouteAccess } from './route-validator';
import { testRLSIsolationForBranch } from './rls-tester';
import { ROLE_PERMISSIONS } from './permission-matrix';

export type AuditReportEntry = {
  role: RbacRole;
  check: string;
  pass: boolean;
  detail?: string;
};

export interface RoleAuditReport {
  userId: string | null;
  entries: AuditReportEntry[];
  passed: number;
  failed: number;
}

const ROLES: RbacRole[] = ['owner', 'admin', 'manager', 'staff', 'viewer'];

const ROUTES_TO_TEST: { path: string; expectOwnerOnly?: boolean; expectNoViewer?: boolean; expectLog?: boolean }[] = [
  { path: '/org/org-a/settings', expectOwnerOnly: true },
  { path: '/org/org-a/overview' },
  { path: '/org/org-a/branch/br-1/log', expectNoViewer: true, expectLog: true },
  { path: '/org/org-a/branch/br-1/settings', expectNoViewer: true },
  { path: '/org/org-a/branch/br-1/overview' },
];

/**
 * Run route access validation for a given role and context; returns pass/fail for each route.
 */
function auditRoutesForRole(
  role: RbacRole,
  context: { organizationId: string; accessibleBranchIds: string[] }
): AuditReportEntry[] {
  const entries: AuditReportEntry[] = [];

  for (const { path, expectOwnerOnly, expectNoViewer, expectLog } of ROUTES_TO_TEST) {
    const result = validateRouteAccess(role, path, context);

    if (expectOwnerOnly) {
      const allowed = role === 'owner';
      entries.push({
        role,
        check: `Route ${path} (owner only)`,
        pass: result.allowed === allowed,
        detail: result.allowed ? 'allowed' : result.reason,
      });
      continue;
    }

    if (expectNoViewer && role === 'viewer') {
      entries.push({
        role,
        check: `Route ${path} (no viewer)`,
        pass: !result.allowed,
        detail: result.reason,
      });
      continue;
    }

    if (expectLog && role === 'viewer') {
      entries.push({
        role,
        check: `Route ${path} (log: no viewer)`,
        pass: !result.allowed,
        detail: result.reason,
      });
      continue;
    }

    // Default: owner/admin (org-level) can access org routes; branch roles need branch in context
    const hasBranchAccess = path.includes('/branch/')
      ? context.accessibleBranchIds.length > 0
      : true;
    const expected = hasBranchAccess;
    const isOrgLevel = role === 'owner' || role === 'admin';
    entries.push({
      role,
      check: `Route ${path}`,
      pass: result.allowed === expected || (result.allowed && isOrgLevel),
      detail: result.reason,
    });
  }

  return entries;
}

/**
 * Run permission matrix checks for each role (no network).
 */
function auditPermissionMatrix(): AuditReportEntry[] {
  const entries: AuditReportEntry[] = [];

  for (const role of ROLES) {
    const p = ROLE_PERMISSIONS[role];
    entries.push({
      role,
      check: 'companySettings',
      pass: p.companySettings === (role === 'owner'),
    });
    entries.push({
      role,
      check: 'deleteBranch',
      pass: p.deleteBranch === (role === 'owner'),
    });
    entries.push({
      role,
      check: 'logData',
      pass: p.logData === (role !== 'viewer'),
    });
  }

  return entries;
}

/**
 * Run full role audit: permission matrix, route validation per role, optional RLS test.
 * userId can be used later for actual API calls; for now we only simulate role context.
 */
export async function runRoleAudit(userId: string | null): Promise<RoleAuditReport> {
  const entries: AuditReportEntry[] = [];

  entries.push(...auditPermissionMatrix());

  const orgId = 'org-a';
  const allBranches = ['br-1', 'br-2'];
  const oneBranch = ['br-1'];

  for (const role of ROLES) {
    const isOrgLevel = role === 'owner' || role === 'admin';
    const context: { organizationId: string; accessibleBranchIds: string[] } = isOrgLevel
      ? { organizationId: orgId, accessibleBranchIds: allBranches }
      : { organizationId: orgId, accessibleBranchIds: oneBranch };

    entries.push(...auditRoutesForRole(role, context));
  }

  const passed = entries.filter((e) => e.pass).length;
  const failed = entries.filter((e) => !e.pass).length;

  if (process.env.NODE_ENV === 'development' && failed > 0) {
    console.warn('[RBAC_AUDIT] Failures:', entries.filter((e) => !e.pass));
  }

  return {
    userId,
    entries,
    passed,
    failed,
  };
}
