/**
 * Global Header Component
 *
 * Hierarchy: AuraSea › Company › Branch (breadcrumb) + [Company selector]
 * Language is per-user preference; visible to all authenticated users.
 */
'use client';

import { useMemo } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { ViewSwitcherDropdown } from './view-switcher-dropdown';
import { UserMenuButton } from './user-menu-button';
import { LanguageSwitcher } from '../language-switcher';
import { useUserSession } from '../../contexts/user-session-context';
import { businessGroupService } from '../../services/business-group-service';
import { getAccessibleBranches } from '../../services/permissions-service';

function useHierarchyBreadcrumb() {
  const pathname = usePathname() || '';
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchId = params?.branchId as string | undefined;
  const { permissions } = useUserSession();

  return useMemo(() => {
    if (!pathname.startsWith('/org/') || !orgId) return null;
    const group = businessGroupService.getBusinessGroup();
    const companyName = group?.id === orgId ? group.name : 'Organization';
    const parts = ['AuraSea', companyName];
    if (branchId) {
      const branches = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
      const branch = branches.find((b) => b.id === branchId) ?? businessGroupService.getCurrentBranch();
      if (branch?.branchName) parts.push(branch.branchName);
    }
    return parts.join(' › ');
  }, [pathname, orgId, branchId, permissions]);
}

export function GlobalHeader() {
  const breadcrumb = useHierarchyBreadcrumb();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingBottom: '1rem',
      marginBottom: '1rem',
      borderBottom: '1px solid #e5e7eb',
      position: 'relative',
      zIndex: 100,
    }}>
      <div style={{ position: 'relative', zIndex: 101, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {breadcrumb && (
          <div style={{
            fontSize: '13px',
            color: '#9CA3AF',
            letterSpacing: '-0.01em',
          }}>
            {breadcrumb}
          </div>
        )}
        <ViewSwitcherDropdown />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 101 }}>
        <LanguageSwitcher />
        <UserMenuButton />
      </div>
    </div>
  );
}
