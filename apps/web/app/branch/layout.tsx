/**
 * Legacy /branch/* — redirect to /org/[orgId]/branch/[branchId]/*. Deprecated.
 */
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';

const BRANCH_TO_PATH: Record<string, string> = {
  overview: 'overview',
  'log-today': 'log',
  alerts: 'overview',
  trends: 'trends',
  scenario: 'overview',
  settings: 'settings',
};

export default function BranchLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, permissions } = useUserSession();

  useEffect(() => {
    if (!isLoggedIn || !pathname?.startsWith('/branch')) return;
    const group = businessGroupService.getBusinessGroup();
    const orgId = permissions.organizationId || group?.id;
    if (!orgId) return;
    const branches = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
    if (branches.length === 0) {
      router.replace('/no-access?reason=branch');
      return;
    }
    const branchId = businessGroupService.getCurrentBranchId();
    const validId = branchId && branches.some((b) => b.id === branchId) ? branchId : branches[0].id;
    const segment = pathname.replace(/^\/branch\/?/, '').split('/')[0] || 'overview';
    const path = BRANCH_TO_PATH[segment] ?? 'overview';
    router.replace(`/org/${orgId}/branch/${validId}/${path}`);
  }, [isLoggedIn, pathname, permissions, router]);

  return null;
}
