/**
 * RBAC Permission Matrix
 * Single source of truth for what each role can do. Used by route guard, UI validator, and tests.
 * Do NOT modify alert or health engine logic.
 */

export type RbacRole = 'owner' | 'admin' | 'manager' | 'staff';

/** Org-level routes (overview, trends): owner, admin only. */
export const ORG_ROLES: readonly RbacRole[] = ['owner', 'admin'];

/** Branch read (dashboard, reports, metrics, alerts, trends): owner, admin, manager, staff. */
export const BRANCH_READ_ROLES: readonly RbacRole[] = ['owner', 'admin', 'manager', 'staff'];

/** Branch write (log today, etc.): owner, admin, manager, staff. No viewer. */
export const BRANCH_WRITE_ROLES: readonly RbacRole[] = ['owner', 'admin', 'manager', 'staff'];

/** Branch settings: owner, admin, manager only. */
export const BRANCH_SETTINGS_ROLES: readonly RbacRole[] = ['owner', 'admin', 'manager'];

export interface RolePermissionFlags {
  companySettings: boolean;
  deleteBranch: boolean;
  logData: boolean;
  inviteUsers: boolean;
  editBranchSettings: boolean;
  viewCompanyOverview: boolean;
}

export const ROLE_PERMISSIONS: Record<RbacRole, RolePermissionFlags> = {
  owner: {
    companySettings: true,
    deleteBranch: true,
    logData: true,
    inviteUsers: true,
    editBranchSettings: true,
    viewCompanyOverview: true,
  },
  admin: {
    companySettings: true, // can access company settings; cannot delete org, transfer ownership, or manage billing
    deleteBranch: false,
    logData: true,
    inviteUsers: true,
    editBranchSettings: true,
    viewCompanyOverview: true,
  },
  manager: {
    companySettings: false,
    deleteBranch: false,
    logData: true,
    inviteUsers: true,
    editBranchSettings: true,
    viewCompanyOverview: false,
  },
  staff: {
    companySettings: false,
    deleteBranch: false,
    logData: true,
    inviteUsers: false,
    editBranchSettings: false,
    viewCompanyOverview: false,
  },
};

export function getRolePermissions(role: RbacRole): RolePermissionFlags {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.staff;
}

export function canAccessCompanySettings(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.companySettings ?? false;
}

export function canDeleteBranch(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.deleteBranch ?? false;
}

export function canLogData(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.logData ?? false;
}

export function canInviteUsers(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.inviteUsers ?? false;
}

export function canEditBranchSettings(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.editBranchSettings ?? false;
}

export function canViewCompanyOverview(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.viewCompanyOverview ?? false;
}

/** Read-only access to trends (company overview). */
export function canViewTrends(role: RbacRole): boolean {
  return ROLE_PERMISSIONS[role]?.viewCompanyOverview ?? false;
}
