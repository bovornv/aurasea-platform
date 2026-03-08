/**
 * Central hook for intelligence stage (coverage-days only, vertical-agnostic).
 * Use to gate health score, alerts, and trends and show IntelligenceInitializationCard when not FULLY_ACTIVE.
 */
'use client';

import { useState, useEffect } from 'react';
import { getIntelligenceStage, type IntelligenceStage } from '../utils/intelligence-stage';
import { getDailyMetrics } from '../services/db/daily-metrics-service';
import { businessGroupService } from '../services/business-group-service';

export interface UseIntelligenceStageResult {
  coverageDays: number;
  stage: IntelligenceStage;
  isLoading: boolean;
}

/**
 * Branch scope: coverage = distinct days in daily_metrics for this branch.
 * Accommodation: a day counts as valid data if rooms_sold > 0 (no dependency on rooms_available).
 * F&B / other: any row counts.
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
        const metrics = await getDailyMetrics(branchId, 90);
        if (cancelled) return;
        const rows = metrics || [];
        const validRows =
          moduleType === 'accommodation'
            ? rows.filter((r) => (r.roomsSold ?? 0) > 0)
            : rows;
        const uniqueDays = new Set(validRows.map((m) => m.date));
        setCoverageDays(uniqueDays.size);
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
 * Organization scope: coverage = minimum distinct days across all branches (conservative).
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
            const metrics = await getDailyMetrics(b.id, 90);
            const rows = metrics || [];
            const validRows =
              (b as { moduleType?: string }).moduleType === 'accommodation'
                ? rows.filter((r) => (r.roomsSold ?? 0) > 0)
                : rows;
            const uniqueDays = new Set(validRows.map((m) => m.date));
            return uniqueDays.size;
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
