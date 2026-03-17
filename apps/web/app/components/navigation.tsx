// Top menu derived from URL only: /org/[orgId]/* = company menu, /org/[orgId]/branch/[branchId]/* = branch menu.
'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useI18n } from '../hooks/use-i18n';
import { useUserSession } from '../contexts/user-session-context';
import { useRBAC } from '../hooks/use-rbac';
import { GlobalHeader } from './navigation/global-header';
import { useMemo } from 'react';

const LABELS: Record<string, { en: string; th: string }> = {
  overview: { en: 'Today', th: 'วันนี้' },
  alerts: { en: 'Alerts', th: 'การแจ้งเตือน' },
  trends: { en: 'Trends', th: 'เทรนด์' },
  settings: { en: 'Settings', th: 'การตั้งค่า' },
  log: { en: 'Enter Data', th: 'กรอกข้อมูล' },
};

export function Navigation() {
  const pathname = usePathname() || '';
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchId = params?.branchId as string | undefined;
  const { locale } = useI18n();
  const { isLoggedIn, permissions } = useUserSession();
  const { canAccessCompanySettings, canAccessBranchSettings, canLogData } = useRBAC();
  const canSeeCompanySettings = canAccessCompanySettings;

  const isOrgRoute = pathname?.startsWith('/org/');
  const isBranchView = Boolean(orgId && branchId);

  const navItems = useMemo(() => {
    if (!orgId) return [];
    if (isBranchView) {
      const items: Array<{ href: string; labelKey: keyof typeof LABELS }> = [
        { href: `/org/${orgId}/branch/${branchId}/overview`, labelKey: 'overview' },
        ...(canLogData ? [{ href: `/org/${orgId}/branch/${branchId}/log`, labelKey: 'log' as const }] : []),
        { href: `/org/${orgId}/branch/${branchId}/alerts`, labelKey: 'alerts' },
        { href: `/org/${orgId}/branch/${branchId}/trends`, labelKey: 'trends' },
      ];
      if (canAccessBranchSettings) {
        items.push({ href: `/org/${orgId}/branch/${branchId}/settings`, labelKey: 'settings' });
      }
      return items;
    }
    const items: Array<{ href: string; labelKey: keyof typeof LABELS }> = [
      { href: `/org/${orgId}/overview`, labelKey: 'overview' },
      { href: `/org/${orgId}/trends`, labelKey: 'trends' },
    ];
    if (canSeeCompanySettings) {
      items.push({ href: `/org/${orgId}/settings`, labelKey: 'settings' });
    }
    return items;
  }, [orgId, branchId, isBranchView, canSeeCompanySettings, canAccessBranchSettings, canLogData]);

  if (
    pathname === '/login' ||
    pathname === '/hospitality/setup' ||
    pathname === '/hospitality/data-entry' ||
    pathname === '/hospitality/data-entry-fnb' ||
    pathname === '/hospitality/data-history' ||
    pathname === '/hotel/update-operational-data' ||
    pathname === '/cafe/update-operational-data' ||
    pathname === '/update-data/cafe-restaurant' ||
    pathname === '/update-data/hotel-resort' ||
    pathname?.match(/^\/branch\/[^/]+\/metrics$/)
  ) {
    return null;
  }

  if (!isLoggedIn || !isOrgRoute || navItems.length === 0) {
    return null;
  }

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      style={{
        marginBottom: '0',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '1.25rem',
        paddingTop: '1.5rem',
        position: 'relative',
        zIndex: 1,
        backgroundColor: '#ffffff',
        marginTop: '0',
      }}
    >
      <GlobalHeader />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            position: 'relative',
            zIndex: 2,
            flex: 1,
            minWidth: 0,
          }}
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            const linkStyle = {
              color: isActive ? '#0a0a0a' : '#6b7280',
              fontWeight: isActive ? 500 : 400,
              fontSize: '14px',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
              paddingBottom: '1.25rem',
              marginBottom: '-1.25rem',
              borderBottom: isActive ? '2px solid #0a0a0a' : '2px solid transparent',
              position: 'relative' as const,
              outline: 'none',
              cursor: 'pointer',
              pointerEvents: 'auto' as const,
              zIndex: 1,
              isolation: 'isolate' as const,
            };

            const label = locale === 'th' ? LABELS[item.labelKey].th : LABELS[item.labelKey].en;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                style={linkStyle}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#374151';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#6b7280';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = '2px solid #3b82f6';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }} />
      </div>
    </nav>
  );
}
