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

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { LoadingSpinner } from '../../components/loading-spinner';
import { useHealthScore } from '../../hooks/use-health-score';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useUserSession } from '../../contexts/user-session-context';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useBusinessSetup } from '../../contexts/business-setup-context';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useI18n } from '../../hooks/use-i18n';
import { useTestMode } from '../../providers/test-mode-provider';
import { businessGroupService } from '../../services/business-group-service';
import { getBranchHealthScores } from '../../services/health-score-service';
import { CompanyWhatsWorkingToday } from '../../components/company/company-whats-working-today';
import { CompanyOpportunitiesToday } from '../../components/company/company-opportunities-today';
import { CompanyWatchlistToday } from '../../components/company/company-watchlist-today';
import { MonitoringErrorBoundary } from '../../components/monitoring-error-boundary';
import { useOrganization } from '../../contexts/organization-context';
import { useRbacReady } from '../../hooks/use-route-guard';
import { calculateRevenueExposureFromAlerts } from '../../utils/revenue-exposure-calculator';
import { formatDailySummaryCompactThb } from '../../services/daily-summary-service';
import {
  createEmptyCompanyTodayBundle,
  type CompanyTodayBundle,
} from '../../services/db/company-today-data-service';
import { fetchCompanyTodayDashboard } from '../../services/db/company-today-dashboard-service';
import { fetchCompanyDailySummary } from '../../services/db/company-daily-summary-service';
import { ActivationBlock } from '../../components/activation-block';
import { validateOrganizationScenario } from '../../utils/validation-logger';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { OperatingSection } from '../../components/operating-layer/operating-section';
import { OperatingFooterTrust } from '../../components/operating-layer/operating-footer-trust';
import { CompanyLastUpdated } from '../../components/company/company-last-updated';
import { CompanyBusinessStatusTables } from '../../components/company/company-business-status-tables';
import { CompanyBusinessTrendSummary } from '../../components/company/company-business-trend-summary';
import { CompanyTodaysPriorities } from '../../components/company/company-todays-priorities';
import { CompanyDataConfidence } from '../../components/company/company-data-confidence';
import {
  fetchCompanyBusinessTrendHighlight,
  type CompanyBusinessTrendHighlightRow,
} from '../../services/db/company-business-trends-highlight-service';
import type { CompanyTodayDashboardData } from '../../services/db/company-today-dashboard-service';
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
  const { alerts, loading: alertsLoading, lastUpdated } = useHospitalityAlerts();
  const { alerts: rawAlerts } = useAlertStore();
  const { testMode } = useTestMode();
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const isReady = useRbacReady();
  const [mounted, setMounted] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [companyTodayBundle, setCompanyTodayBundle] = useState<CompanyTodayBundle | null>(null);
  const [companyTodayLoading, setCompanyTodayLoading] = useState(false);
  const [aiDailySummaryText, setAiDailySummaryText] = useState<string | null>(null);
  const [aiDailySummaryLoading, setAiDailySummaryLoading] = useState(false);
  const [companyBusinessTrendRow, setCompanyBusinessTrendRow] = useState<CompanyBusinessTrendHighlightRow | null>(null);
  const [companyBusinessTrendLoading, setCompanyBusinessTrendLoading] = useState(false);
  const [companyDashboard, setCompanyDashboard] = useState<CompanyTodayDashboardData | null>(null);

  /** After first successful load for this key, avoid flipping panel loaders on refreshTrigger-only updates. */
  const companyDashboardHydratedKeyRef = useRef<string>('');

  // PART 1: System validation (development only) - Uses singleton pattern to prevent multiple instances
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 120000 });

  // Handle client-side mounting to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    const timeoutId = setTimeout(() => {
      if (healthScoreLoading || alertsLoading) {
        const hasComputedData =
          groupHealthScore !== null ||
          (rawAlerts && rawAlerts.length > 0) ||
          companyTodayBundle !== null;
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
      setRefreshTrigger((prev) => prev + 1);
    };

    const handleMetricsUpdate = () => {
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

  // Do NOT depend on getBusinessGroup() object identity — it returns a new object every render (JSON parse).
  const groupBranchIds = useMemo(() => {
    if (!mounted || typeof window === 'undefined') return [];
    const bg = businessGroupService.getBusinessGroup();
    if (!bg?.id) return [];
    return businessGroupService
      .getAllBranches()
      .filter((b) => b.businessGroupId === bg.id)
      .map((b) => b.id);
  }, [mounted, refreshTrigger, activeOrganizationId, permissions.organizationId]);

  const organizationIdForData = (
    activeOrganizationId ??
    permissions.organizationId ??
    ''
  ).trim();

  const branchIdsKey = useMemo(() => [...groupBranchIds].sort().join(','), [groupBranchIds]);

  useEffect(() => {
    if (!mounted) return;
    const orgId = organizationIdForData || null;
    if (!orgId) {
      setAiDailySummaryText(null);
      setAiDailySummaryLoading(false);
      return;
    }
    let cancelled = false;
    setAiDailySummaryLoading(true);
    (async () => {
      try {
        const summaryResult = await Promise.race([
          fetchCompanyDailySummary(orgId),
          new Promise<{ summaryText: string | null; error: string | null }>((resolve) =>
            setTimeout(() => resolve({ summaryText: null, error: 'timeout' }), 12000)
          ),
        ]);
        if (!cancelled) {
          setAiDailySummaryText(summaryResult.summaryText);
        }
      } finally {
        if (!cancelled) setAiDailySummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, organizationIdForData, refreshTrigger]);

  useEffect(() => {
    if (!mounted) return;

    if (!organizationIdForData) {
      companyDashboardHydratedKeyRef.current = '';
      setCompanyTodayBundle(null);
      setCompanyDashboard(null);
      setCompanyTodayLoading(false);
      return;
    }

    const dashboardKey = `${organizationIdForData}::${branchIdsKey}::${refreshTrigger}`;
    const showLoaders = companyDashboardHydratedKeyRef.current !== dashboardKey;

    let cancelled = false;
    const DASHBOARD_TIMEOUT_MS = 28000;

    if (showLoaders) {
      setCompanyTodayLoading(true);
    }

    (async () => {
      try {
        const dash = await Promise.race([
          fetchCompanyTodayDashboard(organizationIdForData, groupBranchIds, {
            prioritiesLimit: 5,
            panelLimit: 3,
            locale: locale === 'th' ? 'th' : 'en',
          }),
          new Promise<Awaited<ReturnType<typeof fetchCompanyTodayDashboard>>>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  bundle: createEmptyCompanyTodayBundle(['client_timeout']),
                  priorities: [],
                  whatsWorking: [],
                  opportunities: [],
                  watchlist: [],
                  dataConfidence: null,
                  latestBusinessStatus: [],
                }),
              DASHBOARD_TIMEOUT_MS
            )
          ),
        ]);
        if (!cancelled) {
          setCompanyTodayBundle(dash.bundle);
          setCompanyDashboard(dash);
          companyDashboardHydratedKeyRef.current = dashboardKey;
        }
      } catch {
        if (!cancelled) {
          setCompanyTodayBundle(null);
          setCompanyDashboard(null);
          companyDashboardHydratedKeyRef.current = '';
        }
      } finally {
        if (!cancelled) {
          setCompanyTodayLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mounted, organizationIdForData, branchIdsKey, refreshTrigger, locale]);

  useEffect(() => {
    if (!mounted) return;
    if (!organizationIdForData) {
      setCompanyBusinessTrendRow(null);
      setCompanyBusinessTrendLoading(false);
      return;
    }
    let cancelled = false;
    setCompanyBusinessTrendLoading(true);
    (async () => {
      const r = await Promise.race([
        fetchCompanyBusinessTrendHighlight(organizationIdForData),
        new Promise<CompanyBusinessTrendHighlightRow | null>((resolve) =>
          setTimeout(() => resolve(null), 14000)
        ),
      ]);
      if (!cancelled) {
        setCompanyBusinessTrendRow(r);
        setCompanyBusinessTrendLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, organizationIdForData, refreshTrigger]);

  // Stable id only — do not depend on getBusinessGroup() object identity (new object each render).
  const businessGroupIdForScores = useMemo(() => {
    if (!mounted || typeof window === 'undefined') return null;
    return businessGroupService.getBusinessGroup()?.id ?? null;
  }, [mounted, refreshTrigger, activeOrganizationId, permissions.organizationId]);

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Get branch scores sorted by lowest health score first
  // STEP 1: Recalculates on: metrics update, branch change, testMode change, simulation change
  const branchScores = useMemo(() => {
    if (!mounted || !businessGroupIdForScores || !rawAlerts) return [];

    const roleForScores: 'owner' | 'manager' | 'branch' =
      permissions.role === 'owner' || permissions.role === 'admin' ? 'owner'
      : permissions.role === 'manager' ? 'manager'
      : 'branch';
    const scores = getBranchHealthScores(rawAlerts, businessGroupIdForScores, {
      role: roleForScores,
      organizationId: permissions.organizationId,
      branchIds: permissions.branchIds,
    });

    // Sort by lowest health score first
    return scores.sort((a, b) => a.healthScore - b.healthScore);
  }, [
    rawAlerts,
    businessGroupIdForScores,
    permissions.role,
    permissions.organizationId,
    permissions.branchIds,
    mounted,
    refreshTrigger,
    testMode.version,
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
    const b = companyTodayBundle;
    if (!b) {
      return {
        underperformingCount: 0,
        revenueAtRisk: 0,
        ready: false as const,
      };
    }
    return {
      underperformingCount: b.dailySummary.underperformingBelow80,
      revenueAtRisk: b.dailySummary.revenueAtRiskFromAlertsTodayThb,
      ready: true as const,
    };
  }, [companyTodayBundle]);

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
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[OwnerSummary] Loading states:', {
        healthScoreLoading,
        alertsLoading,
        groupHealthScore: !!groupHealthScore,
        groupHealthScoreValue: groupHealthScore?.healthScore,
        alertsCount: alerts.length,
        rawAlertsCount: safeRawAlerts?.length || 0,
        businessGroupId: businessGroup?.id,
        branchScoresCount: branchScores.length,
      });
    }
  }, [healthScoreLoading, alertsLoading, groupHealthScore, alerts, safeRawAlerts, businessGroup?.id, branchScores.length]);

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
    const hasComputedData =
      groupHealthScore !== null ||
      (safeRawAlerts && safeRawAlerts.length > 0) ||
      companyTodayBundle !== null;
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
    const { underperformingCount, revenueAtRisk, ready } = dailySummary;
    const amountStr = formatDailySummaryCompactThb(revenueAtRisk);
    let sentence: React.ReactNode;
    if (!ready && companyTodayLoading) {
      sentence = locale === 'th' ? 'กำลังโหลดสรุป…' : 'Loading summary…';
    } else if (!ready) {
      sentence =
        locale === 'th'
          ? 'ยังไม่มีข้อมูลสรุป (ไม่มีสาขาในกลุ่ม)'
          : 'No summary yet (no branches in group).';
    } else {
      const n = underperformingCount;
      const hasRisk = revenueAtRisk > 0;
      sentence =
        locale === 'th' ? (
          <>
            {n === 0 && !hasRisk ? (
              <>ไม่มีสาขาที่คะแนนสุขภาพต่ำกว่า 80 และไม่มีตัวเลขรายได้เสี่ยงจากการแจ้งเตือนวันนี้</>
            ) : n === 0 && hasRisk ? (
              <>
                ไม่มีสาขาที่คะแนนสุขภาพต่ำกว่า 80 · ประมาณการรายได้ที่อาจได้รับผลจากการแจ้งเตือนวันนี้รวม{' '}
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>{amountStr}</span>
              </>
            ) : (
              <>
                มี {n} สาขาที่คะแนนสุขภาพต่ำกว่า 80
                {hasRisk ? (
                  <>
                    {' '}
                    · ประมาณการรายได้ที่อาจได้รับผลจากการแจ้งเตือนวันนี้รวม{' '}
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>{amountStr}</span>
                  </>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            {n === 0 && !hasRisk ? (
              <>No branches under the health threshold (80), and no estimated revenue at risk from today&apos;s alerts.</>
            ) : n === 0 && hasRisk ? (
              <>
                No branches under the health threshold (80). Estimated revenue at risk from today&apos;s alerts:{' '}
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>{amountStr}</span>
              </>
            ) : (
              <>
                {n} branch{n === 1 ? '' : 'es'} under the health threshold (under 80).
                {hasRisk ? (
                  <>
                    {' '}
                    Estimated revenue at risk from today&apos;s alerts:{' '}
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>{amountStr}</span>
                  </>
                ) : null}
              </>
            )}
          </>
        );
    }
    const bodyColor = !ready && !companyTodayLoading ? '#6b7280' : '#374151';
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
          {locale === 'th' ? 'สรุปรายวัน' : 'Daily Summary'}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 500,
            color: bodyColor,
            lineHeight: 1.4,
          }}
        >
          {sentence}
        </p>
      </div>
    );
  })();

  const aiSummaryBody =
    aiDailySummaryLoading
      ? locale === 'th'
        ? 'กำลังโหลดสรุป…'
        : 'Loading summary…'
      : (aiDailySummaryText?.trim() ?? '');
  const showAiDailySummaryBlock = aiDailySummaryLoading || aiSummaryBody.length > 0;
  const prioritiesRows = companyDashboard?.priorities ?? [];
  const whatsWorkingRows = companyDashboard?.whatsWorking ?? [];
  const opportunitiesRows = companyDashboard?.opportunities ?? [];
  const watchlistRows = companyDashboard?.watchlist ?? [];
  const dataConfidenceRow = companyDashboard?.dataConfidence ?? null;

  return (
    <PageLayout title="" subtitle="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {showAiDailySummaryBlock ? (
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              lineHeight: 1.5,
              color: aiDailySummaryLoading ? '#64748b' : '#0f172a',
            }}
          >
            {aiSummaryBody}
          </p>
        ) : null}

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

        <CompanyLastUpdated iso={lastUpdated?.toISOString?.()} locale={locale} />

        {dailySummaryCard}

        <CompanyDataConfidence
          row={dataConfidenceRow}
          loading={companyTodayLoading}
          locale={locale}
        />

        <MonitoringErrorBoundary componentName="Today's Priorities">
          <CompanyTodaysPriorities rows={prioritiesRows} loading={companyTodayLoading} locale={locale} />
        </MonitoringErrorBoundary>

        {!groupHealthScore && <ActivationBlock />}

        {businessGroup && (
          <OperatingSection
            title={locale === 'th' ? 'สถานะธุรกิจล่าสุด' : 'Latest business status'}
            subtitle={
              locale === 'th'
                ? 'แสดงข้อมูลล่าสุดของแต่ละสาขา'
                : 'Shows latest available data per branch.'
            }
          >
            <MonitoringErrorBoundary componentName="Company Business Status">
              <CompanyBusinessStatusTables
                rows={companyDashboard?.latestBusinessStatus ?? []}
                locale={locale}
              />
            </MonitoringErrorBoundary>
          </OperatingSection>
        )}

        <OperatingSection title={locale === 'th' ? 'แนวโน้มธุรกิจ' : 'Business trends'}>
          <MonitoringErrorBoundary componentName="Company business trends">
            <CompanyBusinessTrendSummary
              row={companyBusinessTrendRow}
              loading={companyBusinessTrendLoading}
              locale={locale}
            />
          </MonitoringErrorBoundary>
        </OperatingSection>

        <OperatingSection
          title={locale === 'th' ? 'สิ่งที่ทำได้ดี' : "What's Working"}
          subtitle={
            locale === 'th'
              ? 'เมื่อแนวโน้มล่าสุดเป็นบวก'
              : 'When recent trends are moving in a good direction.'
          }
        >
          <MonitoringErrorBoundary componentName="What's Working">
            <CompanyWhatsWorkingToday
              rows={whatsWorkingRows}
              loading={companyTodayLoading}
              locale={locale}
              organizationId={organizationIdForData}
            />
          </MonitoringErrorBoundary>
        </OperatingSection>

        <OperatingSection
          title={locale === 'th' ? 'โอกาส' : 'Opportunities'}
          subtitle={
            locale === 'th'
              ? 'แนวคิดเชิงรุกจากสัญญาณความต้องการ'
              : 'Proactive moves when demand signals are strong.'
          }
        >
          <MonitoringErrorBoundary componentName="Opportunities">
            <CompanyOpportunitiesToday
              rows={opportunitiesRows}
              loading={companyTodayLoading}
              locale={locale}
              organizationId={organizationIdForData}
            />
          </MonitoringErrorBoundary>
        </OperatingSection>

        <OperatingSection
          title={locale === 'th' ? 'สัญญาณเตือนล่วงหน้า' : 'Watchlist'}
          subtitle={
            locale === 'th'
              ? 'แนวโน้มอ่อนตัวที่ควรจับตา (ยังไม่ใช่เหตุเร่งด่วน)'
              : 'Early warning signals to monitor (not urgent yet).'
          }
        >
          <MonitoringErrorBoundary componentName="Watchlist">
            <CompanyWatchlistToday
              rows={watchlistRows}
              loading={companyTodayLoading}
              locale={locale}
              organizationId={organizationIdForData}
            />
          </MonitoringErrorBoundary>
        </OperatingSection>

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
