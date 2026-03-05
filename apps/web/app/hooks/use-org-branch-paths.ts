/**
 * URL paths for current org (and branch when in branch context).
 * Use for router.push/href so navigation stays on /org/... routes.
 */
'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';
import { useUserSession } from '../contexts/user-session-context';

export function useOrgBranchPaths(): {
  orgId: string | null;
  branchId: string | null;
  companyOverview: string | null;
  companyAlerts: string | null;
  companyTrends: string | null;
  companySettings: string | null;
  branchOverview: string | null;
  branchLog: string | null;
  branchAlerts: string | null;
  branchTrends: string | null;
  branchSettings: string | null;
  branchAlertsWithQuery: (alertId?: string) => string | null;
} {
  const params = useParams();
  const { permissions } = useUserSession();
  const orgId = (params?.orgId as string) ?? null;
  const branchId = (params?.branchId as string) ?? null;

  return useMemo(() => {
    const oid = (orgId || permissions.organizationId || businessGroupService.getBusinessGroup()?.id) ?? null;
    if (!oid) {
      return {
        orgId: null,
        branchId: null,
        companyOverview: null,
        companyAlerts: null,
        companyTrends: null,
        companySettings: null,
        branchOverview: null,
        branchLog: null,
        branchAlerts: null,
        branchTrends: null,
        branchSettings: null,
        branchAlertsWithQuery: () => null,
      };
    }
    let bid = branchId || businessGroupService.getCurrentBranchId();
    if (!bid) {
      const branches = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === oid);
      bid = branches[0]?.id ?? null;
    }
    const base = `/org/${oid}`;
    const branchBase = bid ? `${base}/branch/${bid}` : null;
    return {
      orgId: oid,
      branchId: bid,
      companyOverview: `${base}/overview`,
      companyAlerts: `${base}/alerts`,
      companyTrends: `${base}/trends`,
      companySettings: `${base}/settings`,
      branchOverview: branchBase ? `${branchBase}/overview` : null,
      branchLog: branchBase ? `${branchBase}/log` : null,
      branchAlerts: branchBase ? `${branchBase}/alerts` : null,
      branchTrends: branchBase ? `${branchBase}/trends` : null,
      branchSettings: branchBase ? `${branchBase}/settings` : null,
      branchAlertsWithQuery: (alertId?: string) =>
        branchBase ? `${branchBase}/alerts${alertId ? `?alert=${alertId}` : ''}` : null,
    };
  }, [orgId, branchId, permissions]);
}
