/**
 * Resolved Branch Data Hook. REAL Supabase data only; simulation removed.
 */
'use client';

import { useMemo } from 'react';
import { operationalSignalsService } from '../services/operational-signals-service';
import { businessGroupService } from '../services/business-group-service';
import type { BranchMetrics } from '../models/branch-metrics';

export function useResolvedBranchData(branchId: string | null | undefined): BranchMetrics | null {
  return useMemo(() => {
    if (!branchId) return null;
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) return null;
      const branch = businessGroupService.getBranchById(branchId) ??
        businessGroupService.getAllBranches().find(b => b.id === branchId);
      if (!branch) return null;
      return operationalSignalsService.getLatestMetrics(
        branchId,
        businessGroup.id,
        branch?.modules
      );
    } catch {
      return null;
    }
  }, [branchId]);
}

export function useResolvedCompanyData(): {
  branches: Array<{ branchId: string; branchName: string; metrics: BranchMetrics }>;
  totalRevenue: number;
  totalCosts: number;
  totalCash: number;
} {
  return useMemo(() => {
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) {
        return { branches: [], totalRevenue: 0, totalCosts: 0, totalCash: 0 };
      }
      const allBranches = businessGroupService.getAllBranches();
      const branches = allBranches
        .filter(b => b.businessGroupId === businessGroup.id)
        .map(branch => {
          const metrics = operationalSignalsService.getLatestMetrics(
            branch.id,
            businessGroup.id,
            branch.modules
          );
          return {
            branchId: branch.id,
            branchName: branch.branchName,
            metrics: metrics || {
              branchId: branch.id,
              groupId: businessGroup.id,
              updatedAt: new Date().toISOString(),
              financials: {
                cashBalanceTHB: 0,
                revenueLast30DaysTHB: 0,
                costsLast30DaysTHB: 0,
                revenueLast7DaysTHB: 0,
                costsLast7DaysTHB: 0,
              },
              modules: {},
              metadata: { dataConfidence: 0 },
            },
          };
        });
      const totalRevenue = branches.reduce((sum, b) => sum + (b.metrics.financials.revenueLast30DaysTHB || 0), 0);
      const totalCosts = branches.reduce((sum, b) => sum + (b.metrics.financials.costsLast30DaysTHB || 0), 0);
      const totalCash = branches.reduce((sum, b) => sum + (b.metrics.financials.cashBalanceTHB || 0), 0);
      return { branches, totalRevenue, totalCosts, totalCash };
    } catch {
      return { branches: [], totalRevenue: 0, totalCosts: 0, totalCash: 0 };
    }
  }, []);
}
