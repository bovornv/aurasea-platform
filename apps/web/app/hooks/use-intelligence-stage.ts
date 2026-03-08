/**
 * Central hook for intelligence stage (coverage-days only, vertical-agnostic).
 * Coverage = distinct metric_date rows for branch_id (from coverage view or base table).
 */
'use client';

import { useState, useEffect } from 'react';
import { getIntelligenceStage, type IntelligenceStage } from '../utils/intelligence-stage';
import { getDataCoverageDays } from '../services/db/branch-metrics-info-service';
import { businessGroupService } from '../services/business-group-service';

export interface UseIntelligenceStageResult {
  coverageDays: number;
  stage: IntelligenceStage;
  isLoading: boolean;
}

/**
 * Branch scope: coverage = distinct metric_date count for this branch (accommodation_data_coverage / fnb_data_coverage or base table).
 */
export function useIntelligenceStageBranch(
  branchId: string | null,
  moduleType?: 'accommodation' | 'fnb' | null
): UseIntelligenceStageResult {
  const [coverageDays, setCoverageDays] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!branchId) {
      setCoverageDays(0);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const { coverageDays: days } = await getDataCoverageDays(branchId, moduleType ?? undefined);
        if (!cancelled) setCoverageDays(days ?? 0);
      } catch {
        if (!cancelled) setCoverageDays(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, moduleType]);

  const stage = getIntelligenceStage(coverageDays);
  return { coverageDays, stage, isLoading };
}

/**
 * Organization scope: coverage = minimum distinct days across all branches (per-branch coverage from view or base table).
 */
export function useIntelligenceStageOrganization(orgId: string | null): UseIntelligenceStageResult {
  const [coverageDays, setCoverageDays] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setCoverageDays(0);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const branches = businessGroupService
          .getAllBranches()
          .filter((b) => b.businessGroupId === orgId && !b.id?.startsWith('bg_'));
        if (cancelled || branches.length === 0) {
          setCoverageDays(0);
          setIsLoading(false);
          return;
        }

        const coverages = await Promise.all(
          branches.map(async (b) => {
            const { coverageDays: days } = await getDataCoverageDays(
              b.id,
              (b as { moduleType?: 'accommodation' | 'fnb' }).moduleType
            );
            return days ?? 0;
          })
        );
        if (cancelled) return;
        const minCoverage = coverages.length > 0 ? Math.min(...coverages) : 0;
        setCoverageDays(minCoverage);
      } catch {
        if (!cancelled) setCoverageDays(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const stage = getIntelligenceStage(coverageDays);
  return { coverageDays, stage, isLoading };
}
