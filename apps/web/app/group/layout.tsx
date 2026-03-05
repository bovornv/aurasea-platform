/**
 * Legacy /group/* — redirect to /org/[orgId]/*. Deprecated.
 */
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';

const GROUP_TO_ORG: Record<string, string> = {
  overview: 'overview',
  alerts: 'alerts',
  trends: 'trends',
  settings: 'settings',
};

export default function GroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, permissions, isSuperAdmin } = useUserSession();

  useEffect(() => {
    if (!isLoggedIn || !pathname?.startsWith('/group')) return;
    const group = businessGroupService.getBusinessGroup();
    let orgId = permissions.organizationId || group?.id;
    if (!orgId && isSuperAdmin && isSupabaseAvailable()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        supabase.from('organizations').select('id').limit(1).order('name').then(({ data }) => {
          const first = (data as { id: string }[] | null)?.[0]?.id;
          if (first) {
            router.replace(`/org/${first}/${GROUP_TO_ORG[pathname.replace(/^\/group\/?/, '').split('/')[0] || 'overview']}`);
          }
        });
      }
      return;
    }
    if (!orgId) return;
    if (permissions.role !== 'owner' && permissions.role !== 'admin' && permissions.role !== 'manager') {
      const branches = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
      if (branches.length > 0) {
        router.replace(`/org/${orgId}/branch/${branches[0].id}/overview`);
      } else {
        router.replace('/no-access?reason=branch');
      }
      return;
    }
    const segment = pathname.replace(/^\/group\/?/, '').split('/')[0] || 'overview';
    const path = GROUP_TO_ORG[segment] ?? 'overview';
    router.replace(`/org/${orgId}/${path}`);
  }, [isLoggedIn, pathname, permissions, router]);

  return <>{children}</>;
}
