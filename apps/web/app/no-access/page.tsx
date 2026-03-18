/**
 * Shown when user has valid session but no organization or no branch assigned.
 * Do NOT redirect to /login — auth state is separate from permission state.
 * Fallback: if branch role (manager/staff) with orgId + branchId, redirect to branch overview to prevent deadlock.
 */
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageLayout } from '../components/page-layout';
import { useI18n } from '../hooks/use-i18n';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';

const BRANCH_ROLES = ['manager', 'staff'];

function NoAccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { isLoggedIn, logout, permissions } = useUserSession();
  const { role, isLoading } = useUserRole();
  const reason = searchParams.get('reason') || 'org'; // 'org' | 'branch'

  // Fallback: branch role with orgId + branchId → redirect to branch overview (only when session + orgId + branchId ready).
  useEffect(() => {
    if (!isLoggedIn || isLoading || !role?.effectiveRole || reason !== 'branch') return;
    if (!BRANCH_ROLES.includes(role.effectiveRole ?? '')) return;
    const orgId = role.organizationId ?? permissions?.organizationId ?? null;
    const branchId = role.accessibleBranchIds?.[0] ?? null;
    if (!orgId || !branchId) return;
    router.replace(`/org/${orgId}/branch/${branchId}/overview`);
  }, [isLoggedIn, isLoading, role, permissions, reason, router]);

  const isBranch = reason === 'branch';
  const title = isBranch
    ? (locale === 'th' ? 'ยังไม่ได้กำหนดสาขา' : 'No branch assigned')
    : (locale === 'th' ? 'ยังไม่ได้กำหนดองค์กร' : 'No organization assigned');
  const message = isBranch
    ? (locale === 'th'
        ? 'คุณยังไม่มีสาขาที่กำหนดให้ กรุณาติดต่อผู้ดูแลองค์กร'
        : "You don't have a branch assigned yet. Contact your organization owner.")
    : (locale === 'th'
        ? 'คุณยังไม่มีองค์กรที่กำหนดให้ กรุณาติดต่อผู้ดูแลระบบ'
        : "You don't have an organization assigned yet. Contact your administrator.");

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <PageLayout title={title} subtitle="">
      <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '420px', margin: '0 auto' }}>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {locale === 'th' ? 'ออกจากระบบ' : 'Sign out'}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.replace('/login')}
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
            {locale === 'th' ? 'กลับไปหน้าเข้าสู่ระบบ' : 'Back to login'}
          </button>
        </div>
      </div>
    </PageLayout>
  );
}

export default function NoAccessPage() {
  return (
    <Suspense fallback={<PageLayout title="">Loading…</PageLayout>}>
      <NoAccessContent />
    </Suspense>
  );
}
