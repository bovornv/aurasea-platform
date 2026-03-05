/**
 * Company Trends Page
 * 
 * Shows health score trends, alert movement, and historical data for the company
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { PageLayout } from '../../components/page-layout';
import { useI18n } from '../../hooks/use-i18n';
import { useHealthScore } from '../../hooks/use-health-score';
import { businessGroupService } from '../../services/business-group-service';
import { ModuleType } from '../../models/business-group';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { CompanyTrendAnalytics } from '../../components/portfolio/company-trend-analytics';
import { RevenueTrendCard } from '../../components/portfolio/revenue-trend-card';
import { AlertTrendCard } from '../../components/portfolio/alert-trend-card';
import { RiskDistributionCard } from '../../components/portfolio/risk-distribution-card';
import { PortfolioAlertMovement } from '../../components/portfolio/portfolio-alert-movement';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useSystemValidation } from '../../hooks/use-system-validation';

export default function CompanyTrendsPage() {
  // ALL HOOKS MUST BE CALLED FIRST - NO CONDITIONALS, NO EARLY RETURNS
  const { locale } = useI18n();
  const { groupHealthScore } = useHealthScore();
  const { alerts: rawAlerts } = useAlertStore();
  const { loading, error } = useHospitalityAlerts();
  const [mounted, setMounted] = useState(false);
  const [businessGroup, setBusinessGroup] = useState(businessGroupService.getBusinessGroup());
  
  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });

  useEffect(() => {
    setMounted(true);
    const handleChange = () => {
      setBusinessGroup(businessGroupService.getBusinessGroup());
    };
    window.addEventListener('organizationChanged', handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener('organizationChanged', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  // Use full group health score for CompanyTrendAnalytics (needs GroupHealthScore shape)
  const overallHealthScore = groupHealthScore;

  const accommodationHealthScore = useMemo(() => {
    const branchScores = groupHealthScore?.branchScores;
    if (!branchScores || branchScores.length === 0) return null;
    const allBranches = businessGroupService.getAllBranches();
    const accommodationBranches = branchScores.filter(bs => {
      const branch = allBranches.find(b => b.id === bs.branchId);
      return branch?.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
    });
    if (accommodationBranches.length === 0) return null;
    const avgScore = accommodationBranches.reduce((sum, bs) => sum + bs.healthScore, 0) / accommodationBranches.length;
    return { healthScore: avgScore };
  }, [groupHealthScore?.branchScores]);

  const fnbHealthScore = useMemo(() => {
    const branchScores = groupHealthScore?.branchScores;
    if (!branchScores || branchScores.length === 0) return null;
    const allBranches = businessGroupService.getAllBranches();
    const fnbBranches = branchScores.filter(bs => {
      const branch = allBranches.find(b => b.id === bs.branchId);
      return branch?.modules?.includes(ModuleType.FNB) ?? false;
    });
    if (fnbBranches.length === 0) return null;
    const avgScore = fnbBranches.reduce((sum, bs) => sum + bs.healthScore, 0) / fnbBranches.length;
    return { healthScore: avgScore };
  }, [groupHealthScore?.branchScores]);

  // Extract branchScores for PortfolioHealthOverview
  const branchScores = useMemo(() => {
    return groupHealthScore?.branchScores || [];
  }, [groupHealthScore?.branchScores]);

  if (!mounted) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={error.message}
        />
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (!businessGroup) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={locale === 'th' ? 'ไม่พบข้อมูลบริษัท' : 'Company data not found'}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="" subtitle="">
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1rem',
        padding: '0.5rem 0',
      }}>
        {/* 1️⃣ Compact Health Score Trend Chart */}
        {businessGroup && overallHealthScore && (
          <div style={{ gridColumn: '1 / -1' }}>
            <CompanyTrendAnalytics
              businessGroupId={businessGroup.id}
              branchScores={branchScores || []}
              overallHealthScore={overallHealthScore}
              locale={locale}
            />
          </div>
        )}

        {/* 2️⃣ Revenue Trend (Aggregated) */}
        {businessGroup && (
          <RevenueTrendCard businessGroupId={businessGroup.id} locale={locale} />
        )}

        {/* 3️⃣ Alert Trend */}
        {businessGroup && (
          <AlertTrendCard businessGroupId={businessGroup.id} locale={locale} />
        )}

        {/* 4️⃣ Risk Distribution Trend */}
        {businessGroup && (
          <RiskDistributionCard businessGroupId={businessGroup.id} locale={locale} />
        )}
      </div>

      {/* Alert Movement Over Time (Full Width) */}
      {businessGroup && (
        <div style={{ marginTop: '1rem' }}>
          <PortfolioAlertMovement businessGroupId={businessGroup.id} locale={locale} />
        </div>
      )}
    </PageLayout>
  );
}
