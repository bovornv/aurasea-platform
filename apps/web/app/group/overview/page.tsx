/**
 * Owner Summary Page
 * 
 * Executive-level dashboard for owners and managers showing:
 * - Group health snapshot
 * - Branch comparison
 * - Active group alerts
 * - Recommended actions
 * - Health score trend
 */

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { useHealthScore } from '../../hooks/use-health-score';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useUserSession } from '../../contexts/user-session-context';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useBusinessSetup } from '../../contexts/business-setup-context';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useI18n } from '../../hooks/use-i18n';
import { useTestMode } from '../../providers/test-mode-provider';
import { businessGroupService } from '../../services/business-group-service';
import { getBranchHealthScores, getGroupHealthScore } from '../../services/health-score-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { ModuleType } from '../../models/business-group';
import { PortfolioHealthOverview } from '../../components/portfolio/portfolio-health-overview';
import { PortfolioAlertSummary } from '../../components/portfolio/portfolio-alert-summary';
import { PortfolioAlertMovement } from '../../components/portfolio/portfolio-alert-movement';
import { PortfolioRevenueLeaks } from '../../components/portfolio/portfolio-revenue-leaks';
import { PortfolioRecommendedActions } from '../../components/portfolio/portfolio-recommended-actions';
import { PortfolioBranchTable } from '../../components/portfolio/portfolio-branch-table';
import { CriticalAlertsSnapshot } from '../../components/alerts/critical-alerts-snapshot';
import { MonitoringErrorBoundary } from '../../components/monitoring-error-boundary';
import { HealthScoreFallback } from '../../components/health-score-fallback';
import { AlertsFallback } from '../../components/alerts-fallback';
import { useOrganization } from '../../contexts/organization-context';
import { useRbacReady } from '../../hooks/use-route-guard';
import { calculateRevenueExposureFromAlerts } from '../../utils/revenue-exposure-calculator';
import {
  fetchGroupDailySummaryDbPartial,
  mergeGroupDailySummary,
  formatDailySummaryCompactThb,
  invalidateDailySummaryCache,
} from '../../services/daily-summary-service';
import { ActivationBlock } from '../../components/activation-block';
import { useIntelligenceStageOrganization } from '../../hooks/use-intelligence-stage';
import { validateOrganizationScenario } from '../../utils/validation-logger';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { OperatingHeader } from '../../components/operating-layer/operating-header';
import { OperatingSection } from '../../components/operating-layer/operating-section';
import { OperatingFooterTrust } from '../../components/operating-layer/operating-footer-trust';
import { DailyPrompt } from '../../components/operating-layer/daily-prompt';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../services/monitoring-service';

function OwnerSummaryContent() {
  // ALL HOOKS MUST BE CALLED FIRST - NO CONDITIONALS, NO EARLY RETURNS
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paths = useOrgBranchPaths();
  const { permissions, isLoggedIn } = useUserSession();
  const { setup } = useBusinessSetup();
  const { branch: currentBranch } = useCurrentBranch();
  const { t, locale } = useI18n();
  const { groupHealthScore, isLoading: healthScoreLoading } = useHealthScore();
  const { alerts, loading: alertsLoading, alertsInitializing, lastUpdated } = useHospitalityAlerts();
  const { alerts: rawAlerts } = useAlertStore();
  const { testMode } = useTestMode();
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const isReady = useRbacReady();
  const { coverageDays } = useIntelligenceStageOrganization(activeOrganizationId ?? null);
  const [mounted, setMounted] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [dailySummaryDb, setDailySummaryDb] = useState<Awaited<
    ReturnType<typeof fetchGroupDailySummaryDbPartial>
  > | null>(null);
  
  // PART 1: System validation (development only) - Uses singleton pattern to prevent multiple instances
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 120000 });

  // Handle client-side mounting to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    const timeoutId = setTimeout(() => {
      if (healthScoreLoading || alertsLoading) {
        const hasComputedData = groupHealthScore !== null || (rawAlerts && rawAlerts.length > 0);
        if (hasComputedData) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[OwnerSummary] Loading timeout exceeded - showing fallback UI');
          }
          setLoadingTimeout(true);
        }
      }
    }, 5000);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [healthScoreLoading, alertsLoading, groupHealthScore, rawAlerts]);

  // Listen for branch/organization/metrics changes to reload data
  useEffect(() => {
    if (!mounted) return;

    const handleBranchOrOrganizationChange = () => {
      invalidateDailySummaryCache();
      setRefreshTrigger((prev) => prev + 1);
    };

    const handleMetricsUpdate = () => {
      invalidateDailySummaryCache();
      setRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener('branchUpdated', handleBranchOrOrganizationChange);
    window.addEventListener('organizationChanged', handleBranchOrOrganizationChange);
    window.addEventListener('storage', handleBranchOrOrganizationChange);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('branchSelectionChanged', handleBranchOrOrganizationChange);
    window.addEventListener('forceRecalculation', handleBranchOrOrganizationChange);

    return () => {
      window.removeEventListener('branchUpdated', handleBranchOrOrganizationChange);
      window.removeEventListener('organizationChanged', handleBranchOrOrganizationChange);
      window.removeEventListener('storage', handleBranchOrOrganizationChange);
      window.removeEventListener('metricsUpdated', handleMetricsUpdate);
      window.removeEventListener('branchSelectionChanged', handleBranchOrOrganizationChange);
      window.removeEventListener('forceRecalculation', handleBranchOrOrganizationChange);
    };
  }, [mounted]);

  // Role-based access control: redirect branch users
  useEffect(() => {
    if (!mounted) return;
    
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }

    if (['manager', 'staff'].includes(permissions.role)) {
      router.replace(paths.branchOverview || '/branch/overview');
    }
  }, [permissions.role, isLoggedIn, router, mounted, paths.branchOverview]);

  // Access denied banner only when isReady (no flash while RBAC still loading)
  useEffect(() => {
    if (!isReady) return;
    const denied = searchParams.get('access_denied') === 'company_settings';
    if (denied && pathname) {
      setShowAccessDenied(true);
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, pathname, router, isReady]);

  // Get business name using the same logic as dashboard page
  // Use consistent value during SSR to avoid hydration mismatch
  // Include refreshTrigger to force re-fetch when branches change
  const businessGroup = mounted && typeof window !== 'undefined' ? businessGroupService.getBusinessGroup() : null;
  const businessName = mounted 
    ? (currentBranch?.branchName || setup.businessName || businessGroup?.name || t('hospitality.dashboard.title'))
    : 'Organization';

  const groupBranchIds = useMemo(() => {
    if (!mounted || !businessGroup) return [];
    return businessGroupService
      .getAllBranches()
      .filter((b) => b.businessGroupId === businessGroup.id)
      .map((b) => b.id);
  }, [mounted, businessGroup, refreshTrigger]);

  useEffect(() => {
    if (!mounted || groupBranchIds.length === 0) {
      setDailySummaryDb(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const partial = await fetchGroupDailySummaryDbPartial(groupBranchIds);
        if (!cancelled) setDailySummaryDb(partial);
      } catch {
        if (!cancelled) setDailySummaryDb(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, groupBranchIds, refreshTrigger, activeOrganizationId]);

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Get branch scores sorted by lowest health score first
  // STEP 1: Recalculates on: metrics update, branch change, testMode change, simulation change
  const branchScores = useMemo(() => {
    if (!mounted || !businessGroup || !rawAlerts) return [];
    
    const roleForScores: 'owner' | 'manager' | 'branch' =
      permissions.role === 'owner' || permissions.role === 'admin' ? 'owner'
      : permissions.role === 'manager' ? 'manager'
      : 'branch';
    const scores = getBranchHealthScores(rawAlerts, businessGroup.id, {
      role: roleForScores,
      organizationId: permissions.organizationId,
      branchIds: permissions.branchIds,
    });
    
    // Sort by lowest health score first
    return scores.sort((a, b) => a.healthScore - b.healthScore);
  }, [
    rawAlerts, 
    businessGroup, 
    permissions, 
    mounted, 
    refreshTrigger, 
    testMode.version,
    // STEP 1: Add simulation dependencies to force recalculation
    testMode.simulationType,
    testMode.simulationScenario,
  ]);

  // Calculate health scores by business type using getGroupHealthScore
  // Excludes branches with no metrics (hasSufficientData = false)
  // STEP 1: Recalculates on: metrics update, branch change, testMode change, simulation change
  const accommodationHealthScore = useMemo(() => {
    if (!mounted || !businessGroup || !rawAlerts) return null;
    
    const allBranches = businessGroupService.getAllBranches();
    const accommodationBranches = allBranches.filter(b => 
      b.modules?.includes(ModuleType.ACCOMMODATION) ?? false
    );
    
    if (accommodationBranches.length === 0) return null;
    
    const accommodationBranchIds = accommodationBranches.map(b => b.id);
    const accommodationBranchScores = branchScores.filter(bs => 
      accommodationBranchIds.includes(bs.branchId)
    );
    
    if (accommodationBranchScores.length === 0) return null;
    
    // Use getGroupHealthScore: weighted average, excludes branches with no metrics
    return getGroupHealthScore(accommodationBranchScores);
  }, [
    branchScores, 
    businessGroup, 
    mounted, 
    refreshTrigger, 
    testMode.version,
    // STEP 1: Add simulation dependencies
    testMode.simulationType,
    testMode.simulationScenario,
  ]);

  const fnbHealthScore = useMemo(() => {
    if (!mounted || !businessGroup || !rawAlerts) return null;
    
    const allBranches = businessGroupService.getAllBranches();
    const fnbBranches = allBranches.filter(b => 
      b.modules?.includes(ModuleType.FNB) ?? false
    );
    
    if (fnbBranches.length === 0) return null;
    
    const fnbBranchIds = fnbBranches.map(b => b.id);
    const fnbBranchScores = branchScores.filter(bs => 
      fnbBranchIds.includes(bs.branchId)
    );
    
    if (fnbBranchScores.length === 0) return null;
    
    // Use getGroupHealthScore: weighted average, excludes branches with no metrics
    return getGroupHealthScore(fnbBranchScores);
  }, [
    branchScores, 
    businessGroup, 
    mounted, 
    refreshTrigger, 
    testMode.version,
    // STEP 1: Add simulation dependencies
    testMode.simulationType,
    testMode.simulationScenario,
  ]);

  const loading = healthScoreLoading || alertsLoading;
  
  // PART 4: Fix Alert Engine Null Case - ensure rawAlerts is always array
  const safeRawAlerts = useMemo(() => {
    if (!Array.isArray(rawAlerts)) return [];
    return rawAlerts;
  }, [rawAlerts]);
  
  // PART 6: Prevent 500 Error - wrap aggregation logic in try-catch
  // PART 5: Calculate revenue exposure (MUST be before conditional returns)
  const revenueExposure = useMemo(() => {
    try {
      if (!safeRawAlerts || safeRawAlerts.length === 0) return 0;
      return calculateRevenueExposureFromAlerts(safeRawAlerts);
    } catch (err) {
      console.error('[GROUP OVERVIEW ERROR] Failed to calculate revenue exposure:', err);
      return 0; // Safe fallback
    }
  }, [safeRawAlerts]);

  const dailySummary = useMemo(() => {
    const merged = mergeGroupDailySummary(dailySummaryDb, safeRawAlerts);
    return {
      underperformingCount: merged.underperformingCount,
      revenueAtRisk: merged.revenueAtRiskThb,
      hasData: merged.hasAlertData,
      source: merged.source,
    };
  }, [dailySummaryDb, safeRawAlerts]);

  // PART 6: Prevent 500 Error - wrap aggregation logic
  // PART 3: Calculate total company revenue (sum of all branch revenues)
  const totalCompanyRevenue = useMemo(() => {
    try {
      if (!mounted || !businessGroup) return 0;
      
      const allBranches = businessGroupService.getAllBranches();
      let total = 0;
      
      allBranches.forEach(branch => {
        try {
          const branchSignals = operationalSignalsService.getAllSignals(branch.id, businessGroup.id);
          const latestSignal = branchSignals[0];
          const revenue30Days = latestSignal?.revenue30Days || 0;
          
          // PART 9: Numerical Stability - guard against NaN/Infinity
          if (isFinite(revenue30Days) && !isNaN(revenue30Days) && revenue30Days > 0) {
            total += revenue30Days;
          }
        } catch (e) {
          // Skip branches that cause errors
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[OwnerSummary] Error getting revenue for branch ${branch.id}:`, e);
          }
        }
      });
      
      // PART 9: Ensure result is valid
      return isFinite(total) && !isNaN(total) ? total : 0;
    } catch (err) {
      console.error('[GROUP OVERVIEW ERROR] Failed to calculate total company revenue:', err);
      return 0; // Safe fallback
    }
  }, [mounted, businessGroup, refreshTrigger]);


  // PART 5: Validate organization scenario (MUST be before conditional returns)
  // Skip validation if healthScore is 0 or null (indicates no data, not a scenario issue)
  useEffect(() => {
    if (!activeOrganizationId || !groupHealthScore) return;
    
    // Skip validation if healthScore is 0/null (no data case)
    if (groupHealthScore.healthScore === null || groupHealthScore.healthScore === 0) {
      return; // Don't validate when there's no data
    }
    
    if (!safeRawAlerts || safeRawAlerts.length === 0) return;
    
    const validation = validateOrganizationScenario(
      activeOrganizationId,
      groupHealthScore.healthScore,
      safeRawAlerts,
      revenueExposure,
      activeOrganization?.name
    );
    
    // Only log errors, not warnings (warnings are for data quality, not failures)
    if (!validation.passed && validation.errors.length > 0) {
      console.error('[OwnerSummary] Validation failed for organization:', activeOrganizationId, {
        errors: validation.errors,
        healthScore: groupHealthScore.healthScore,
        revenueExposure,
        alertsCount: safeRawAlerts.length,
      });
    }
  }, [activeOrganizationId, activeOrganization?.name, groupHealthScore?.healthScore, safeRawAlerts, revenueExposure]);
  
  // Filter group-level alerts (top 5)
  // MUST be defined before any useEffect or render code that references it
  const topGroupAlerts = useMemo(() => {
    if (!mounted || !safeRawAlerts) return [];
    
    const alertsByBranch = new Map<string, AlertContract[]>();
    safeRawAlerts.forEach(alert => {
      if (alert.branchId) {
        const existing = alertsByBranch.get(alert.branchId) || [];
        existing.push(alert);
        alertsByBranch.set(alert.branchId, existing);
      }
    });

    const branchCounts = new Map<string, number>();
    safeRawAlerts.forEach(alert => {
      if (alert.id) {
        branchCounts.set(alert.id, (branchCounts.get(alert.id) || 0) + 1);
      }
    });

    const groupAlerts = safeRawAlerts.filter(alert => {
      if (alert.id && branchCounts.get(alert.id) && branchCounts.get(alert.id)! > 1) {
        return true;
      }
      if (!alert.branchId) {
        return true;
      }
      return false;
    });

    // Sort by severity and take top 5
    const severityWeight = { critical: 3, warning: 2, informational: 1 };
    return groupAlerts
      .sort((a, b) => {
        const weightA = severityWeight[a.severity as keyof typeof severityWeight] || 0;
        const weightB = severityWeight[b.severity as keyof typeof severityWeight] || 0;
        return weightB - weightA;
      })
      .slice(0, 5);
  }, [safeRawAlerts, mounted]);
  
  // Ensure topGroupAlerts is always an array (defensive)
  const safeTopGroupAlerts = topGroupAlerts || [];
  
  // Log loading states for debugging in dev only (after topGroupAlerts is defined)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[OwnerSummary] Loading states:', {
        healthScoreLoading,
        alertsLoading,
        loading,
        groupHealthScore: !!groupHealthScore,
        groupHealthScoreValue: groupHealthScore?.healthScore,
        alertsCount: alerts.length,
        rawAlertsCount: safeRawAlerts?.length || 0,
        topGroupAlertsCount: safeTopGroupAlerts.length,
        businessGroupId: businessGroup?.id,
        branchScoresCount: branchScores.length,
      });
    }
    if (rawAlerts && rawAlerts.length > 0 && process.env.NODE_ENV === 'development') {
      const criticalAlerts = rawAlerts.filter(a => a.severity === 'critical');
      console.log('[OwnerSummary] Critical alerts:', {
        count: criticalAlerts.length,
        alerts: criticalAlerts.map(a => ({ id: a.id, type: a.type, branchId: a.branchId })),
      });
      console.log('[OwnerSummary] Top group alerts:', {
        count: safeTopGroupAlerts.length,
        alerts: safeTopGroupAlerts.map(a => ({ id: a.id, type: a.type, severity: a.severity, branchId: a.branchId })),
      });
    } else if (process.env.NODE_ENV === 'development' && !Array.isArray(safeRawAlerts)) {
      console.warn('[OwnerSummary] rawAlerts is not an array - possible data fetching issue', {
        rawAlertsType: typeof safeRawAlerts,
        setupIsCompleted: setup.isCompleted,
      });
    }
    // Zero alerts is valid (no alerts generated yet); only warn when rawAlerts is missing or wrong type
  }, [healthScoreLoading, alertsLoading, loading, groupHealthScore, alerts, safeRawAlerts, safeTopGroupAlerts, testMode, businessGroup, branchScores, setup.isCompleted]);

  // NOW we can do conditional returns AFTER all hooks
  // Show consistent loading state until mounted (prevents hydration mismatch)
  // Always return the same structure during SSR and initial client render
  if (!mounted) {
    return (
        <PageLayout title="" subtitle="Loading...">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  // Don't render if not logged in (will redirect)
  if (!isLoggedIn) {
    return (
        <PageLayout title="" subtitle="Loading...">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  // Don't render if branch user (will redirect)
  if (['manager', 'staff'].includes(permissions.role)) {
    return (
        <PageLayout title="" subtitle="Loading...">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  // PART 4: Show loading state - but don't freeze if we have computed values
  // If metrics fetch fails, show computed values instead of infinite loading
  if (loading) {
    // PART 4: If we have computed data, show it instead of spinner
    const hasComputedData = groupHealthScore !== null || (safeRawAlerts && safeRawAlerts.length > 0);
    if (hasComputedData) {
      // Continue to render the page below
    } else if (loadingTimeout) {
      return (
        <PageLayout title="" subtitle={mounted ? businessName : 'Organization'}>
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', color: '#6b7280', marginBottom: '1rem' }}>
              System is taking longer than expected. Showing available data...
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Refresh Page
            </button>
          </div>
        </PageLayout>
      );
    } else {
      // Still loading and no computed data yet - show spinner
      return (
        <PageLayout title="" subtitle="Loading...">
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <LoadingSpinner />
          </div>
        </PageLayout>
      );
    }
  }

  // PART 6: Prevent 500 Error - wrap render logic in try-catch
  // Note: React components can't have try-catch around return, so we use ErrorBoundary instead
  // All aggregation logic is already wrapped in try-catch above

  const dailySummaryCard = (() => {
    const { underperformingCount, revenueAtRisk, hasData } = dailySummary;
    const noData =
      !hasData &&
      (!branchScores || branchScores.length === 0) &&
      dailySummary.source === 'empty';
    const amountStr = formatDailySummaryCompactThb(revenueAtRisk);
    let sentence: React.ReactNode;
    if (noData) {
      sentence =
        locale === 'th'
          ? 'ยังไม่มีข้อมูล เริ่มบันทึกข้อมูลรายวัน'
          : 'No data yet. Start entering daily metrics.';
    } else if (underperformingCount === 0) {
      sentence =
        locale === 'th'
          ? 'ทุกสาขาอยู่ในเกณฑ์ปกติ ไม่พบความเสี่ยงรายได้ในขณะนี้'
          : 'All branches stable. No immediate revenue risk detected.';
    } else {
      const n = underperformingCount;
      sentence =
        locale === 'th' ? (
          <>
            {n} สาขาต่ำกว่าเกณฑ์ ประมาณ{' '}
            <span style={{ color: '#b91c1c', fontWeight: 600 }}>{amountStr}</span> รายได้มีความเสี่ยงวันนี้
          </>
        ) : (
          <>
            {n} branches underperforming. Estimated{' '}
            <span style={{ color: '#b91c1c', fontWeight: 600 }}>{amountStr}</span> revenue at risk today.
          </>
        );
    }
    const isStable = underperformingCount === 0 && !noData;
    return (
      <div
        style={{
          background: '#F6F7F9',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '0.25rem',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
          🧠 {locale === 'th' ? 'สรุปรายวัน' : 'Daily Summary'}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 500,
            color: isStable ? '#15803d' : '#374151',
            lineHeight: 1.4,
          }}
        >
          {sentence}
        </p>
      </div>
    );
  })();

  return (
    <PageLayout title="" subtitle="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {showAccessDenied && (
          <div
            role="alert"
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#b91c1c',
              fontSize: '14px',
            }}
          >
            {t('common.accessDenied')}
          </div>
        )}

        <OperatingHeader />
        <DailyPrompt lastUpdated={lastUpdated?.toISOString?.()} logTodayHref={paths.branchLog} />

        {/* 🧠 Daily Summary — always visible (including activation / no health score yet) */}
        {dailySummaryCard}

        {!groupHealthScore ? (
          <>
            <ActivationBlock />
            {safeRawAlerts && safeRawAlerts.length > 0 && (
              <MonitoringErrorBoundary componentName="Portfolio Alert Summary">
                <PortfolioAlertSummary
                  alerts={safeTopGroupAlerts}
                  totalCompanyRevenue={totalCompanyRevenue}
                  locale={locale}
                />
              </MonitoringErrorBoundary>
            )}
          </>
        ) : (
          <>
        {/* Section A — สถานะธุรกิจวันนี้ */}
        <OperatingSection title="สถานะธุรกิจวันนี้">
            <MonitoringErrorBoundary componentName="Portfolio Health Overview">
              {businessGroup && (
                <PortfolioHealthOverview
                  businessGroupId={businessGroup.id}
                  branchScores={branchScores}
                  overallHealthScore={groupHealthScore}
                  accommodationHealthScore={accommodationHealthScore}
                  fnbHealthScore={fnbHealthScore}
                  locale={locale}
                  showTrends={false}
                />
              )}
            </MonitoringErrorBoundary>
        </OperatingSection>

        {/* Section B — ระบบเตือนความเสี่ยง */}
        <OperatingSection title="ระบบเตือนความเสี่ยง">
          <MonitoringErrorBoundary componentName="Critical Alerts Snapshot">
            <CriticalAlertsSnapshot
              alerts={safeRawAlerts || []}
              viewType="company"
              locale={locale}
              alertsInitializing={alertsInitializing}
            />
          </MonitoringErrorBoundary>
          <MonitoringErrorBoundary componentName="Portfolio Alert Summary">
            <PortfolioAlertSummary
              alerts={safeTopGroupAlerts}
              totalCompanyRevenue={totalCompanyRevenue}
              locale={locale}
            />
          </MonitoringErrorBoundary>
        </OperatingSection>

        {/* Section C — แนวโน้มธุรกิจ */}
        <OperatingSection title="แนวโน้มธุรกิจ">
          {coverageDays < 7 ? (
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
              ข้อมูลยังไม่ครบ 7 วัน ระบบกำลังรวบรวมข้อมูล
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '14px', color: '#374151' }}>
              {locale === 'th' ? 'รายได้ 7 วัน · อัตราการเข้าพัก/ยอดขาย · แนวโน้มต้นทุน — ดูรายละเอียดในหน้าแนวโน้ม' : '7-day revenue · Occupancy/sales · Cost trend — see Trends page for details.'}
            </p>
          )}
        </OperatingSection>

        {/* Section D — คำแนะนำจากระบบ (always show insight lines when stable so panel never feels empty) */}
        <OperatingSection title="คำแนะนำจากระบบ">
          <MonitoringErrorBoundary componentName="Portfolio Recommended Actions">
            <PortfolioRecommendedActions alerts={safeRawAlerts || []} locale={locale} />
          </MonitoringErrorBoundary>
          {(!safeRawAlerts || safeRawAlerts.length === 0) && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ marginBottom: '0.5rem', fontSize: '13px', color: '#6b7280' }}>
                แนวโน้มรายได้คงที่ — บันทึกข้อมูลสม่ำเสมอเพื่อให้ระบบวิเคราะห์ได้แม่นยำ
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                <li>ตรวจสอบแนวโน้มและต้นทุนเป็นระยะ</li>
                <li>วันหยุดสุดสัปดาห์มีโอกาสเพิ่มยอดขาย — พิจารณาโปรโมชันหรือการตลาด</li>
              </ul>
            </div>
          )}
        </OperatingSection>

        {/* Revenue Leaks */}
        <MonitoringErrorBoundary componentName="Portfolio Revenue Leaks">
          <PortfolioRevenueLeaks alerts={safeRawAlerts || []} locale={locale} />
        </MonitoringErrorBoundary>

        {/* Branch breakdown */}
        <MonitoringErrorBoundary componentName="Portfolio Branch Table">
          <PortfolioBranchTable branchScores={branchScores} alerts={safeRawAlerts || []} locale={locale} />
        </MonitoringErrorBoundary>
          </>
        )}

        <OperatingFooterTrust />
      </div>
    </PageLayout>
  );
}

export default function OwnerSummaryPage() {
  return (
    <Suspense fallback={<PageLayout title=""> <LoadingSpinner /> </PageLayout>}>
      <OwnerSummaryContent />
    </Suspense>
  );
}
