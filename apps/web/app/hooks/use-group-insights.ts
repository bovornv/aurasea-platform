/**
 * Hook for Group-Level Aggregated Insights
 * 
 * Provides aggregated health score, branch counts by severity, and top revenue-impact alerts
 * when "All Branches" view is selected.
 */
'use client';

import { useState, useEffect } from 'react';
import { useCurrentBranch } from './use-current-branch';
import { useAlertStore } from '../contexts/alert-store-context';
import { useUserSession } from '../contexts/user-session-context';
import { aggregateGroupInsights, type GroupAggregatedInsights } from '../services/group-aggregation-service';
import { businessGroupService } from '../services/business-group-service';
import { useTestMode } from '../providers/test-mode-provider';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

export function useGroupInsights(): {
  insights: GroupAggregatedInsights | null;
  isLoading: boolean;
} {
  const { isAllBranches } = useCurrentBranch();
  const { alerts: rawAlerts } = useAlertStore();
  const { permissions } = useUserSession();
  const { testMode } = useTestMode(); // React to testMode.version changes
  const [insights, setInsights] = useState<GroupAggregatedInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log(`[TEST_MODE] useGroupInsights: Recalculating (testMode version: ${testMode.version})`);
    if (!isAllBranches) {
      // Not in group view, return null
      setInsights(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) {
        setInsights(null);
        setIsLoading(false);
        return;
      }

      // Use raw alerts from alert store (these are AlertContract[])
      const roleForInsights: 'owner' | 'manager' | 'branch' =
        permissions.role === 'owner' || permissions.role === 'admin' ? 'owner'
        : permissions.role === 'manager' ? 'manager'
        : 'branch';
      const aggregated = aggregateGroupInsights(rawAlerts, businessGroup.id, {
        role: roleForInsights,
        organizationId: permissions.organizationId,
        branchIds: permissions.branchIds,
      });
      setInsights(aggregated);
    } catch (err) {
      console.error('Failed to aggregate group insights:', err);
      setInsights(null);
    } finally {
      setIsLoading(false);
    }
  }, [isAllBranches, rawAlerts, permissions, testMode.version]); // React to testMode.version

  return { insights, isLoading };
}
