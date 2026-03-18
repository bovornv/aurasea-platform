/**
 * 403 Unauthorized / Forbidden
 * PART 2: Shown when user lacks permission for the requested resource.
 * Fallback: if user is manager/staff and has orgId + branchId, redirect to branch overview to prevent deadlock.
 */
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageLayout } from '../components/page-layout';
import { logRbacAudit } from '../utils/rbac-audit';
import { useOrgBranchPaths } from '../hooks/use-org-branch-paths';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { resolveFallbackRoute } from '../hooks/use-route-guard';

const BRANCH_ROLES = ['manager', 'staff'];

function UnauthorizedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '';
  const paths = useOrgBranchPaths();
  const { isLoggedIn, permissions } = useUserSession();
  const { role, isLoading } = useUserRole();

  // Fallback: prevent deadlock when RouteGuard sent branch role here. Redirect only when session + orgId + branchId ready.
  useEffect(() => {
    if (!isLoggedIn || isLoading || !role?.effectiveRole) return;
    if (!BRANCH_ROLES.includes(role.effectiveRole ?? '')) return;
    const orgId = role.organizationId ?? permissions?.organizationId ?? null;
    const branchId = role.accessibleBranchIds?.[0] ?? null;
    if (!orgId || !branchId) return;
    router.replace(`/org/${orgId}/branch/${branchId}/overview`);
  }, [isLoggedIn, isLoading, role, permissions, router]);

  useEffect(() => {
    if (from) {
      logRbacAudit('permission_denied', 'route', null, { path: from }).catch(() => {});
    }
  }, [from]);

  const dashboardHref = paths.companyOverview || paths.branchOverview || '/login';
  const orgId = role?.organizationId ?? permissions?.organizationId ?? null;
  const branchId = role?.accessibleBranchIds?.[0] ?? null;
  const effectiveRole = role?.effectiveRole ?? null;
  const branchDashboardHref =
    effectiveRole && orgId && branchId
      ? resolveFallbackRoute(effectiveRole, branchId, orgId)
      : null;

  return (
    <PageLayout title="Access denied" subtitle="You don't have permission to view this page.">
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '420px', margin: '0 auto' }}>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          Your role does not allow access to this section. Contact your organization owner if you need access.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          {branchDashboardHref && (
            <button
              type="button"
              onClick={() => router.replace(branchDashboardHref)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#0a0a0a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Go to my branch dashboard
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(from && from.startsWith('/') ? from : dashboardHref)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: branchDashboardHref ? 'transparent' : '#0a0a0a',
              color: branchDashboardHref ? '#374151' : '#fff',
              border: `1px solid ${branchDashboardHref ? '#d1d5db' : 'transparent'}`,
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Go to overview
          </button>
        </div>
      </div>
    </PageLayout>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<PageLayout title="">Loading…</PageLayout>}>
      <UnauthorizedContent />
    </Suspense>
  );
}
