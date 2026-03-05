/**
 * Portfolio Branch Table Component
 * 
 * Compact table showing branch performance snapshot
 */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '../section-card';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { formatCurrency } from '../../utils/formatting';
import { businessGroupService } from '../../services/business-group-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { ModuleType } from '../../models/business-group';
import type { BranchHealthScore } from '../../services/health-score-service';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../services/monitoring-service';

interface PortfolioBranchTableProps {
  branchScores: BranchHealthScore[];
  alerts: AlertContract[];
  locale: string;
}

type SortField = 'score' | 'alerts' | 'revenue';
type SortDirection = 'asc' | 'desc';

export function PortfolioBranchTable({ branchScores, alerts, locale }: PortfolioBranchTableProps) {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const getHealthScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable'): string => {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      case 'stable': return '→';
    }
  };

  const getModuleLabels = (modules: ModuleType[]): string => {
    if (!modules || modules.length === 0) {
      return locale === 'th' ? 'ไม่ระบุ' : 'Not specified';
    }
    const labels: string[] = [];
    if (modules.includes(ModuleType.ACCOMMODATION)) {
      labels.push(locale === 'th' ? 'ที่พัก' : 'Accommodation');
    }
    if (modules.includes(ModuleType.FNB)) {
      labels.push(locale === 'th' ? 'F&B' : 'F&B');
    }
    return labels.join(' • ') || (locale === 'th' ? 'ไม่ระบุ' : 'Not specified');
  };

  // PART 6: Branch Performance Snapshot
  // Must display per branch: Health Score, Revenue (30 days), Margin, Risk level, Trend direction
  // Validate: Trend arrow correct, Revenue matches branch-level rolling calculation, No stale data
  const branchData = useMemo(() => {
    const allBranches = businessGroupService.getAllBranches();
    const businessGroup = businessGroupService.getBusinessGroup();
    
    return branchScores.map(branch => {
      const branchAlerts = alerts.filter(a => a.branchId === branch.branchId);
      const revenueImpact = branchAlerts.reduce((sum, alert) => {
        const extended = alert as ExtendedAlertContract;
        // PART 9: Numerical Stability
        const impact = extended.revenueImpact || 0;
        if (!isFinite(impact) || isNaN(impact)) return sum;
        return sum + impact;
      }, 0);
      
      const branchInfo = allBranches.find(b => b.id === branch.branchId);
      
      // PART 6: Get revenue (30 days) from operational signals - matches branch-level rolling calculation
      let revenue30Days = 0;
      let margin = 0;
      let riskLevel: 'Low' | 'Moderate' | 'High' = 'Low';
      let trend: 'up' | 'down' | 'stable' = 'stable';
      
      try {
        if (businessGroup) {
          const branchSignals = operationalSignalsService.getAllSignals(branch.branchId, businessGroup.id);
          const latestSignal = branchSignals[0];
          
          // PART 6: Revenue (30 days) - matches branch-level rolling calculation
          revenue30Days = latestSignal?.revenue30Days || 0;
          // PART 9: Numerical Stability
          if (!isFinite(revenue30Days) || isNaN(revenue30Days)) {
            revenue30Days = 0;
          }
          
          // PART 6: Calculate margin
          const costs30Days = latestSignal?.costs30Days || 0;
          if (revenue30Days > 0 && isFinite(costs30Days) && !isNaN(costs30Days)) {
            margin = ((revenue30Days - costs30Days) / revenue30Days) * 100;
            // PART 9: Ensure margin is valid
            if (!isFinite(margin) || isNaN(margin)) {
              margin = 0;
            }
          }
          
          // PART 6: Calculate trend direction by comparing current vs previous health score
          // Use health score trend service to get trend
          if (typeof window !== 'undefined') {
            try {
              const { getHealthScoreTrend } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
              const trendData = getHealthScoreTrend(businessGroup.id, 30, branch.branchId);
              
              // PART 6: Map trend to up/down/stable
              if (trendData.trend === 'improving') {
                trend = 'up';
              } else if (trendData.trend === 'deteriorating') {
                trend = 'down';
              } else {
                trend = 'stable';
              }
              
              // PART 6: Validate trend arrow correct - ensure delta matches trend direction
              if (process.env.NODE_ENV === 'development') {
                const expectedTrend = trendData.delta > 2 ? 'up' : trendData.delta < -2 ? 'down' : 'stable';
                if (trend !== expectedTrend) {
                  console.warn(`[PortfolioBranchTable] PART 6 VALIDATION: Trend mismatch for branch ${branch.branchId}`, {
                    calculatedTrend: trend,
                    expectedTrend,
                    delta: trendData.delta,
                  });
                }
              }
            } catch (e) {
              // PART 6: Handle errors gracefully - default to stable
              if (process.env.NODE_ENV === 'development') {
                console.warn(`[PortfolioBranchTable] Error calculating trend for branch ${branch.branchId}:`, e);
              }
              trend = 'stable';
            }
          }
        }
      } catch (e) {
        // PART 6: Handle errors gracefully - no stale data
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[PortfolioBranchTable] Error getting metrics for branch ${branch.branchId}:`, e);
        }
      }
      
      // PART 6: Determine risk level based on alert counts
      if (branch.alertCounts.critical > 0) {
        riskLevel = 'High';
      } else if (branch.alertCounts.warning > 0) {
        riskLevel = 'Moderate';
      } else {
        riskLevel = 'Low';
      }
      
      return {
        ...branch,
        modules: branchInfo?.modules || [ModuleType.FNB],
        revenueImpact,
        revenue30Days, // PART 6: Revenue (30 days)
        margin, // PART 6: Margin
        riskLevel, // PART 6: Risk level
        trend, // PART 6: Trend direction
        alertCount: branch.alertCounts.critical + branch.alertCounts.warning + branch.alertCounts.informational,
      };
    });
  }, [branchScores, alerts, locale]);

  // Sort data
  const sortedData = useMemo(() => {
    const sorted = [...branchData].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'score':
          comparison = a.healthScore - b.healthScore;
          break;
        case 'alerts':
          comparison = a.alertCount - b.alertCount;
          break;
        case 'revenue':
          comparison = a.revenueImpact - b.revenueImpact;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [branchData, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRowClick = (branchId: string) => {
    businessGroupService.setCurrentBranch(branchId);
    if (paths.orgId) router.push(`/org/${paths.orgId}/branch/${branchId}/overview`);
  };

  if (sortedData.length === 0) {
    return (
      <SectionCard title={locale === 'th' ? 'ภาพรวมสาขา' : 'Branch Snapshot'}>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          {locale === 'th' ? 'ไม่มีข้อมูลสาขา' : 'No branch data available'}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={locale === 'th' ? 'ภาพรวมประสิทธิภาพสาขา' : 'Branch Performance Snapshot'}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                {locale === 'th' ? 'สาขา' : 'Branch'}
              </th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                {locale === 'th' ? 'ประเภท' : 'Type'}
              </th>
              <th 
                style={{ textAlign: 'left', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer' }}
                onClick={() => handleSort('score')}
              >
                {locale === 'th' ? 'คะแนนสุขภาพ' : 'Health Score'} {sortField === 'score' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                {locale === 'th' ? 'เทรนด์' : 'Trend'}
              </th>
              <th style={{ textAlign: 'right', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                {locale === 'th' ? 'รายได้ (30 วัน)' : 'Revenue (30d)'}
              </th>
              <th style={{ textAlign: 'right', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                {locale === 'th' ? 'อัตรากำไร' : 'Margin'}
              </th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                {locale === 'th' ? 'ระดับความเสี่ยง' : 'Risk Level'}
              </th>
              <th 
                style={{ textAlign: 'left', padding: '0.75rem', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer' }}
                onClick={() => handleSort('alerts')}
              >
                {locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'} {sortField === 'alerts' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((branch) => (
              <tr
                key={branch.branchId}
                onClick={() => handleRowClick(branch.branchId)}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <td style={{ padding: '0.75rem', fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}>
                  {branch.branchName}
                </td>
                <td style={{ padding: '0.75rem', fontSize: '13px', color: '#6b7280' }}>
                  {getModuleLabels(branch.modules)}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: getHealthScoreColor(branch.healthScore) }}>
                    {branch.healthScore}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', fontSize: '16px', color: '#6b7280' }}>
                  {/* PART 6: Trend direction - validate arrow correct */}
                  {getTrendIcon(branch.trend || 'stable')}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  {/* PART 6: Revenue (30 days) - matches branch-level rolling calculation */}
                  ฿{formatCurrency(branch.revenue30Days || 0)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  {/* PART 6: Margin */}
                  {typeof branch.margin === 'number' && isFinite(branch.margin) && !isNaN(branch.margin)
                    ? `${branch.margin.toFixed(1)}%`
                    : '—'}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {/* PART 6: Risk level */}
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: branch.riskLevel === 'High' ? '#fee2e2' : branch.riskLevel === 'Moderate' ? '#fef3c7' : '#dbeafe',
                    color: branch.riskLevel === 'High' ? '#991b1b' : branch.riskLevel === 'Moderate' ? '#92400e' : '#1e40af',
                  }}>
                    {branch.riskLevel}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', fontSize: '14px', color: '#374151' }}>
                  {branch.alertCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
