/**
 * Organization Data Hook
 * 
 * PART 2: Loads branches and metrics for the active organization.
 * Triggers full recalculation when organization changes.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '../contexts/organization-context';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { BRANCH_SELECT } from '../lib/db-selects';
import { pickBranchDisplayName, pickBranchModuleTypeOrNull } from '../lib/branch-row-utils';
import { getLatestMetrics, getMetricsHistory } from '../services/db/metrics-service';
import type { BranchMetrics } from '../models/branch-metrics';

interface OrganizationBranch {
  id: string;
  name: string;
  organization_id: string;
  module_type: 'accommodation' | 'fnb' | null;
}

interface OrganizationData {
  branches: OrganizationBranch[];
  branchMetrics: Map<string, BranchMetrics>;
  totalMetricsCount: number; // Total count of daily metrics loaded across all branches (deprecated, kept for compatibility)
  isLoading: boolean;
  error: string | null;
}

export function useOrganizationData(): OrganizationData & {
  reload: () => Promise<void>;
} {
  const { activeOrganizationId } = useOrganization();
  const [branches, setBranches] = useState<OrganizationBranch[]>([]);
  const [branchMetrics, setBranchMetrics] = useState<Map<string, BranchMetrics>>(new Map());
  const [totalMetricsCount, setTotalMetricsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBranches = useCallback(async (organizationId: string) => {
    if (!isSupabaseAvailable() || !organizationId) {
      setBranches([]);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setBranches([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('branches')
        .select(BRANCH_SELECT)
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true });

      if (fetchError) {
        console.error('[OrganizationData] Failed to load branches:', fetchError);
        setError(fetchError.message);
        setBranches([]);
        return;
      }

      if (data) {
        const mapped: OrganizationBranch[] = (data as Record<string, unknown>[]).map((b) => ({
          id: String(b.id ?? ''),
          name: pickBranchDisplayName(b),
          organization_id: String(b.organization_id ?? ''),
          module_type: pickBranchModuleTypeOrNull(b),
        }));
        setBranches(mapped);
        setError(null);
      }
    } catch (e) {
      console.error('[OrganizationData] Error loading branches:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
      setBranches([]);
    }
  }, []);

  const loadMetrics = useCallback(async (branchIds: string[], organizationId: string) => {
    const metricsMap = new Map<string, BranchMetrics>();
    let totalCount = 0;

    for (const branchId of branchIds) {
      try {
        // PART 5: Load daily metrics history (210 days) for trends and proper calculations
        // Use organizationId as groupId
        // All metrics come from daily_metrics table (no weekly_metrics)
        const allMetrics = await getMetricsHistory(branchId, organizationId, 210);
        
        if (allMetrics && allMetrics.length > 0) {
          // Store the latest metric (for health score calculations)
          // But we have all metrics available for trends/graphs
          const latestMetric = allMetrics[0]; // getMetricsHistory returns newest first
          metricsMap.set(branchId, latestMetric);
          totalCount += allMetrics.length;
          
          console.log(`[OrganizationData] Loaded ${allMetrics.length} daily metrics for branch ${branchId}`);
        } else {
          // Fallback to latest if history fails
          const metrics = await getLatestMetrics(branchId, organizationId);
          if (metrics) {
            metricsMap.set(branchId, metrics);
            totalCount += 1;
            console.log(`[OrganizationData] Loaded 1 daily metric (latest only) for branch ${branchId}`);
          }
        }
      } catch (e) {
        console.error(`[OrganizationData] Failed to load metrics for branch ${branchId}:`, e);
      }
    }

    setBranchMetrics(metricsMap);
    setTotalMetricsCount(totalCount);
    console.log(`[OrganizationData] Total daily metrics loaded: ${totalCount} across ${branchIds.length} branch(es)`);
  }, []);

  const reload = useCallback(async () => {
    if (!activeOrganizationId) {
      setBranches([]);
      setBranchMetrics(new Map());
      setTotalMetricsCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // PART 2: Load branches for organization
      await loadBranches(activeOrganizationId);
      
      // Wait a bit for branches to be set, then load metrics
      // Use a small delay to ensure branches state is updated
      setTimeout(async () => {
        const currentBranches = branches.length > 0 ? branches : [];
        // If branches still empty, try loading again
        if (currentBranches.length === 0) {
          await loadBranches(activeOrganizationId);
          // Get fresh branches
          const freshBranches = await new Promise<OrganizationBranch[]>((resolve) => {
            const checkBranches = () => {
              // This will be handled by the effect below
              resolve([]);
            };
            setTimeout(checkBranches, 100);
          });
          if (freshBranches.length > 0) {
            await loadMetrics(
              freshBranches.map(b => b.id),
              activeOrganizationId
            );
          }
        } else {
          await loadMetrics(
            currentBranches.map(b => b.id),
            activeOrganizationId
          );
        }
        setIsLoading(false);
      }, 100);
    } catch (e) {
      console.error('[OrganizationData] Error reloading:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
      setIsLoading(false);
    }
  }, [activeOrganizationId, loadBranches, loadMetrics]);

  // Load branches when organization changes
  useEffect(() => {
    if (!activeOrganizationId) {
      setBranches([]);
      setBranchMetrics(new Map());
      setTotalMetricsCount(0);
      return;
    }

    setIsLoading(true);
    loadBranches(activeOrganizationId).then(() => {
      setIsLoading(false);
    });
  }, [activeOrganizationId, loadBranches]);

  // Load metrics when branches change
  useEffect(() => {
    if (branches.length > 0 && activeOrganizationId) {
      loadMetrics(
        branches.map(b => b.id),
        activeOrganizationId
      );
    }
  }, [branches, activeOrganizationId, loadMetrics]);

  // Listen for organization change event
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOrganizationChange = () => {
      // Reload will be triggered by activeOrganizationId change
      if (activeOrganizationId) {
        loadBranches(activeOrganizationId);
      }
    };

    window.addEventListener('organizationChanged', handleOrganizationChange);
    return () => {
      window.removeEventListener('organizationChanged', handleOrganizationChange);
    };
  }, [activeOrganizationId, loadBranches]);

  return useMemo(() => ({
    branches,
    branchMetrics,
    totalMetricsCount,
    isLoading,
    error,
    reload,
  }), [branches, branchMetrics, totalMetricsCount, isLoading, error, reload]);
}
