/**
 * Breadcrumb derived from URL: org name + optional branch name + current page.
 * Company: "Org Name > Overview"
 * Branch: "Org Name > Branch Name > Overview"
 */
'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { businessGroupService } from '../services/business-group-service';
import { useUserSession } from '../contexts/user-session-context';

const PAGE_LABELS: Record<string, { en: string; th: string }> = {
  overview: { en: 'Overview', th: 'ภาพรวม' },
  alerts: { en: 'Alerts', th: 'การแจ้งเตือน' },
  trends: { en: 'Trends', th: 'เทรนด์' },
  settings: { en: 'Settings', th: 'การตั้งค่า' },
  log: { en: 'Log Today', th: 'บันทึกวันนี้' },
};

export function Breadcrumb() {
  const params = useParams();
  const pathname = usePathname() || '';
  const orgId = params?.orgId as string | undefined;
  const branchId = params?.branchId as string | undefined;
  const { permissions } = useUserSession();
  const isBranchLevelUser = ['manager', 'staff', 'viewer'].includes(permissions.role);

  const { items } = useMemo(() => {
    if (!pathname.startsWith('/org/') || !orgId) return { items: [] };

    const group = businessGroupService.getBusinessGroup();
    const orgName = group?.id === orgId ? group.name : 'Organization';

    const segment = pathname.split('/').filter(Boolean);
    const last = segment[segment.length - 1] || 'overview';
    const pageLabel = PAGE_LABELS[last]?.en ?? last;

    if (branchId) {
      const branches = businessGroupService.getAllBranches().filter(
        (b) => b.businessGroupId === orgId
      );
      const branch = branches.find((b) => b.id === branchId);
      const branchName = branch?.branchName ?? 'Branch';
      if (isBranchLevelUser) {
        return {
          items: [
            { label: branchName, href: `/org/${orgId}/branch/${branchId}/overview` },
            { label: pageLabel, href: '' },
          ],
        };
      }
      return {
        items: [
          { label: orgName, href: `/org/${orgId}/overview` },
          { label: branchName, href: `/org/${orgId}/branch/${branchId}/overview` },
          { label: pageLabel, href: '' },
        ],
      };
    }

    if (isBranchLevelUser) return { items: [] };
    return {
      items: [
        { label: orgName, href: `/org/${orgId}/overview` },
        { label: pageLabel, href: '' },
      ],
    };
  }, [pathname, orgId, branchId, isBranchLevelUser]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        fontSize: '13px',
        color: '#6b7280',
        marginBottom: '0.5rem',
      }}
    >
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: '0 0.35rem' }}>/</span>}
          {item.href ? (
            <Link
              href={item.href}
              style={{ color: '#6b7280', textDecoration: 'none' }}
            >
              {item.label}
            </Link>
          ) : (
            <span style={{ color: '#0a0a0a', fontWeight: 500 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
