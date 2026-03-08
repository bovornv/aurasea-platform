/**
 * Global Header Component
 *
 * Hierarchy: AuraSea → [Company selector] → [Branch / Page]
 * Language is per-user preference; visible to all authenticated users.
 */
'use client';

import { usePathname, useParams } from 'next/navigation';
import { useI18n } from '../../hooks/use-i18n';
import { useUserSession } from '../../contexts/user-session-context';
import { businessGroupService } from '../../services/business-group-service';
import { getAccessibleBranches } from '../../services/permissions-service';
import { ViewSwitcherDropdown } from './view-switcher-dropdown';
import { UserMenuButton } from './user-menu-button';
import { LanguageSwitcher } from '../language-switcher';
import { useMemo } from 'react';

const PAGE_LABELS: Record<string, { en: string; th: string }> = {
  overview: { en: 'Operating Status', th: 'สถานะธุรกิจ' },
  log: { en: 'Log Today', th: 'บันทึกวันนี้' },
  alerts: { en: 'Alerts', th: 'การแจ้งเตือน' },
  trends: { en: 'Trends', th: 'เทรนด์' },
  settings: { en: 'Settings', th: 'การตั้งค่า' },
};

function useHeaderContext() {
  const pathname = usePathname() || '';
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchId = params?.branchId as string | undefined;
  const { locale } = useI18n();
  const { permissions } = useUserSession();

  return useMemo(() => {
    const isCompanyOverview = pathname === `/org/${orgId}/overview` || pathname === `/org/${orgId}`;
    if (isCompanyOverview) {
      return locale === 'th' ? 'ภาพรวมองค์กร' : 'Company Overview';
    }
    const branches = orgId && permissions
      ? getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId)
      : [];
    const branch = branchId ? branches.find((b) => b.id === branchId) ?? businessGroupService.getCurrentBranch()
      : null;
    const branchName = branch?.branchName ?? '';
    const segment = pathname.split('/').filter(Boolean).pop() || 'overview';
    const pageLabel = PAGE_LABELS[segment]?.[locale === 'th' ? 'th' : 'en'] ?? segment;
    if (!branchName) return pageLabel;
    return `${branchName} / ${pageLabel}`;
  }, [pathname, orgId, branchId, locale, permissions]);
}

export function GlobalHeader() {
  const contextLine = useHeaderContext();

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
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#6B7280',
          letterSpacing: '-0.01em',
        }}>
          AuraSea
        </div>
        <ViewSwitcherDropdown />
        <div style={{
          fontSize: '13px',
          color: '#9CA3AF',
          marginTop: '0.125rem',
        }}>
          {contextLine}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 101 }}>
        <LanguageSwitcher />
        <UserMenuButton />
      </div>
    </div>
  );
}
