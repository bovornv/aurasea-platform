/**
 * Org layout: RBAC guard (user must belong to org), URL-derived.
 * Renders nav + breadcrumb (company view) + children.
 */
'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ORG_ROLES = ['owner', 'admin'] as const;

function isOrgRole(role: string | null | undefined): boolean {
  return role != null && (ORG_ROLES as readonly string[]).includes(role);
}
import { useUserSession } from '../../contexts/user-session-context';
import { useUserRole } from '../../contexts/user-role-context';
import { useRbacReady } from '../../hooks/use-route-guard';
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin';
import { businessGroupService } from '../../services/business-group-service';
import { getAccessibleBranches } from '../../services/permissions-service';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { BRANCH_SELECT } from '../../lib/db-selects';
import { Navigation } from '../../components/navigation';
import SimulationBannerWrapper from '../../components/simulation-banner-wrapper';
import { LoadingSpinner } from '../../components/loading-spinner';
import { useOrganization } from '../../contexts/organization-context';

function AccessResolutionRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        gap: '1rem',
        backgroundColor: '#f9fafb',
        padding: '2rem',
      }}
    >
      <p style={{ fontSize: '14px', color: '#374151', textAlign: 'center', maxWidth: '28rem' }}>{message}</p>
      <button
        type="button"
        onClick={() => onRetry()}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#111827',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        Retry
      </button>
    </div>
  );
}
import { PoweredByAuraSea } from '../../components/operating-layer/powered-by-aurasea';

const BUSINESS_GROUP_KEY = 'hospitality_business_group';

function FullScreenLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', gap: '1rem', backgroundColor: '#f9fafb' }}>
      <LoadingSpinner />
      <p style={{ fontSize: '14px', color: '#6b7280' }}>Loading...</p>
    </div>
  );
}

export default function OrgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const orgId = params?.orgId as string | undefined;
  const { isLoggedIn, permissions } = useUserSession();
  const { role, isLoading: roleLoading, error: roleError, refreshRole } = useUserRole();
  const {
    isInitialized: orgInitialized,
    isLoading: orgLoading,
    memberOrganizationIds,
    setActiveOrganizationId,
    activeOrganizationId,
  } = useOrganization();
  const { isSuperAdmin, loading: superAdminLoading } = usePlatformAdmin();
  const superAdminSyncDone = useRef(false);
  // Unified loading guard: isAppReady = sessionLoaded && organizationLoaded && branchResolved && roleResolved. Do not render AccessDenied/NoBranchAssigned/redirects until ready.
  const isAppReady = useRbacReady();

  // Align active org + session permissions with URL so RBAC never compares stale orgId to the path.
  useEffect(() => {
    if (!isLoggedIn || !orgId || !orgInitialized) return;
    if (!memberOrganizationIds.includes(orgId)) return;
    if (activeOrganizationId === orgId) return;
    void setActiveOrganizationId(orgId);
  }, [
    isLoggedIn,
    orgId,
    orgInitialized,
    memberOrganizationIds,
    activeOrganizationId,
    setActiveOrganizationId,
  ]);

  // Role-based redirect: do not send branch roles to org overview. Wait for organization, branch, role.
  useEffect(() => {
    if (!orgId || !role?.effectiveRole || !permissions) return;
    const onOrgOverviewPath = pathname === `/org/${orgId}` || pathname === `/org/${orgId}/` || pathname.startsWith(`/org/${orgId}/overview`);
    if (!onOrgOverviewPath) return;
    if (isOrgRole(role.effectiveRole)) return; // owner/admin allowed on org overview
    const branchesInOrg = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
    const branchId =
      role.accessibleBranchIds?.find((id) => branchesInOrg.some((b) => b.id === id)) ?? branchesInOrg[0]?.id;
    if (!branchId) return;
    router.replace(`/org/${orgId}/branch/${branchId}/overview`);
  }, [orgId, pathname, permissions, role, router]);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (superAdminLoading || roleLoading || !orgId || !permissions) return;
    if (!isAppReady) return;

    const runSuperAdminSync = async () => {
      if (!isSupabaseAvailable() || superAdminSyncDone.current) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', orgId)
        .maybeSingle();
      const org = orgRow as { id: string; name: string } | null;
      if (org) {
        try {
          localStorage.setItem(
            BUSINESS_GROUP_KEY,
            JSON.stringify({
              id: org.id,
              name: org.name,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          );
          await businessGroupService.syncBranchesFromSupabaseForOrg(orgId);
          superAdminSyncDone.current = true;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('organizationChanged'));
          }
        } catch (_) {}
      }
    };

    if (isSuperAdmin) runSuperAdminSync();

    const hasActiveOrg = Boolean(permissions.organizationId || role?.organizationId);
    if (!hasActiveOrg && !isSuperAdmin) {
      (async () => {
        if (!isSupabaseAvailable()) {
          router.replace('/no-access');
          return;
        }
        const supabase = getSupabaseClient();
        if (!supabase) {
          router.replace('/no-access');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }
        // 1) owner/admin → org overview (staff/viewer/manager must NOT go here)
        const { data: memberships } = await supabase
          .from('organization_members')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        const orgList = (memberships ?? []) as { organization_id: string; role: string }[];
        const ownerOrAdmin = orgList.find((r) => r.role === 'owner' || r.role === 'admin');
        if (ownerOrAdmin) {
          router.replace(`/org/${ownerOrAdmin.organization_id}/overview`);
          return;
        }
        // 2) manager/staff/viewer → branch overview (branchId loaded from branch_members)
        const { data: branchRows } = await supabase
          .from('branch_members')
          .select('branch_id, branches(organization_id)')
          .eq('user_id', user.id);
        if (branchRows?.length) {
          const row0 = branchRows[0] as {
            branch_id: string;
            branches: { organization_id: string } | null;
          };
          const firstBranchId = row0.branch_id;
          let resolvedOrgId = row0.branches?.organization_id ?? null;
          if (!resolvedOrgId) {
            const { data: branch } = await supabase
              .from('branches')
              .select(BRANCH_SELECT)
              .eq('id', firstBranchId)
              .maybeSingle();
            resolvedOrgId = (branch as { organization_id?: string } | null)?.organization_id ?? null;
          }
          if (resolvedOrgId) {
            router.replace(`/org/${resolvedOrgId}/branch/${firstBranchId}/overview`);
            return;
          }
        }
        console.warn('[OrgLayout] User has valid session but no org or branch membership');
        router.replace('/no-access');
      })();
      return;
    }

    const branchesInOrg = getAccessibleBranches(permissions).filter(
      (b) => b.businessGroupId === orgId
    );
    const group = businessGroupService.getBusinessGroup();
    const belongsToOrg =
      permissions.organizationId === orgId ||
      group?.id === orgId ||
      branchesInOrg.length > 0 ||
      (role?.organizationId === orgId && (role?.effectiveRole === 'owner' || role?.effectiveRole === 'admin'));

    if (!belongsToOrg && !isSuperAdmin) {
      router.replace('/unauthorized?from=org');
      return;
    }

    const isCompanyRole = permissions.role === 'owner' || permissions.role === 'admin' ||
      role?.effectiveRole === 'owner' || role?.effectiveRole === 'admin';
    if (!isSuperAdmin && !isCompanyRole) {
      const assignedBranchId = role?.accessibleBranchIds?.find((id) => {
        const b = getAccessibleBranches(permissions).find((x) => x.id === id);
        return b?.businessGroupId === orgId;
      });
      const firstBranchId = assignedBranchId ?? branchesInOrg[0]?.id;
      if (firstBranchId) {
        router.replace(`/org/${orgId}/branch/${firstBranchId}/overview`);
      } else {
        router.replace('/no-access?reason=branch');
      }
    }
  }, [isLoggedIn, orgId, permissions, role, roleLoading, router, isSuperAdmin, superAdminLoading, isAppReady]);


  if (!isLoggedIn) return null;
  if (superAdminLoading) return null;
  if (!orgId) return null;

  if (roleError && !roleLoading) {
    return (
      <AccessResolutionRetry
        message="Could not verify your access. Check your connection and try again."
        onRetry={() => void refreshRole()}
      />
    );
  }

  if (!isAppReady) {
    return <FullScreenLoader />;
  }

  const onOrgOverviewPath =
    pathname === `/org/${orgId}` ||
    pathname === `/org/${orgId}/` ||
    pathname.startsWith(`/org/${orgId}/overview`);
  const isBranchRoleOnOverview =
    onOrgOverviewPath &&
    role?.effectiveRole &&
    !isOrgRole(role.effectiveRole);
  const branchesInOrgForRedirect = permissions
    ? getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId)
    : [];
  const branchIdForRedirect =
    role?.accessibleBranchIds?.find((id) => branchesInOrgForRedirect.some((b) => b.id === id)) ??
    branchesInOrgForRedirect[0]?.id;
  // Do not render overview content for branch roles; redirect runs from useEffect. Prevents Access Denied flash.
  if (isBranchRoleOnOverview) {
    return null;
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem 2rem 2rem' }}>
        <SimulationBannerWrapper />
        <Navigation />
        {children}
      </div>
      <PoweredByAuraSea />
    </div>
  );
}
