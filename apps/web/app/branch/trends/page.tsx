/**
 * Branch Trends Page - Simplified
 * 
 * Only renders: HealthScoreTrendChart and RevenueLast30DaysChart (optional)
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useHealthScore } from '../../hooks/use-health-score';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { useResolvedBranchData } from '../../hooks/use-resolved-branch-data';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { useI18n } from '../../hooks/use-i18n';
import { businessGroupService } from '../../services/business-group-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { HealthScoreTrendChart } from '../../components/charts/health-score-trend-chart';
import { RevenueLast30DaysChart } from '../../components/charts/revenue-last-30-days-chart';
import { SectionCard } from '../../components/section-card';
export default function BranchTrendsPage() {
  // ALL HOOKS MUST BE CALLED FIRST - NO CONDITIONALS, NO EARLY RETURNS
  const { locale } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();
  const { groupHealthScore } = useHealthScore();
  const [mounted, setMounted] = useState(false);
  
  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // STEP 3: Use resolved branch data (single source of truth)
  const branchMetrics = useResolvedBranchData(branch?.id);

  // Prefer KPI layer for trends (branch_kpi_metrics); fallback to daily metrics for hasSufficientHistory
  const [kpiMetricsCount, setKpiMetricsCount] = useState<number>(0);

  useEffect(() => {
    if (!branch?.id) return;
    if (branchMetrics?.dailyHistory && branchMetrics.dailyHistory.dates.length >= 10) return;

    const { getBranchKpiMetrics } = require('../../services/db/kpi-analytics-service');
    getBranchKpiMetrics(branch.id, 40)
      .then((rows: unknown[]) => setKpiMetricsCount(rows?.length ?? 0))
      .catch(() => setKpiMetricsCount(0));
  }, [branch?.id, branchMetrics?.dailyHistory]);

  // Get health score trend for current branch (30 days)
  const branchHealthScoreTrend = useMemo(() => {
    if (!branch || typeof window === 'undefined') return null;
    try {
      const { getHealthScoreTrend } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) return null;
      return getHealthScoreTrend(businessGroup.id, 30, branch.id);
    } catch (e) {
      console.error('Failed to load health score trend:', e);
      return null;
    }
  }, [branch]);

  // Get current branch health score
  const currentBranchScore = useMemo(() => {
    if (!branch || !groupHealthScore?.branchScores) return null;
    return groupHealthScore.branchScores.find(bs => bs.branchId === branch.id);
  }, [branch, groupHealthScore?.branchScores]);

  const hasSufficientHistory = useMemo(() => {
    if (branchMetrics?.dailyHistory && branchMetrics.dailyHistory.dates.length >= 10) return true;
    if (kpiMetricsCount >= 10) return true;
    if (branchHealthScoreTrend?.snapshots.length) return true;
    if (branchHealthScoreTrend && !branchHealthScoreTrend.hasInsufficientData && branchHealthScoreTrend.snapshots.length >= 10) return true;
    return false;
  }, [branchHealthScoreTrend, branchMetrics, kpiMetricsCount]);

  if (!mounted) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Loading...</div>
        </div>
      </PageLayout>
    );
  }

  if (!branch) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={locale === 'th' ? 'ไม่พบสาขา' : 'No branch selected'}
          action={{
            label: locale === 'th' ? 'ไปที่ภาพรวม' : 'Go to Overview',
            onClick: () => router.push(paths.branchOverview || '/branch/overview'),
          }}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="" subtitle="">
      {!hasSufficientHistory ? (
        <div style={{ 
          padding: '4rem 2rem', 
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '16px', color: '#6b7280', fontWeight: 500 }}>
            {locale === 'th' 
              ? 'เทรนด์จะปรากฏหลังจากติดตามผล 10+ วัน'
              : 'Trends will appear after 10+ days of monitoring.'}
          </div>
          {(branchMetrics?.dailyHistory?.dates.length || kpiMetricsCount) ? (
            <div style={{ fontSize: '14px', color: '#9ca3af', marginTop: '0.5rem' }}>
              {locale === 'th'
                ? `(มีข้อมูล ${branchMetrics?.dailyHistory?.dates.length || kpiMetricsCount || 0} วัน แต่ยังไม่มีข้อมูลสุขภาพ)`
                : `(Have ${branchMetrics?.dailyHistory?.dates.length || kpiMetricsCount || 0} days of data but no health score history)`}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* PHASE 3: Revenue Trend */}
          <SectionCard title={locale === 'th' ? 'เทรนด์รายได้' : 'Revenue Trend'}>
            {branch && (
              <RevenueLast30DaysChart 
                branchId={branch.id}
                locale={locale}
              />
            )}
          </SectionCard>

          {/* PHASE 3: Cost Trend */}
          {/* Check both dailyHistory and fetched dailyMetrics */}
          {(branchMetrics?.dailyHistory?.costs && branchMetrics.dailyHistory.costs.length > 0) && (
            <SectionCard title={locale === 'th' ? 'เทรนด์ต้นทุน' : 'Cost Trend'}>
              <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                {locale === 'th' ? 'กราฟต้นทุนจะปรากฏที่นี่' : 'Cost trend chart will appear here'}
              </div>
            </SectionCard>
          )}

          {/* PHASE 3: Margin Trend */}
          {/* Check both dailyHistory and fetched dailyMetrics */}
          {(branchMetrics?.dailyHistory?.revenue && branchMetrics.dailyHistory.costs) && (
            <SectionCard title={locale === 'th' ? 'เทรนด์กำไร' : 'Margin Trend'}>
              <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                {locale === 'th' ? 'กราฟกำไรจะปรากฏที่นี่' : 'Margin trend chart will appear here'}
              </div>
            </SectionCard>
          )}

          {/* PHASE 3: Occupancy Trend (if accommodation) */}
          {/* Check both dailyHistory and fetched dailyMetrics */}
          {(branchMetrics?.dailyHistory?.occupancy && branchMetrics.dailyHistory.occupancy.length > 0) && (
            <SectionCard title={locale === 'th' ? 'เทรนด์อัตราการเข้าพัก' : 'Occupancy Trend'}>
              <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                {locale === 'th' ? 'กราฟอัตราการเข้าพักจะปรากฏที่นี่' : 'Occupancy trend chart will appear here'}
              </div>
            </SectionCard>
          )}

          {/* Health Score Trend Chart */}
          {/* PHASE 3: Override hasInsufficientData if snapshots exist (daily metrics provide 40+ days) */}
          {branchHealthScoreTrend && (
            (!branchHealthScoreTrend.hasInsufficientData || branchHealthScoreTrend.snapshots.length > 0) &&
            branchHealthScoreTrend.snapshots.length > 0 && (
              <HealthScoreTrendChart 
                trend={{
                  ...branchHealthScoreTrend,
                  hasInsufficientData: false, // Override: snapshots exist, so data is sufficient
                }}
                currentScore={currentBranchScore?.healthScore || null}
                locale={locale}
              />
            )
          )}
        </div>
      )}
    </PageLayout>
  );
}
