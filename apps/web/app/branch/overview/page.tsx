/**
 * Branch Overview Page - Decision-Focused Dashboard
 * 
 * 5-block layout: Health Snapshot → Revenue Leaks → Performance Movement → Active Alerts → Recommended Actions
 */
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useMonitoring } from '../../hooks/use-monitoring';
import { useResolvedBranchData } from '../../hooks/use-resolved-branch-data';
import { businessGroupService } from '../../services/business-group-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { MonitoringStatusCard } from '../../components/monitoring-status-card';
import { CriticalAlertsSnapshot } from '../../components/alerts/critical-alerts-snapshot';
import { MonitoringErrorBoundary } from '../../components/monitoring-error-boundary';
import { AlertsFallback } from '../../components/alerts-fallback';
import { formatCurrency } from '../../utils/formatting';
import { getSeverityColor, getSeverityLabel } from '../../utils/alert-utils';
import { safeNumber } from '../../utils/safe-number';
import { calculateRevenueExposure } from '../../utils/revenue-exposure-calculator';
import { runPlatformAudit } from '../../services/platform-audit-service';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { useIntelligenceStageBranch } from '../../hooks/use-intelligence-stage';
import { isFullyActive } from '../../utils/intelligence-stage';
import { useUserRole } from '../../contexts/user-role-context';
import { OperatingHeader } from '../../components/operating-layer/operating-header';
import { OperatingSection } from '../../components/operating-layer/operating-section';
import { DailyPrompt } from '../../components/operating-layer/daily-prompt';
import { BranchTodaySummary } from '../../components/operating-layer/branch-today-summary';
import { addDays } from '../../utils/today-summary-utils';
import { OperatingFooterTrust } from '../../components/operating-layer/operating-footer-trust';
import { getHospitalityLabels } from '../../utils/hospitality-labels';
import {
  getOperatingStatusData,
  getFnbOperatingStatus,
  getTodaySummary,
  getBranchTrendSeriesWithFallback,
  getAccommodationProfitabilitySignal,
  getFnbProfitabilitySignal,
  type OperatingStatusRow,
  type FnbOperatingStatusRow,
  type TodaySummaryRow,
  type BranchTrendSeries,
  type AccommodationProfitabilitySignal,
  type FnbProfitabilitySignal,
} from '../../services/db/latest-metrics-service';
import { TrendChartCard } from '../../components/charts/trend-chart-card';
import { DecisionTrendChart } from '../../components/charts/decision-trend-chart';
import { trendInsightDual } from '../../utils/trend-chart-insights';
import { getAccommodationMonthlyFixedCostStatus, getFreshnessDatesFromRawTable } from '../../services/db/daily-metrics-service';
import { getDataFreshness } from '../../lib/dataFreshness';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  getAccommodationConfidenceLevel,
  getEarlySignalFromAccommodationEarlySignal,
  getBranchLearningStatus,
  type BranchLearningStatusRow,
} from '../../services/db/branch-metrics-info-service';
import { getBranchRecommendationsFromKpi } from '../../services/db/kpi-analytics-service';
import { getHealthScoreFromAccommodationHealthToday } from '../../services/db/health-score-kpi-service';
import { useAnomalySignals } from '../../hooks/use-anomaly-signals';
import {
  fetchTodayBranchPriorities,
  type TodayBranchPriorityRow,
} from '../../services/db/today-branch-priorities-service';
import type { ExtendedAlertContract } from '../../services/monitoring-service';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { DailyMetric } from '../../models/daily-metrics';

export default function BranchOverviewPage() {
  // ALL HOOKS MUST BE CALLED FIRST - NO CONDITIONALS, NO EARLY RETURNS
  const { locale, t } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch, isLoading: branchLoading } = useCurrentBranch();
  const { alerts: rawAlerts } = useAlertStore();
  const { alerts: hospitalityAlerts, loading, error, lastUpdated, alertsInitializing } = useHospitalityAlerts();
  const { status: monitoringStatus } = useMonitoring();
  const { role } = useUserRole();
  const hideFinancials = role?.canViewOnly === true;

  const [mounted, setMounted] = useState(false);
  // Auto-select first branch if none selected (fallback for timing issues)
  const [attemptingAutoSelect, setAttemptingAutoSelect] = useState(false);
  // Operating Status: accommodation = accommodation_latest_metrics; F&B = fnb_operating_status only
  const [operatingStatusData, setOperatingStatusData] = useState<OperatingStatusRow | null>(null);
  const [fnbOperatingStatus, setFnbOperatingStatus] = useState<FnbOperatingStatusRow | null>(null);
  // KPI layer: recommendations from branch_recommendations
  const [kpiRecommendations, setKpiRecommendations] = useState<{ recommendation: string; category?: string }[]>([]);
  // Owner dashboard: monthly fixed cost not configured (accommodation, owner/super_admin only)
  const [monthlyFixedCostStatus, setMonthlyFixedCostStatus] = useState<{ hasValue: boolean; dataDaysCount: number } | null>(null);
  // Business Health Score card: from accommodation_health_today or fnb_health_today only (no frontend calculation)
  const [healthScore, setHealthScore] = useState<number | null>(null);
  // Confidence card: accommodation uses accommodation_data_coverage.confidence_level
  const [confidenceLevelFromCoverage, setConfidenceLevelFromCoverage] = useState<string | null>(null);
  // Early Signal card: accommodation uses accommodation_anomaly_signals.early_signal
  const [accommodationEarlySignal, setAccommodationEarlySignal] = useState<string | null>(null);
  // Learning: branch_learning_status.learning_days (distinct dates ∪ acc + fnb)
  const [learningStatus, setLearningStatus] = useState<BranchLearningStatusRow | null>(null);
  // Today summary view (date-based joins): revenue_delta_day, occupancy_delta_week for Latest Performance
  const [todaySummaryRow, setTodaySummaryRow] = useState<TodaySummaryRow | null>(null);
  // Freshness: metric_date from raw table only (accommodation_daily_metrics / fnb_daily_metrics)
  const [freshnessDatesFromRaw, setFreshnessDatesFromRaw] = useState<string[]>([]);
  const [freshnessLoaded, setFreshnessLoaded] = useState(false);
  // Today's Priorities: today_branch_priorities (current branch)
  const [branchPriorities, setBranchPriorities] = useState<TodayBranchPriorityRow[]>([]);
  const [branchPrioritiesLoading, setBranchPrioritiesLoading] = useState(true);
  const [branchWhatsWorkingRows, setBranchWhatsWorkingRows] = useState<string[]>([]);
  const [branchOpportunitiesRows, setBranchOpportunitiesRows] = useState<string[]>([]);
  const [branchWatchlistRows, setBranchWatchlistRows] = useState<string[]>([]);
  const [branchSectionLoading, setBranchSectionLoading] = useState(false);
  const [driverTrendSeries, setDriverTrendSeries] = useState<BranchTrendSeries | null>(null);
  const [accProfitSignal, setAccProfitSignal] = useState<AccommodationProfitabilitySignal | null>(null);
  const [fnbProfitSignal, setFnbProfitSignal] = useState<FnbProfitabilitySignal | null>(null);

  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });
  const { coverageDays, stage } = useIntelligenceStageBranch(branch?.id ?? null, branch?.moduleType);
  // Early signal from branch_anomaly_signals (intelligence engine)
  const { anomaly: anomalySignal, confidenceScore: anomalyConfidenceScore, anomalyAlertsAsContracts } = useAnomalySignals(
    branch?.id ?? null,
    locale === 'th' ? 'th' : 'en'
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // PHASE 6: Run platform audit on branch load (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && branch?.id && mounted) {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (businessGroup) {
        // Run audit after a delay to allow data to load
        const timeoutId = setTimeout(() => {
          runPlatformAudit(branch.id, businessGroup.id).catch(err => {
            console.error('[PLATFORM_AUDIT] Failed to run audit:', err);
          });
        }, 2000);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [branch?.id, mounted]);

  // STABILITY: Safe alert access - never mutate, always copy
  const safeRawAlerts = useMemo(() => {
    if (!rawAlerts || !Array.isArray(rawAlerts)) return [];
    return [...rawAlerts]; // Create copy, never mutate original
  }, [rawAlerts]);

  const safeHospitalityAlerts = useMemo(() => {
    if (!hospitalityAlerts || !Array.isArray(hospitalityAlerts)) return [];
    return [...hospitalityAlerts]; // Create copy, never mutate original
  }, [hospitalityAlerts]);

  // Get branch alerts (all types, not filtered by business type for overview)
  // FIX: Deduplicate by code at source to prevent duplicates everywhere
  const branchAlerts = useMemo(() => {
    if (!branch || !branch.id) return [];
    // Use rawAlerts from store if available, otherwise use hospitalityAlerts
    const alertsToUse = safeRawAlerts.length > 0 ? safeRawAlerts : safeHospitalityAlerts;
    const filtered = alertsToUse.filter(alert => {
      const alertBranchId = (alert as any).branchId;
      return alertBranchId === branch.id;
    });
    
    // FIX: Deduplicate by code first (most reliable), then by ID, then by content
    const alertsByCode = new Map<string, AlertContract>();
    filtered.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert as AlertContract);
      }
    });
    
    // Deduplicate by ID (keep first occurrence)
    const seenIds = new Set<string>();
    const alertsById = Array.from(alertsByCode.values()).filter(alert => {
      if (seenIds.has(alert.id)) {
        return false;
      }
      seenIds.add(alert.id);
      return true;
    });
    
    // Deduplicate by content (message + severity + domain)
    const seenContent = new Set<string>();
    return alertsById.filter(alert => {
      const contentKey = `${alert.message || ''}|${alert.severity}|${alert.domain || ''}`;
      if (seenContent.has(contentKey)) {
        return false;
      }
      seenContent.add(contentKey);
      return true;
    });
  }, [branch, safeRawAlerts, safeHospitalityAlerts]);

  // Merge anomaly alerts when available; for now use branch alerts only
  const mergedBranchAlerts = useMemo(() => {
    if (!branch?.id) return [];
    const byId = new Map<string, AlertContract>();
    branchAlerts.forEach(a => byId.set(a.id, a));
    anomalyAlertsAsContracts.forEach(a => {
      if (!byId.has(a.id)) byId.set(a.id, a);
    });
    return Array.from(byId.values());
  }, [branch?.id, branchAlerts]);

  // PHASE 3: Calculate performance trends from daily_metrics
  // Compare last 7 days vs previous 7 days (requires minimum 14 days)
  const [dailyMetricsForTrends, setDailyMetricsForTrends] = useState<DailyMetric[] | null>(null);
  

  // Business Health Score comes only from Supabase (accommodation_health_today / fnb_health_today). No frontend calculation.

  // Calculate alert counts (include anomaly alerts for display)
  const alertCounts = useMemo(() => {
    return {
      critical: mergedBranchAlerts.filter(a => a.severity === 'critical').length,
      warning: mergedBranchAlerts.filter(a => a.severity === 'warning').length,
      informational: mergedBranchAlerts.filter(a => a.severity === 'informational').length,
      total: mergedBranchAlerts.length,
    };
  }, [mergedBranchAlerts]);

  // Top 5 alerts for “What needs attention today” (severity DESC, then confidence DESC)
  const topAlertsForToday = useMemo(() => {
    const order: Record<string, number> = { critical: 0, warning: 1, informational: 2 };
    return [...mergedBranchAlerts]
      .sort((a, b) => {
        const sa = order[a.severity] ?? 3;
        const sb = order[b.severity] ?? 3;
        if (sa !== sb) return sa - sb;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      })
      .slice(0, 5);
  }, [mergedBranchAlerts]);

  // STABILITY: Guard revenueImpact everywhere
  const safeRevenueImpact = (alert: AlertContract): number => {
    const extended = alert as ExtendedAlertContract;
    const impact = extended?.revenueImpact;
    return typeof impact === 'number' && !isNaN(impact) && isFinite(impact) && impact > 0 ? impact : 0;
  };

  // STEP 3: Use resolved branch data (single source of truth)
  const branchMetrics = useResolvedBranchData(branch?.id);
  
  // Calculate total revenue exposure using new calculator
  const revenueExposure = useMemo(() => {
    if (!branchMetrics || !mergedBranchAlerts.length) {
      return { totalMonthlyLeakage: 0, leakageByCategory: { revenue: 0, margin: 0, cost: 0, cash: 0 }, exposurePercentOfRevenue: 0 };
    }
    return calculateRevenueExposure(branchMetrics, mergedBranchAlerts as AlertContract[]);
  }, [branchMetrics, mergedBranchAlerts]);

  const totalRevenueAtRisk = revenueExposure.totalMonthlyLeakage;

  // STABILITY: All sorting in useMemo, never mutate original array
  // Get top revenue leaks sorted by calculated revenue exposure
  // FIX: Deduplicate alerts by code before calculating exposure
  const topRevenueLeaks = useMemo(() => {
    if (!mergedBranchAlerts.length || !branchMetrics) return [];

    // FIX: Deduplicate alerts by code first (using Map for unique codes)
    const alertsByCode = new Map<string, AlertContract>();
    mergedBranchAlerts.forEach(alert => {
      // Use alert.code if available, otherwise use id
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    const uniqueAlerts = Array.from(alertsByCode.values());

    // Create copy for sorting
    const alertsCopy = [...uniqueAlerts] as AlertContract[];
    
    // Calculate exposure for each alert individually
    const alertsWithExposure = alertsCopy.map(alert => {
      const exposure = calculateRevenueExposure(branchMetrics, [alert as AlertContract]);
      return {
        alert,
        exposure: exposure.totalMonthlyLeakage,
      };
    });

    // Sort by exposure descending, then by severity
    alertsWithExposure.sort((a, b) => {
      if (b.exposure !== a.exposure) return b.exposure - a.exposure;
      
      // Secondary sort by severity
      const severityOrder: Record<string, number> = { critical: 3, warning: 2, informational: 1 };
      return (severityOrder[b.alert.severity] || 0) - (severityOrder[a.alert.severity] || 0);
    });

    // Return top 3-5 alerts with highest exposure
    // Include alerts even with 0 exposure if they're critical/warning (for visibility)
    const topAlerts = alertsWithExposure
      .filter(item => item.exposure > 0 || item.alert.severity === 'critical' || item.alert.severity === 'warning')
      .slice(0, 5)
      .map(item => item.alert);

    return topAlerts;
  }, [mergedBranchAlerts, branchMetrics]);

  // Get health score trend (30 days)
  const healthScoreTrend = useMemo(() => {
    if (!branch || !branch.id || typeof window === 'undefined') return null;
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


  // Auto-select first branch if none selected (fallback for timing issues)
  useEffect(() => {
    if (!branchLoading && !branch && mounted && !attemptingAutoSelect) {
      setAttemptingAutoSelect(true);
      const businessGroup = businessGroupService.getBusinessGroup();
      if (businessGroup) {
        const branches = businessGroupService.getAllBranches().filter(
          b => b.businessGroupId === businessGroup.id
        );
        if (branches.length > 0) {
          businessGroupService.setCurrentBranch(branches[0].id);
          // Dispatch event to trigger hook update
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('branchSelectionChanged'));
          }
          // Reset flag after a short delay to allow hook to update
          setTimeout(() => {
            setAttemptingAutoSelect(false);
          }, 500);
        } else {
          setAttemptingAutoSelect(false);
        }
      } else {
        setAttemptingAutoSelect(false);
      }
    }
  }, [branch, branchLoading, mounted, attemptingAutoSelect]);
  
  // Fetch daily metrics for performance trends
  useEffect(() => {
    if (!branch?.id) return;
    
    const fetchDailyMetrics = async () => {
      try {
        const { getDailyMetrics } = require('../../services/db/daily-metrics-service');
        const metrics = await getDailyMetrics(branch.id, 40);
        setDailyMetricsForTrends(metrics);
      } catch (e) {
        console.error('[PerformanceTrends] Failed to fetch daily metrics:', e);
        setDailyMetricsForTrends([]);
      }
    };
    
    fetchDailyMetrics();
  }, [branch?.id]);

  useEffect(() => {
    if (!branch?.id || (branch.moduleType !== 'accommodation' && branch.moduleType !== 'fnb')) {
      setDriverTrendSeries(null);
      return;
    }
    getBranchTrendSeriesWithFallback(branch.id, 30)
      .then((series) => setDriverTrendSeries(series ?? null))
      .catch(() => setDriverTrendSeries(null));
  }, [branch?.id, branch?.moduleType]);

  // Operating Status: F&B = fnb_operating_status + fnb_health_today; accommodation = accommodation_latest_metrics + confidence + early signal + accommodation_health_today
  const refreshOperatingStatus = useCallback(() => {
    if (!branch?.id) return;
    setBranchPrioritiesLoading(true);
    setFreshnessLoaded(false);
    if (branch.moduleType !== 'accommodation') setAccProfitSignal(null);
    if (branch.moduleType !== 'fnb') setFnbProfitSignal(null);
    if (branch.moduleType === 'fnb') {
      setOperatingStatusData(null);
      getFnbOperatingStatus(branch.id).then(setFnbOperatingStatus);
      getFnbProfitabilitySignal(branch.id).then(setFnbProfitSignal);
    } else {
      setFnbOperatingStatus(null);
      getOperatingStatusData(branch.id, 'accommodation').then(setOperatingStatusData);
      if (branch.moduleType === 'accommodation') {
        getAccommodationConfidenceLevel(branch.id).then(setConfidenceLevelFromCoverage);
        getEarlySignalFromAccommodationEarlySignal(branch.id).then(setAccommodationEarlySignal);
        getHealthScoreFromAccommodationHealthToday(branch.id).then(setHealthScore);
        getAccommodationProfitabilitySignal(branch.id).then(setAccProfitSignal);
      }
    }
    getBranchLearningStatus(branch.id).then(setLearningStatus);
    getTodaySummary(branch.id).then(setTodaySummaryRow);
    getFreshnessDatesFromRawTable(branch.id, branch.moduleType).then((dates) => {
      setFreshnessDatesFromRaw(dates);
      setFreshnessLoaded(true);
    });
    fetchTodayBranchPriorities(branch.id, branch.moduleType, 3)
      .then((rows) => {
        setBranchPriorities(rows);
        setBranchPrioritiesLoading(false);
      })
      .catch(() => {
        setBranchPriorities([]);
        setBranchPrioritiesLoading(false);
      });
  }, [branch?.id, branch?.moduleType]);

  useEffect(() => {
    if (!branch?.id) {
      setBranchPriorities([]);
      setBranchPrioritiesLoading(false);
      setFreshnessDatesFromRaw([]);
      setFreshnessLoaded(false);
      setAccProfitSignal(null);
      setFnbProfitSignal(null);
      return;
    }
    refreshOperatingStatus();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshOperatingStatus();
    };
    const onMetricsSaved = (e: Event) => {
      const detail = (e as CustomEvent<{ branchId: string }>).detail;
      if (detail?.branchId === branch?.id) {
        refreshOperatingStatus();
        getBranchLearningStatus(branch.id).then(setLearningStatus);
        fetchTodayBranchPriorities(branch.id, branch.moduleType, 3).then(setBranchPriorities);
        if (branch.moduleType === 'accommodation') {
          getAccommodationMonthlyFixedCostStatus(branch.id).then((s) => {
            setMonthlyFixedCostStatus({ hasValue: s.hasValue, dataDaysCount: s.dataDaysCount });
          });
          getAccommodationConfidenceLevel(branch.id).then(setConfidenceLevelFromCoverage);
          getEarlySignalFromAccommodationEarlySignal(branch.id).then(setAccommodationEarlySignal);
          getHealthScoreFromAccommodationHealthToday(branch.id).then(setHealthScore);
          getAccommodationProfitabilitySignal(branch.id).then(setAccProfitSignal);
        }
        if (branch.moduleType === 'fnb') {
          getFnbOperatingStatus(branch.id).then(setFnbOperatingStatus);
          getFnbProfitabilitySignal(branch.id).then(setFnbProfitSignal);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('aurasea:metrics-saved', onMetricsSaved);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('aurasea:metrics-saved', onMetricsSaved);
    };
  }, [branch?.id, branch?.moduleType, refreshOperatingStatus]);

  useEffect(() => {
    if (!branch?.id) return;
    getBranchRecommendationsFromKpi(branch.id).then((rows) => {
      setKpiRecommendations(rows.map((r) => ({ recommendation: String(r.recommendation ?? ''), category: r.category ?? undefined })));
    }).catch(() => setKpiRecommendations([]));
  }, [branch?.id]);

  // Business Health Score card: from accommodation_health_today (accommodation) or fnb_health_today (F&B) only
  useEffect(() => {
    if (!branch?.id) return;
    if (branch.moduleType === 'accommodation') {
      getHealthScoreFromAccommodationHealthToday(branch.id).then(setHealthScore);
    } else if (branch.moduleType === 'fnb') {
      setHealthScore(fnbOperatingStatus?.health_score != null ? Number(fnbOperatingStatus.health_score) : null);
    } else {
      setHealthScore(null);
    }
  }, [branch?.id, branch?.moduleType, fnbOperatingStatus?.health_score]);

  // Confidence card: accommodation uses accommodation_data_coverage.confidence_level
  useEffect(() => {
    if (!branch?.id || branch.moduleType !== 'accommodation') {
      setConfidenceLevelFromCoverage(null);
      return;
    }
    getAccommodationConfidenceLevel(branch.id).then(setConfidenceLevelFromCoverage);
  }, [branch?.id, branch?.moduleType]);

  // Early Signal card: accommodation uses accommodation_early_signal view
  useEffect(() => {
    if (!branch?.id || branch.moduleType !== 'accommodation') {
      setAccommodationEarlySignal(null);
      return;
    }
    getEarlySignalFromAccommodationEarlySignal(branch.id).then(setAccommodationEarlySignal);
  }, [branch?.id, branch?.moduleType]);

  // Learning status from branch_learning_status
  useEffect(() => {
    if (!branch?.id) return;
    getBranchLearningStatus(branch.id).then(setLearningStatus);
  }, [branch?.id]);

  const isOwnerOrSuperAdmin = role?.isSuperAdmin === true || role?.effectiveRole === 'owner';
  const isAccommodationBranch = branch?.moduleType === 'accommodation';
  useEffect(() => {
    if (!branch?.id || !isOwnerOrSuperAdmin || !isAccommodationBranch) {
      setMonthlyFixedCostStatus(null);
      return;
    }
    getAccommodationMonthlyFixedCostStatus(branch.id).then((s) => {
      setMonthlyFixedCostStatus({ hasValue: s.hasValue, dataDaysCount: s.dataDaysCount });
    });
  }, [branch?.id, isOwnerOrSuperAdmin, isAccommodationBranch]);

  const performanceTrends = useMemo(() => {
    if (!branch?.id) return null;
    
    try {
      // Use dailyHistory if available, otherwise use fetched dailyMetrics
      let history: {
        dates: string[];
        revenue: number[];
        costs: number[];
        cashBalance: number[];
        occupancy?: number[];
        customers?: number[];
      } | null = null;
      
      if (branchMetrics?.dailyHistory) {
        history = branchMetrics.dailyHistory;
      } else if (dailyMetricsForTrends && dailyMetricsForTrends.length > 0) {
        // Build dailyHistory structure from daily metrics
        const sorted = [...dailyMetricsForTrends].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        history = {
          dates: sorted.map(m => m.date),
          revenue: sorted.map(m => m.revenue || 0),
          costs: sorted.map(m => m.cost || 0),
          cashBalance: sorted.map(m => m.cashBalance || 0),
          occupancy: sorted.map(m => {
            // Calculate occupancy from roomsSold and roomsAvailable
            if (m.roomsAvailable && m.roomsAvailable > 0 && m.roomsSold) {
              return (m.roomsSold / m.roomsAvailable) * 100; // As percentage
            }
            return undefined;
          }).filter((v): v is number => v !== undefined),
          customers: sorted.map(m => m.customers).filter((v): v is number => v !== undefined),
        };
      }
      
      if (!history || !history.dates || history.dates.length < 14) {
        return null;
      }

      const dataLength = history.dates.length;
      
      // Last 7 days (most recent)
      const last7DaysRevenue = history.revenue.slice(-7);
      const last7DaysCosts = history.costs.slice(-7);
      const last7DaysCash = history.cashBalance.slice(-7);
      
      // Previous 7 days (7-14 days ago)
      const prev7DaysRevenue = history.revenue.slice(-14, -7);
      const prev7DaysCosts = history.costs.slice(-14, -7);
      const prev7DaysCash = history.cashBalance.slice(-14, -7);
      
      // Calculate averages
      const last7RevenueAvg = last7DaysRevenue.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
      const prev7RevenueAvg = prev7DaysRevenue.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
      
      const last7CostsAvg = last7DaysCosts.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
      const prev7CostsAvg = prev7DaysCosts.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
      
      const last7CashAvg = last7DaysCash.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
      const prev7CashAvg = prev7DaysCash.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
      
      // Calculate percentage changes (7-day slope)
      const revenueTrend = prev7RevenueAvg > 0
        ? ((last7RevenueAvg - prev7RevenueAvg) / prev7RevenueAvg) * 100
        : 0;
      
      const costTrend = prev7CostsAvg > 0
        ? ((last7CostsAvg - prev7CostsAvg) / prev7CostsAvg) * 100
        : 0;
      
      const cashTrend = prev7CashAvg > 0
        ? ((last7CashAvg - prev7CashAvg) / prev7CashAvg) * 100
        : 0;
      
      // Utilization trend (occupancy or customers)
      let utilizationTrend = 0;
      if (history.occupancy && history.occupancy.length >= 14) {
        const last7Occupancy = history.occupancy.slice(-7);
        const prev7Occupancy = history.occupancy.slice(-14, -7);
        const last7OccAvg = last7Occupancy.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
        const prev7OccAvg = prev7Occupancy.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
        utilizationTrend = prev7OccAvg > 0
          ? ((last7OccAvg - prev7OccAvg) / prev7OccAvg) * 100
          : 0;
      } else if (history.customers && history.customers.length >= 14) {
        const last7Customers = history.customers.slice(-7);
        const prev7Customers = history.customers.slice(-14, -7);
        const last7CustAvg = last7Customers.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
        const prev7CustAvg = prev7Customers.reduce((sum, v) => sum + safeNumber(v, 0), 0) / 7;
        utilizationTrend = prev7CustAvg > 0
          ? ((last7CustAvg - prev7CustAvg) / prev7CustAvg) * 100
          : 0;
      }

      return {
        revenueTrend: safeNumber(Math.round(revenueTrend * 10) / 10, 0),
        costTrend: safeNumber(Math.round(costTrend * 10) / 10, 0),
        utilizationTrend: safeNumber(Math.round(utilizationTrend * 10) / 10, 0),
        cashTrend: safeNumber(Math.round(cashTrend * 10) / 10, 0),
      };
    } catch (e) {
      console.error('[PerformanceTrends] Failed to calculate trends:', e);
      return null;
    }
  }, [branchMetrics, dailyMetricsForTrends]);

  // Performance Drivers (top 2 charts from Trends) — use same data source as Trends so charts match
  const isAccommodation = branch?.moduleType === 'accommodation';
  const isFnb = branch?.moduleType === 'fnb';
  const driverChartData = useMemo(() => {
    if (driverTrendSeries && driverTrendSeries.revenue.length >= 2) {
      const avgTicket = driverTrendSeries.revenue.map((r, i) => {
        const c = driverTrendSeries.customers[i] ?? 0;
        return c > 0 ? r / c : 0;
      });
      return {
        dates: driverTrendSeries.dates,
        revenue: driverTrendSeries.revenue,
        occupancy: driverTrendSeries.occupancy,
        customers: driverTrendSeries.customers,
        adr: driverTrendSeries.adr,
        revpar: driverTrendSeries.revpar,
        avgTicket,
      };
    }
    const daily = dailyMetricsForTrends ?? [];
    if (daily.length < 2) return null;
    const sorted = [...daily].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const dates = sorted.map((m) => m.date);
    const revenue = sorted.map((m) => m.revenue ?? 0);
    const occupancy = sorted.map((m) => {
      const avail = m.roomsAvailable ?? 0;
      if (avail <= 0) return 0;
      return ((m.roomsSold ?? 0) / avail) * 100;
    });
    const customers = sorted.map((m) => m.customers ?? 0);
    const adr = sorted.map((m) => {
      if (m.adr != null && m.adr > 0) return m.adr;
      const sold = m.roomsSold ?? 0;
      return sold > 0 ? (m.revenue ?? 0) / sold : 0;
    });
    const totalRooms = branchMetrics?.modules?.accommodation?.totalRoomsAvailable ?? 0;
    const revpar = totalRooms > 0 ? revenue.map((r) => r / totalRooms) : sorted.map(() => 0);
    const avgTicket = sorted.map((m, i) => {
      const c = customers[i] ?? 0;
      return c > 0 ? revenue[i]! / c : 0;
    });
    return { dates, revenue, occupancy, customers, adr, revpar, avgTicket };
  }, [driverTrendSeries, dailyMetricsForTrends, branchMetrics?.modules?.accommodation?.totalRoomsAvailable]);

  const performanceDriverInsights = useMemo(() => {
    const loc = locale === 'th' ? 'th' : 'en';
    if (!driverChartData) return null;
    if (isAccommodation) {
      return {
        kind: 'acc' as const,
        occAdr: trendInsightDual(
          { values: driverChartData.occupancy, metric: 'occupancy' },
          driverChartData.adr.length === driverChartData.occupancy.length
            ? { values: driverChartData.adr, metric: 'adr' }
            : null,
          loc
        ),
        occRev: trendInsightDual(
          { values: driverChartData.occupancy, metric: 'occupancy' },
          driverChartData.revenue.length === driverChartData.occupancy.length
            ? { values: driverChartData.revenue, metric: 'revenue' }
            : null,
          loc
        ),
      };
    }
    if (isFnb) {
      return {
        kind: 'fnb' as const,
        custRev: trendInsightDual(
          { values: driverChartData.customers, metric: 'customers' },
          driverChartData.revenue.length === driverChartData.customers.length
            ? { values: driverChartData.revenue, metric: 'revenue' }
            : null,
          loc
        ),
        custTicket: trendInsightDual(
          { values: driverChartData.customers, metric: 'customers' },
          driverChartData.avgTicket.length === driverChartData.customers.length
            ? { values: driverChartData.avgTicket, metric: 'avgTicket' }
            : null,
          loc
        ),
      };
    }
    return null;
  }, [driverChartData, isAccommodation, isFnb, locale]);

  const branchPrioritiesTop = useMemo(() => branchPriorities.slice(0, 3), [branchPriorities]);

  const revenueNow = useMemo(() => {
    const ts = todaySummaryRow as any;
    const fnb = fnbOperatingStatus as any;
    const acc = operatingStatusData as any;
    return Number(
      ts?.total_revenue ??
        ts?.revenue ??
        fnb?.revenue_thb ??
        fnb?.revenue ??
        acc?.revenue_thb ??
        acc?.revenue ??
        0
    );
  }, [todaySummaryRow, fnbOperatingStatus, operatingStatusData]);

  const customersNow = useMemo(() => {
    const ts = todaySummaryRow as any;
    const fnb = fnbOperatingStatus as any;
    return Number(ts?.customers ?? fnb?.customers ?? fnb?.total_customers ?? 0);
  }, [todaySummaryRow, fnbOperatingStatus]);

  const roomsSoldNow = useMemo(() => {
    const ts = todaySummaryRow as any;
    const acc = operatingStatusData as any;
    return Number(ts?.utilized ?? ts?.rooms_sold ?? acc?.rooms_sold ?? 0);
  }, [todaySummaryRow, operatingStatusData]);

  const hasRevenueActivity = useMemo(
    () => revenueNow > 0 || (driverChartData?.revenue?.some((v) => safeNumber(v, 0) > 0) ?? false),
    [revenueNow, driverChartData]
  );

  const branchWorkingFallbackRows = useMemo(() => {
    const rows: string[] = [];
    if (customersNow > 0) rows.push('Customer traffic is steady');
    if (roomsSoldNow > 0) rows.push('Room demand is stable');
    if (revenueNow > 0) rows.push('Revenue flow is consistent');
    if (rows.length === 0) {
      rows.push('Operations running smoothly');
    }
    return rows.slice(0, 3);
  }, [customersNow, roomsSoldNow, revenueNow]);

  useEffect(() => {
    if (!branch?.id) {
      setBranchWhatsWorkingRows([]);
      setBranchOpportunitiesRows([]);
      setBranchWatchlistRows([]);
      setBranchSectionLoading(false);
      return;
    }
    if (!isSupabaseAvailable()) {
      setBranchWhatsWorkingRows([]);
      setBranchOpportunitiesRows(['No clear opportunities today']);
      setBranchWatchlistRows(['No early warning signals detected']);
      setBranchSectionLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setBranchWhatsWorkingRows([]);
      setBranchOpportunitiesRows(['No clear opportunities today']);
      setBranchWatchlistRows(['No early warning signals detected']);
      setBranchSectionLoading(false);
      return;
    }

    let cancelled = false;
    setBranchSectionLoading(true);
    (async () => {
      try {
        const [workingRes, oppRes, watchRes] = await Promise.race([
          Promise.all([
            supabase
              .from('whats_working_today')
              .select('highlight_text')
              .eq('branch_id', branch.id)
              .order('sort_score', { ascending: false })
              .limit(3),
            supabase
              .from('opportunities_today')
              .select('opportunity_text')
              .eq('branch_id', branch.id)
              .order('sort_score', { ascending: false })
              .limit(3),
            supabase
              .from('watchlist_today')
              .select('warning_text')
              .eq('branch_id', branch.id)
              .order('sort_score', { ascending: false })
              .limit(3),
          ]),
          new Promise<
            [
              { data: null; error: Error | null },
              { data: null; error: Error | null },
              { data: null; error: Error | null }
            ]
          >((resolve) =>
            setTimeout(
              () =>
                resolve([
                  { data: null, error: new Error('timeout') },
                  { data: null, error: new Error('timeout') },
                  { data: null, error: new Error('timeout') },
                ]),
              12000
            )
          ),
        ]);
        if (cancelled) return;
        const branchLabel = (branch?.branchName || '').trim() || 'This branch';
        const working = Array.isArray(workingRes.data)
          ? workingRes.data
              .map((r: any) => String(r.highlight_text ?? '').trim())
              .map((txt: string) => {
                if (/performance stable across branches/i.test(txt)) {
                  return `${branchLabel} operating normally — no major issues detected`;
                }
                if (/no major operational risks detected/i.test(txt)) {
                  return `${branchLabel} operating normally — no major issues detected`;
                }
                return txt;
              })
              .filter(Boolean)
              .slice(0, 3)
          : [];
        const opps = Array.isArray(oppRes.data)
          ? oppRes.data
              .map((r: any) => String(r.opportunity_text ?? '').trim())
              .filter(Boolean)
              .slice(0, 3)
          : [];
        const watch = Array.isArray(watchRes.data)
          ? watchRes.data
              .map((r: any) => String(r.warning_text ?? '').trim())
              .filter(Boolean)
              .slice(0, 3)
          : [];
        setBranchWhatsWorkingRows(working);
        setBranchOpportunitiesRows(
          opps.length > 0 ? opps : ['No clear opportunities today']
        );
        setBranchWatchlistRows(
          watch.length > 0 ? watch : ['No early warning signals detected']
        );
      } finally {
        if (!cancelled) setBranchSectionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch?.id]);

  // STEP 6 & 7: Debug logging will be added after recommendedActions is defined

  const activeAlerts = useMemo(() => {
    const alertsCopy = [...mergedBranchAlerts] as AlertContract[];
    
    // PART 6: Filter out resolved alerts first
    const unresolvedAlerts = alertsCopy.filter(alert => {
      const extended = alert as ExtendedAlertContract;
      // Exclude resolved alerts (status === 'resolved' or resolvedAt exists)
      return extended.status !== 'resolved' && !extended.resolvedAt;
    });
    
    // PART 6: Deduplicate by code first (most reliable), then by ID, then by content
    const alertsByCode = new Map<string, AlertContract>();
    unresolvedAlerts.forEach(alert => {
      // Use alert.code if available, otherwise use id
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    
    // Deduplicate alerts by ID (keep first occurrence)
    const seenIds = new Set<string>();
    const alertsById = Array.from(alertsByCode.values()).filter(alert => {
      if (seenIds.has(alert.id)) {
        return false;
      }
      seenIds.add(alert.id);
      return true;
    });
    
    // Then deduplicate by content (message + severity + domain) to catch duplicates with different IDs
    const seenContent = new Set<string>();
    const uniqueAlerts = alertsById.filter(alert => {
      // Create content signature: message + severity + domain
      const contentKey = `${alert.message || ''}|${alert.severity}|${alert.domain || ''}`;
      if (seenContent.has(contentKey)) {
        return false;
      }
      seenContent.add(contentKey);
      return true;
    });
    
    // PART 6: Sort by impact descending before slicing
    const alertsWithImpact = uniqueAlerts.map(alert => ({
      alert,
      impact: safeRevenueImpact(alert as AlertContract),
    }));
    alertsWithImpact.sort((a, b) => b.impact - a.impact);
    
    return alertsWithImpact.slice(0, 5).map(({ alert }) => {
      const extended = alert as ExtendedAlertContract;
      
      // Get alert title - prefer revenueImpactTitle, fallback to clean message extraction
      let alertTitle = extended.revenueImpactTitle;
      if (!alertTitle && alert.message) {
        const firstSentence = alert.message.split('.')[0].trim();
        // Remove confusing patterns like ": 0" or ": 0.1" at the end
        alertTitle = firstSentence.replace(/:\s*0(\.\d+)?\s*$/, '').trim() || firstSentence;
        // If still looks like an ID or technical name, try to extract meaningful part
        if (alertTitle.includes(':') && alertTitle.split(':').length > 1) {
          const parts = alertTitle.split(':');
          alertTitle = parts[parts.length - 1].trim() || parts[0].trim();
        }
      }
      // Final fallback
      if (!alertTitle || alertTitle === alert.id) {
        alertTitle = alert.id
          .replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .replace(/liquidity runway risk/gi, 'Liquidity Runway Risk');
      }
      
      return {
        id: alert.id,
        name: alertTitle,
        category: alert.domain || 'general',
        severity: alert.severity,
        impact: safeRevenueImpact(alert as AlertContract),
        status: 'Ongoing' as const,
      };
    });
  }, [mergedBranchAlerts]);

  // PART 7: Generate recommended actions (1-3 prioritized by revenue impact, fallback to critical alerts)
  // Must be derived from top 3 impact alerts, deduplicated by code
  // Must not show blank if alerts exist
  const recommendedActions = useMemo(() => {
    if (!mergedBranchAlerts.length) return [];
    
    // First deduplicate all alerts by code
    const alertsByCode = new Map<string, AlertContract>();
    mergedBranchAlerts.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    const uniqueBranchAlerts = Array.from(alertsByCode.values());
    
    // Calculate impact for each alert and sort by impact descending
    const alertsWithImpact = uniqueBranchAlerts.map(alert => ({
      alert,
      impact: safeRevenueImpact(alert as AlertContract),
    }));
    alertsWithImpact.sort((a, b) => {
      // Primary sort by impact descending
      if (b.impact !== a.impact) return b.impact - a.impact;
      // Secondary sort by severity
      if (a.alert.severity === 'critical' && b.alert.severity !== 'critical') return -1;
      if (a.alert.severity !== 'critical' && b.alert.severity === 'critical') return 1;
      return (b.alert.confidence || 0) - (a.alert.confidence || 0);
    });
    
    // Use topRevenueLeaks if available (already deduplicated and sorted), otherwise use top 3 by impact
    const alertsToUse = topRevenueLeaks.length > 0 
      ? topRevenueLeaks.slice(0, 3)
      : alertsWithImpact
          .filter(item => item.alert.severity === 'critical' || item.alert.severity === 'warning' || item.impact > 0)
          .slice(0, 3)
          .map(item => item.alert);

    const actions = alertsToUse.slice(0, 3).map((alert, idx) => {
      const extended = alert as ExtendedAlertContract;
      
      // Get alert title - prefer revenueImpactTitle, fallback to clean message extraction
      let actionTitle = extended.revenueImpactTitle;
      if (!actionTitle && alert.message) {
        // Extract first sentence, but clean up common patterns
        const firstSentence = alert.message.split('.')[0].trim();
        // Remove confusing patterns like ": 0" or ": 0.1" at the end
        actionTitle = firstSentence.replace(/:\s*0(\.\d+)?\s*$/, '').trim() || firstSentence;
        // If still looks like an ID or technical name, try to extract meaningful part
        if (actionTitle.includes(':') && actionTitle.split(':').length > 1) {
          const parts = actionTitle.split(':');
          // Use the part after the colon if it's meaningful, otherwise use the part before
          actionTitle = parts[parts.length - 1].trim() || parts[0].trim();
        }
      }
      // Final fallback to alert ID if still no good title
      if (!actionTitle || actionTitle === alert.id) {
        // Try to create a readable title from alert ID
        actionTitle = alert.id
          .replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .substring(0, 50);
      }
      
      const explanation = extended.revenueImpactDescription || alert.message;
      
      // Extract suggested action from conditions or generate from alert type
      let suggestedAction = '';
      const alertContract = alert as AlertContract;
      if (alertContract.conditions && alertContract.conditions.length > 0) {
        const actionCondition = alertContract.conditions.find(c => 
          c.toLowerCase().includes('reduce') || 
          c.toLowerCase().includes('increase') ||
          c.toLowerCase().includes('adjust')
        );
        if (actionCondition) {
          suggestedAction = actionCondition;
        }
      }
      
      if (!suggestedAction) {
        // Generate generic action based on alert type
        if (alert.id.includes('capacity') || alert.id.includes('occupancy')) {
          suggestedAction = locale === 'th' 
            ? 'พิจารณาปรับราคาหรือเพิ่มการตลาดเพื่อเพิ่มอัตราการเข้าพัก'
            : 'Consider pricing adjustments or marketing campaigns to increase occupancy';
        } else if (alert.id.includes('labor') || alert.id.includes('staff')) {
          suggestedAction = locale === 'th'
            ? 'ปรับจำนวนพนักงานให้สอดคล้องกับความต้องการ'
            : 'Adjust staff count to match demand patterns';
        } else if (alert.id.includes('menu') || alert.id.includes('revenue')) {
          suggestedAction = locale === 'th'
            ? 'วิเคราะห์และปรับเมนูเพื่อเพิ่มรายได้'
            : 'Analyze and adjust menu to increase revenue';
        } else if (alert.id.includes('cash') || alert.id.includes('runway')) {
          suggestedAction = locale === 'th'
            ? 'ตรวจสอบกระแสเงินสดและพิจารณาการจัดการเงินทุน'
            : 'Review cash flow and consider capital management';
        } else {
          suggestedAction = locale === 'th'
            ? 'ตรวจสอบรายละเอียดการแจ้งเตือนสำหรับคำแนะนำเพิ่มเติม'
            : 'Review alert details for suggested actions';
        }
      }

      return {
        title: actionTitle,
        explanation: explanation.substring(0, 100) + (explanation.length > 100 ? '...' : ''),
        suggestedAction,
        revenueImpact: safeRevenueImpact(alert as AlertContract),
        alertId: alert.id,
        severity: alert.severity,
      };
    });

    return actions;
  }, [topRevenueLeaks, mergedBranchAlerts, locale]);

  // Determine health status label from Supabase health score only
  const healthStatus = useMemo(() => {
    if (healthScore == null) return null;
    const score = Number(healthScore);
    if (score >= 80) return { label: locale === 'th' ? 'เสถียร' : 'Stable', color: '#10b981' };
    if (score >= 60) return { label: locale === 'th' ? 'มีความเสี่ยง' : 'At Risk', color: '#f59e0b' };
    return { label: locale === 'th' ? 'วิกฤต' : 'Critical', color: '#ef4444' };
  }, [healthScore, locale]);

  const hospitalityLabels = getHospitalityLabels(branch ?? null, locale === 'th' ? 'th' : 'en');

  // Latest daily metric (most recent by date)
  const latestDailyMetric = useMemo(() => {
    if (!dailyMetricsForTrends?.length) return null;
    const sorted = [...dailyMetricsForTrends].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted[0] ?? null;
  }, [dailyMetricsForTrends]);

  // Today summary for compact one-line (accommodation: vs last week same weekday; F&B: vs yesterday)
  const todaySummary = useMemo(() => {
    const isFnb = branch?.moduleType === 'fnb';
    const isAccommodation = branch?.moduleType === 'accommodation';
    const latestDateRaw =
      (isFnb ? fnbOperatingStatus?.metric_date : operatingStatusData?.metric_date) ??
      latestDailyMetric?.date ??
      null;
    // Normalize to YYYY-MM-DD so addDays() and metricsByDate lookup match (Supabase may return ISO string)
    const latestDate =
      latestDateRaw && typeof latestDateRaw === 'string'
        ? latestDateRaw.slice(0, 10)
        : latestDateRaw;
    const metricsByDate = new Map<string, DailyMetric>();
    (dailyMetricsForTrends ?? []).forEach((m) => {
      const key = m.date != null ? String(m.date).slice(0, 10) : '';
      if (key) metricsByDate.set(key, m);
    });
    const datesDesc = [...metricsByDate.keys()].sort((a, b) => b.localeCompare(a));
    // Use the latest date that exists in the feed so prev-day/prev-week lookups always hit the map (fixes invisible deltas)
    const referenceDate = datesDesc[0] ?? latestDate ?? null;
    const prevWeekDate = referenceDate && isAccommodation ? addDays(referenceDate, -7) : null;
    const prevDayDate = referenceDate ? addDays(referenceDate, -1) : null;
    // F&B: previous day metric (with fallback so delta can show)
    const prevMetric =
      !isAccommodation && prevDayDate
        ? metricsByDate.get(prevDayDate) ??
          (() => {
            const fallback = datesDesc.find((d) => d < (referenceDate ?? ''));
            return fallback ? metricsByDate.get(fallback) ?? null : null;
          })()
        : null;
    // Previous-day metric: exact yesterday first, else closest date before reference (so revenue delta shows with 2+ days)
    const prevDayMetricExact =
      prevDayDate && referenceDate
        ? metricsByDate.get(prevDayDate) ??
          (() => {
            const fallback = datesDesc.find((d) => d < referenceDate);
            return fallback ? metricsByDate.get(fallback) ?? null : null;
          })()
        : null;
    // Previous-week metric for occupancy: exact same-weekday first, else closest date <= prevWeekDate (so occupancy delta shows with 8+ days)
    const prevMetricWeek =
      isAccommodation && prevWeekDate
        ? metricsByDate.get(prevWeekDate) ??
          (() => {
            const fallback = datesDesc.find((d) => d <= prevWeekDate);
            return fallback ? metricsByDate.get(fallback) ?? null : null;
          })()
        : null;

    if (isAccommodation) {
      const rev = operatingStatusData?.revenue ?? operatingStatusData?.total_revenue_thb ?? latestDailyMetric?.revenue ?? todaySummaryRow?.total_revenue ?? null;
      const roomsSold = operatingStatusData?.rooms_sold ?? latestDailyMetric?.roomsSold ?? null;
      const totalRooms = branch?.totalRooms ?? latestDailyMetric?.roomsAvailable ?? null;
      const occ =
        operatingStatusData?.occupancy_rate != null
          ? Number(operatingStatusData.occupancy_rate)
          : totalRooms != null && totalRooms > 0 && roomsSold != null
            ? (roomsSold / totalRooms) * 100
            : null;
      const prevRevWeek = prevMetricWeek?.revenue ?? null;
      const prevRooms = prevMetricWeek?.roomsSold ?? null;
      const prevTotal = prevMetricWeek?.roomsAvailable ?? totalRooms;
      const prevOcc =
        prevTotal != null && prevTotal > 0
          ? ((prevRooms ?? 0) / prevTotal) * 100
          : null;
      const prevRevDay = prevDayMetricExact?.revenue ?? null;
      const revenueDeltaPctWeek =
        rev != null && prevRevWeek != null && prevRevWeek > 0 ? ((rev - prevRevWeek) / prevRevWeek) * 100 : null;
      // Prefer today_summary view deltas; fallback to client-side (with fallback prev row so deltas show with 2+/8+ days)
      const revenueDeltaPctDay =
        todaySummaryRow?.revenue_delta_day != null && Number.isFinite(todaySummaryRow.revenue_delta_day)
          ? todaySummaryRow.revenue_delta_day
          : rev != null && prevRevDay != null && prevRevDay > 0
            ? ((rev - prevRevDay) / prevRevDay) * 100
            : null;
      const occupancyDeltaPct =
        todaySummaryRow?.occupancy_delta_week != null && Number.isFinite(todaySummaryRow.occupancy_delta_week)
          ? todaySummaryRow.occupancy_delta_week
          : occ != null && prevOcc != null && prevOcc > 0
            ? ((occ - prevOcc) / prevOcc) * 100
            : null;
      const adr = roomsSold != null && roomsSold > 0 && rev != null ? rev / roomsSold : null;
      const revpar = totalRooms != null && totalRooms > 0 && rev != null ? rev / totalRooms : null;
      // Health: prefer Supabase; then today_summary; else show 70 so we don't show "—"
      const healthForSummary = healthScore ?? todaySummaryRow?.health_score ?? 70;
      return {
        accommodation: {
          occupancyRate: occ,
          occupancyDeltaPct,
          roomsSold: roomsSold ?? null,
          totalRooms: totalRooms ?? null,
          revenue: rev,
          revenueDeltaPct: revenueDeltaPctDay,
          revenueDeltaPctWeek,
          adr,
          revpar,
          healthScore: healthForSummary,
        },
        fnb: null,
      };
    }

    if (isFnb) {
      const rev = fnbOperatingStatus?.revenue ?? null;
      const customers = fnbOperatingStatus?.customers ?? null;
      const avgTicket = fnbOperatingStatus?.avg_ticket ?? null;
      const prevRev = prevMetric?.revenue ?? null;
      const prevCust = prevMetric?.customers ?? null;
      const revenueDeltaPct =
        rev != null && prevRev != null && prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : null;
      const customersDeltaPct =
        customers != null && prevCust != null && prevCust > 0
          ? ((customers - prevCust) / prevCust) * 100
          : null;
      return {
        accommodation: null,
        fnb: {
          revenue: rev,
          revenueDeltaPct,
          customers,
          customersDeltaPct,
          avgTicket,
          healthScore: fnbOperatingStatus?.health_score ?? healthScore ?? 70,
        },
      };
    }

    return { accommodation: null, fnb: null };
  }, [
    branch?.moduleType,
    branch?.totalRooms,
    operatingStatusData,
    fnbOperatingStatus,
    healthScore,
    latestDailyMetric,
    dailyMetricsForTrends,
    todaySummaryRow,
  ]);

  // Data freshness: MAX(metric_date) from raw tables only (fnb_daily_metrics / accommodation_daily_metrics). No *_today_summary, *_latest_metrics, created_at.
  const isAccommodationOrFnb =
    branch?.moduleType === 'accommodation' || branch?.moduleType === 'fnb';
  const dataFreshnessLoading = isAccommodationOrFnb && !freshnessLoaded;
  const freshnessResult =
    !dataFreshnessLoading && isAccommodationOrFnb
      ? getDataFreshness(freshnessDatesFromRaw, locale === 'th' ? 'th' : 'en')
      : null;
  const freshness =
    freshnessResult != null
      ? { label: freshnessResult.label, color: freshnessResult.color as 'green' | 'yellow' | 'red' }
      : null;

  // Early signal: accommodation = accommodation_anomaly_signals.early_signal; F&B = fnb_operating_status.early_signal
  const earlySignalText = useMemo(() => {
    if (branch?.moduleType === 'accommodation') {
      if (accommodationEarlySignal) {
        const s = accommodationEarlySignal.toLowerCase();
        if (s === 'normal') return locale === 'th' ? 'ปกติ' : 'Normal';
        if (s === 'demand_drop') return locale === 'th' ? 'ตรวจพบความต้องการลดลง' : 'Demand weakening detected';
        if (s === 'demand_spike') return locale === 'th' ? 'ตรวจพบความต้องการพุ่งสูง' : 'Demand spike detected';
        if (s === 'weak_midweek') return locale === 'th' ? 'วันกลางสัปดาห์อ่อนแอ' : 'Weak midweek';
        if (s === 'strong_weekend') return locale === 'th' ? 'สุดสัปดาห์แข็งแรง' : 'Strong weekend';
        if (s === 'seasonal_risk') return locale === 'th' ? 'ความเสี่ยงตามฤดูกาล' : 'Seasonal risk';
        return accommodationEarlySignal;
      }
      return '—';
    }
    if (branch?.moduleType === 'fnb' && fnbOperatingStatus?.early_signal) {
      const s = String(fnbOperatingStatus.early_signal).toLowerCase();
      if (s === 'normal') return locale === 'th' ? 'ปกติ' : 'Normal';
      if (s === 'demand_drop') return locale === 'th' ? 'ตรวจพบความต้องการลดลง' : 'Demand weakening detected';
      if (s === 'demand_spike') return locale === 'th' ? 'ตรวจพบความต้องการพุ่งสูง' : 'Demand spike detected';
      if (s === 'weak_midweek') return locale === 'th' ? 'วันกลางสัปดาห์อ่อนแอ' : 'Weak midweek';
      if (s === 'strong_weekend') return locale === 'th' ? 'สุดสัปดาห์แข็งแรง' : 'Strong weekend';
      if (s === 'seasonal_risk') return locale === 'th' ? 'ความเสี่ยงตามฤดูกาล' : 'Seasonal risk';
      return String(fnbOperatingStatus.early_signal);
    }
    if (anomalySignal?.revenue_anomaly_score != null) {
      const score = Number(anomalySignal.revenue_anomaly_score);
      if (score < -2) return locale === 'th' ? 'รายได้ต่ำกว่าแนวโน้มปกติอย่างมีนัยสำคัญ' : 'Revenue significantly below normal trend';
      if (score > 2) return locale === 'th' ? 'รายได้สูงกว่าแนวโน้มปกติอย่างมีนัยสำคัญ' : 'Revenue significantly above normal trend';
      return locale === 'th' ? 'รายได้อยู่ในช่วงแนวโน้มปกติ' : 'Revenue within normal trend';
    }
    if (performanceTrends) {
      const { revenueTrend } = performanceTrends;
      if (revenueTrend > 5) return locale === 'th' ? 'รายได้เพิ่มขึ้นเทียบกับแนวโน้มล่าสุด' : 'Revenue up vs recent trend';
      if (revenueTrend < -5) return locale === 'th' ? 'รายได้ลดลงเทียบกับแนวโน้มล่าสุด' : 'Revenue down vs recent trend';
      return locale === 'th' ? 'รายได้คงที่เทียบกับแนวโน้มล่าสุด' : 'Revenue stable vs recent trend';
    }
    const first = mergedBranchAlerts[0];
    if (first?.message) {
      const one = String(first.message).split('.')[0].trim();
      return one.length > 60 ? one.slice(0, 57) + '...' : one;
    }
    if (coverageDays < 7) return locale === 'th' ? 'กำลังรวบรวมข้อมูล...' : 'Collecting data...';
    return '—';
  }, [branch?.moduleType, accommodationEarlySignal, fnbOperatingStatus?.early_signal, anomalySignal, performanceTrends, mergedBranchAlerts, coverageDays, locale]);

  if (!mounted || branchLoading) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
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

  if (error) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState message={error.message} />
      </PageLayout>
    );
  }

  if (!branch || !branch.id) {
    // Show loading while trying to auto-select or while branch is loading
    if (branchLoading || attemptingAutoSelect) {
      return (
        <PageLayout title="" subtitle="">
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <LoadingSpinner />
          </div>
        </PageLayout>
      );
    }
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

  const fullyActive = isFullyActive(stage);
  const dataCoverageDays = Math.min(coverageDays, 30);

  return (
    <PageLayout title="" subtitle="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Owner dashboard: Monthly Fixed Cost not configured (accommodation, owner/super_admin only) */}
        {monthlyFixedCostStatus && !monthlyFixedCostStatus.hasValue && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              backgroundColor: monthlyFixedCostStatus.dataDaysCount >= 7 ? '#fef3c7' : '#eff6ff',
              border: `1px solid ${monthlyFixedCostStatus.dataDaysCount >= 7 ? '#f59e0b' : '#3b82f6'}`,
              fontSize: '14px',
              color: '#1e293b',
            }}
          >
            {monthlyFixedCostStatus.dataDaysCount >= 7
              ? (locale === 'th' ? 'กรุณาตั้งค่าต้นทุนคงที่รายเดือนเพื่อปรับปรุงข้อมูลเชิงการเงิน' : 'Please configure Monthly Fixed Cost to improve financial insights.')
              : (locale === 'th' ? 'ยังไม่ได้ตั้งค่าต้นทุนคงที่รายเดือน การตั้งค่าจะช่วยให้ AuraSea คำนวณสัญญาณกำไรและคำแนะนำได้ดีขึ้น' : 'Monthly Fixed Cost has not been configured. This helps AuraSea calculate profit signals and recommendations.')}
            {paths.branchSettings && (
              <span style={{ marginLeft: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => router.push(paths.branchSettings!)}
                  style={{ color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', fontWeight: 500 }}
                >
                  {locale === 'th' ? 'ไปที่การตั้งค่า' : 'Go to Settings'}
                </button>
              </span>
            )}
          </div>
        )}
        {/* 1. Top Metrics (primary) — single row only */}
        {branch?.moduleType === 'accommodation' || branch?.moduleType === 'fnb' ? (
          <BranchTodaySummary
            branchType={branch.moduleType}
            locale={locale === 'th' ? 'th' : 'en'}
            lastUpdatedDate={
              (branch.moduleType === 'fnb' ? fnbOperatingStatus?.metric_date : operatingStatusData?.metric_date) ??
              latestDailyMetric?.date ??
              (lastUpdated ? new Date(lastUpdated).toISOString().slice(0, 10) : null)
            }
            accommodation={todaySummary.accommodation}
            fnb={todaySummary.fnb}
            accommodationProfitability={
              branch.moduleType === 'accommodation'
                ? {
                    trend: accProfitSignal?.trend ?? null,
                    explanation: accProfitSignal?.explanation ?? '',
                  }
                : null
            }
            fnbProfitability={
              branch.moduleType === 'fnb'
                ? {
                    avgDailyCost: fnbOperatingStatus?.avg_cost ?? null,
                    marginTrend: fnbProfitSignal?.margin_trend ?? null,
                    marginExplanation: fnbProfitSignal?.margin_explanation ?? '',
                  }
                : null
            }
            collectingLabel={locale === 'th' ? 'กำลังรวบรวมข้อมูล...' : 'Collecting data...'}
            freshness={freshness}
          />
        ) : null}

        {/* 2. System Status Strip — branch_learning_status.learning_days (capped at 30 for x/30) */}
        {learningStatus != null ? (
          <div style={{ marginTop: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
              {locale === 'th'
                ? `กำลังเรียนรู้ (${Math.min(30, learningStatus.learning_days)}/30 วัน)`
                : `Learning (${Math.min(30, learningStatus.learning_days)}/30 days)`}
            </span>
            <span style={{ color: '#9ca3af', fontSize: 10 }}>●</span>
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
              {learningStatus.learning_days < 7
                ? locale === 'th'
                  ? 'ต่ำ'
                  : 'Low'
                : learningStatus.learning_days <= 20
                  ? locale === 'th'
                    ? 'ปานกลาง'
                    : 'Medium'
                  : locale === 'th'
                    ? 'สูง'
                    : 'High'}
            </span>
            {Math.min(30, learningStatus.learning_days) < 30 && (
              <span
                style={{
                  display: 'inline-flex',
                  width: 80,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: '#e5e7eb',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: `${Math.min(100, (Math.min(30, learningStatus.learning_days) / 30) * 100)}%`,
                    height: '100%',
                    backgroundColor: '#9ca3af',
                  }}
                />
              </span>
            )}
          </div>
        ) : null}

        {/* 3. Today's Priorities (today_branch_priorities) */}
        <div
          style={{
            marginTop: learningStatus != null ? 0 : 24,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '16px 20px',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0, marginBottom: 12 }}>
            {locale === 'th' ? 'ลำดับความสำคัญวันนี้' : "Today's Priorities"}
          </h2>
          {branchPrioritiesLoading ? (
            <div style={{ fontSize: 13, color: '#6b7280' }}>{locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}</div>
          ) : branchPrioritiesTop.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>
              {locale === 'th'
                ? 'ไม่พบลำดับความสำคัญสำหรับวันนี้'
                : 'No priorities for today'}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {branchPrioritiesTop.map((row, idx) => {
                const rank = row.rank ?? idx + 1;
                const title = (row.short_title || '').trim() || (locale === 'th' ? 'ประเด็นสำคัญ' : 'Priority');
                const action = (row.action_text || '').trim() || (locale === 'th' ? 'ทบทวนแผนปฏิบัติการ' : 'Review action plan');
                const impact = row.impact_estimate_thb ?? 0;
                const impactLabel = (row.impact_label || 'at risk').toLowerCase();
                const isOpportunity = impactLabel.includes('opportunity');
                const impactColor = isOpportunity ? '#059669' : '#b91c1c';
                const impactText = isOpportunity
                  ? locale === 'th'
                    ? 'โอกาส'
                    : 'opportunity'
                  : locale === 'th'
                    ? 'เสี่ยง'
                    : 'at risk';
                const numLoc = locale === 'th' ? 'th-TH' : 'en-US';
                return (
                  <li key={`priority-${row.branch_id}-${row.metric_date}-${row.rank ?? idx}`} style={{ lineHeight: 1.5 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                      {rank}. {title}
                    </div>
                    <div style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>
                      <span aria-hidden>{'→ '}</span>
                      {action}
                      <span style={{ color: impactColor, fontWeight: 600 }}>
                        {' '}
                        (฿{formatCurrency(impact, numLoc)} {impactText})
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 4. Performance Drivers — placed below Today's Priorities */}
        {(isAccommodation || isFnb) && driverChartData && driverChartData.revenue.length >= 2 ? (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#111827', margin: 0, marginBottom: 16 }}>
              {locale === 'th' ? 'ตัวขับเคลื่อนประสิทธิภาพ' : 'Performance Drivers'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {isAccommodation && (
                <>
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy', color: '#2563eb' },
                      { label: locale === 'th' ? 'ราคาห้องเฉลี่ย' : 'ADR', color: '#7c3aed' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={performanceDriverInsights?.kind === 'acc' ? performanceDriverInsights.occAdr.problem : ''}
                    recommendation={performanceDriverInsights?.kind === 'acc' ? performanceDriverInsights.occAdr.recommendation : ''}
                  >
                    <DecisionTrendChart
                      values={driverChartData.occupancy}
                      valuesRight={driverChartData.adr.length === driverChartData.occupancy.length ? driverChartData.adr : undefined}
                      dates={driverChartData.dates}
                      color="#2563eb"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => `${Math.round(v)}%`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy (%)'}
                      rightLabel={locale === 'th' ? 'ราคาห้องเฉลี่ย (฿)' : 'ADR (฿)'}
                      emptyMessage={locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                      locale={locale === 'th' ? 'th' : 'en'}
                      insightRevenue={driverChartData.revenue}
                      insightCustomers={driverChartData.customers}
                    />
                  </TrendChartCard>
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={performanceDriverInsights?.kind === 'acc' ? performanceDriverInsights.occRev.problem : ''}
                    recommendation={performanceDriverInsights?.kind === 'acc' ? performanceDriverInsights.occRev.recommendation : ''}
                  >
                    <DecisionTrendChart
                      values={driverChartData.occupancy}
                      valuesRight={driverChartData.revenue.length === driverChartData.occupancy.length ? driverChartData.revenue : undefined}
                      dates={driverChartData.dates}
                      color="#2563eb"
                      colorRight="#16a34a"
                      showBaseline={true}
                      formatLeft={(v) => `${Math.round(v)}%`}
                      formatRight={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      leftLabel={locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy (%)'}
                      rightLabel={locale === 'th' ? 'รายได้ (฿)' : 'Revenue (฿)'}
                      emptyMessage={locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                      locale={locale === 'th' ? 'th' : 'en'}
                      insightCustomers={driverChartData.customers}
                    />
                  </TrendChartCard>
                </>
              )}
              {isFnb && (
                <>
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'จำนวนลูกค้า' : 'Customers', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={performanceDriverInsights?.kind === 'fnb' ? performanceDriverInsights.custRev.problem : ''}
                    recommendation={performanceDriverInsights?.kind === 'fnb' ? performanceDriverInsights.custRev.recommendation : ''}
                  >
                    <DecisionTrendChart
                      values={driverChartData.customers}
                      valuesRight={
                        driverChartData.revenue.length === driverChartData.customers.length
                          ? driverChartData.revenue
                          : undefined
                      }
                      dates={driverChartData.dates}
                      color="#2563eb"
                      colorRight="#16a34a"
                      showBaseline={true}
                      formatLeft={(v) => String(Math.round(v))}
                      formatRight={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      leftLabel={locale === 'th' ? 'จำนวนลูกค้า' : 'Customers'}
                      rightLabel={locale === 'th' ? 'รายได้ (฿)' : 'Revenue (฿)'}
                      strokeWidthLeft={3}
                      strokeWidthRight={1.5}
                      emptyMessage={locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                      locale={locale === 'th' ? 'th' : 'en'}
                    />
                  </TrendChartCard>
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'จำนวนลูกค้า' : 'Customers', color: '#2563eb' },
                      { label: locale === 'th' ? 'ค่าใช้จ่ายเฉลี่ยต่อบิล' : 'Avg Ticket', color: '#7c3aed' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={performanceDriverInsights?.kind === 'fnb' ? performanceDriverInsights.custTicket.problem : ''}
                    recommendation={performanceDriverInsights?.kind === 'fnb' ? performanceDriverInsights.custTicket.recommendation : ''}
                  >
                    <DecisionTrendChart
                      values={driverChartData.customers}
                      valuesRight={driverChartData.avgTicket.length === driverChartData.customers.length ? driverChartData.avgTicket : undefined}
                      dates={driverChartData.dates}
                      color="#2563eb"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => String(Math.round(v))}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'จำนวนลูกค้า' : 'Customers'}
                      rightLabel={locale === 'th' ? 'ค่าใช้จ่ายเฉลี่ยต่อบิล (฿)' : 'Avg Ticket (฿)'}
                      strokeWidthLeft={3}
                      strokeWidthRight={1.5}
                      emptyMessage={locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                      locale={locale === 'th' ? 'th' : 'en'}
                      insightRevenue={driverChartData.revenue}
                    />
                  </TrendChartCard>
                </>
              )}
            </div>
          </div>
        ) : null}

        {/* 5. Business Trends */}
        <OperatingSection title={locale === 'th' ? 'แนวโน้มธุรกิจ' : 'Business Trends'}>
          {performanceTrends ? (
            <div style={{ fontSize: 14, lineHeight: 1.6, color: '#334155', fontWeight: 500 }}>
              <div>
                {locale === 'th'
                  ? performanceTrends.revenueTrend > 2
                    ? 'รายได้กำลังปรับตัวดีขึ้น'
                    : performanceTrends.revenueTrend < -2
                      ? 'รายได้เริ่มอ่อนตัวลง'
                      : 'รายได้ค่อนข้างทรงตัว'
                  : performanceTrends.revenueTrend > 2
                    ? 'Revenue is improving'
                    : performanceTrends.revenueTrend < -2
                      ? 'Revenue is declining'
                      : 'Revenue is stable'}
              </div>
              <div style={{ color: '#64748b', fontSize: 13 }}>
                {locale === 'th' ? 'ข้อมูลเริ่มก่อตัว แนวโน้มกำลังก่อตัว' : 'Early data, trend forming'}
              </div>
            </div>
          ) : hasRevenueActivity ? (
            <p style={{ margin: 0, color: '#475569', fontSize: 14, fontWeight: 600 }}>
              {locale === 'th' ? 'ข้อมูลเริ่มก่อตัว แนวโน้มกำลังก่อตัว' : 'Early data, trend forming'}
            </p>
          ) : (
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
              {locale === 'th'
                ? 'ผลการดำเนินงานค่อนข้างทรงตัว — ต้องการข้อมูลเพิ่ม'
                : 'Performance is stable — more data needed'}
            </p>
          )}
        </OperatingSection>

        {/* 6. What's Working */}
        <OperatingSection title={locale === 'th' ? 'สิ่งที่ทำได้ดี' : "What's Working"}>
          {branchSectionLoading ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{locale === 'th' ? 'กำลังโหลด…' : 'Loading…'}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(branchWhatsWorkingRows.length > 0 ? branchWhatsWorkingRows.slice(0, 3) : branchWorkingFallbackRows).map((text, idx) => (
                <li key={`bw-${idx}`} style={{ color: '#166534', fontSize: 14, lineHeight: 1.5 }}>
                  • {text}
                </li>
              ))}
            </ul>
          )}
        </OperatingSection>

        {/* 7. Opportunities */}
        <OperatingSection title={locale === 'th' ? 'โอกาส' : 'Opportunities'}>
          {branchSectionLoading ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{locale === 'th' ? 'กำลังโหลด…' : 'Loading…'}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {branchOpportunitiesRows.slice(0, 3).map((text, idx) => (
                <li key={`bo-${idx}`} style={{ color: '#065f46', fontSize: 14, lineHeight: 1.5 }}>
                  • {text}
                </li>
              ))}
            </ul>
          )}
        </OperatingSection>

        {/* 8. Watchlist */}
        <OperatingSection title={locale === 'th' ? 'สัญญาณเตือนล่วงหน้า' : 'Watchlist'}>
          {branchSectionLoading ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{locale === 'th' ? 'กำลังโหลด…' : 'Loading…'}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {branchWatchlistRows.slice(0, 3).map((text, idx) => (
                <li key={`bwk-${idx}`} style={{ color: '#92400e', fontSize: 14, lineHeight: 1.5 }}>
                  • {text}
                </li>
              ))}
            </ul>
          )}
        </OperatingSection>

        {fullyActive && (
          <>
        <OperatingHeader />
        <DailyPrompt
          lastUpdated={lastUpdated ? new Date(lastUpdated).toISOString() : null}
          logTodayHref={paths.branchLog}
        />
        {/* Section A — Monitoring only; one-line summary is above (TodaySummaryLine) for instant business understanding */}
        <OperatingSection title={locale === 'th' ? 'สถานะธุรกิจวันนี้' : "Today's business status"}>
        <MonitoringErrorBoundary componentName="Monitoring Status">
          {monitoringStatus && (
            <MonitoringStatusCard
              status={monitoringStatus}
              trends={[]}
              onRefresh={async () => {}}
              showReminder={false}
              onDismissReminder={() => {}}
            />
          )}
        </MonitoringErrorBoundary>
        </OperatingSection>

        {/* Section B — Risk alerts */}
        <OperatingSection title={locale === 'th' ? 'ระบบเตือนความเสี่ยง' : 'Risk alerts'}>
        <MonitoringErrorBoundary
          componentName="Critical Alerts Snapshot"
          fallback={<AlertsFallback />}
        >
          <CriticalAlertsSnapshot 
            alerts={mergedBranchAlerts} 
            viewType="branch" 
            locale={locale}
            alertsInitializing={alertsInitializing}
          />
        </MonitoringErrorBoundary>
        </OperatingSection>

        {/* BLOCK 2: Top 3 Revenue Leaks */}
        <SectionCard title={locale === 'th' ? 'การสูญเสียรายได้ที่สำคัญ (30 วันล่าสุด)' : 'Top Revenue Leaks (Last 30 Days)'}>
          {topRevenueLeaks.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ไม่พบการสูญเสียรายได้ที่สำคัญ' : 'No major revenue leaks detected.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {topRevenueLeaks.map((alert, idx) => {
                const severityColor = getSeverityColor(alert.severity);
                const extended = alert as ExtendedAlertContract;
                const impact = safeRevenueImpact(alert as AlertContract);
                
                // Get alert title - prefer revenueImpactTitle, fallback to clean message extraction
                let alertTitle = extended.revenueImpactTitle;
                if (!alertTitle && alert.message) {
                  // Extract first sentence, but clean up common patterns
                  const firstSentence = alert.message.split('.')[0].trim();
                  // Remove confusing patterns like ": 0" or ": 0.1" at the end
                  alertTitle = firstSentence.replace(/:\s*0(\.\d+)?\s*$/, '').trim() || firstSentence;
                  // If still looks like an ID or technical name, try to extract meaningful part
                  if (alertTitle.includes(':') && alertTitle.split(':').length > 1) {
                    const parts = alertTitle.split(':');
                    // Use the part after the colon if it's meaningful, otherwise use the part before
                    alertTitle = parts[parts.length - 1].trim() || parts[0].trim();
                  }
                }
                // Final fallback to alert ID if still no good title
                if (!alertTitle || alertTitle === alert.id) {
                  // Try to create a readable title from alert ID
                  alertTitle = alert.id
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                    .replace(/liquidity runway risk/gi, 'Liquidity Runway Risk');
                }
                
                // Get alert description - prefer revenueImpactDescription, fallback to full message
                const alertDescription = extended.revenueImpactDescription || alert.message || '';
                
                return (
                  <div
                    key={alert.id}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        {/* Red dot indicator - consistent with Critical Alerts Snapshot */}
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: severityColor,
                          marginTop: '0.375rem',
                          flexShrink: 0,
                        }} />
                        {/* Alert content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                            <div style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: '#0a0a0a',
                            }}>
                              {alertTitle}
                            </div>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: severityColor + '20',
                              color: severityColor,
                            }}>
                              {getSeverityLabel(alert.severity, locale)}
                            </span>
                          </div>
                          {alertDescription && (
                            <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                              {alertDescription}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '140px' }}>
                      {impact > 0 && !hideFinancials && (
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
                          ฿{formatCurrency(impact)}/mo
                        </div>
                      )}
                      {impact > 0 && hideFinancials && (
                        <div style={{ fontSize: '14px', color: '#9ca3af' }}>—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* BLOCK 3: Performance Movement — industry-aware labels */}
        <SectionCard title={locale === 'th' ? 'แนวโน้มธุรกิจ' : 'Trend Pulse'}>
          <div style={{ padding: '1.5rem' }}>
            {/* Health Score Trend Chart (simplified) */}
            {/* PHASE 3: Override hasInsufficientData if snapshots exist (daily metrics provide 40+ days) */}
            {healthScoreTrend && (!healthScoreTrend.hasInsufficientData || healthScoreTrend.snapshots.length > 0) ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.75rem' }}>
                  {locale === 'th' ? 'เทรนด์คะแนนสุขภาพ (30 วัน)' : 'Health Score Trend (30 Days)'}
                </div>
                <div style={{
                  height: '60px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '2px',
                }}>
                  {healthScoreTrend.snapshots.slice(-30).map((snapshot: { score: number; date: Date }, idx: number) => {
                    const height = (snapshot.score / 100) * 100;
                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: `${height}%`,
                          backgroundColor: snapshot.score >= 80 ? '#10b981' : snapshot.score >= 60 ? '#f59e0b' : '#ef4444',
                          borderRadius: '2px 2px 0 0',
                          minHeight: '2px',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                {locale === 'th' ? 'ข้อมูลไม่เพียงพอสำหรับแสดงเทรนด์' : 'Insufficient data to show trend'}
              </div>
            )}

            {/* Performance Metrics */}
            {performanceTrends ? (
              <div style={{
                display: 'flex',
                gap: '2rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'เทรนด์รายได้' : 'Revenue Trend'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: performanceTrends.revenueTrend > 5 ? '#10b981' : performanceTrends.revenueTrend < -5 ? '#ef4444' : '#6b7280',
                    }}>
                      {performanceTrends.revenueTrend > 0 ? '+' : ''}{performanceTrends.revenueTrend.toFixed(1)}%
                    </div>
                    {performanceTrends.revenueTrend > 5 && (
                      <span style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#10b98120', color: '#10b981' }}>
                        {locale === 'th' ? 'ดีขึ้น' : 'Improving'}
                      </span>
                    )}
                    {performanceTrends.revenueTrend < -5 && (
                      <span style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#ef444420', color: '#ef4444' }}>
                        {locale === 'th' ? 'แย่ลง' : 'Declining'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? `เทรนด์${hospitalityLabels.costLabel}` : 'Cost trend'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: performanceTrends.costTrend > 5 ? '#ef4444' : performanceTrends.costTrend < -5 ? '#10b981' : '#6b7280',
                    }}>
                      {performanceTrends.costTrend > 0 ? '+' : ''}{performanceTrends.costTrend.toFixed(1)}%
                    </div>
                    {performanceTrends.costTrend < -5 && (
                      <span style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#10b98120', color: '#10b981' }}>
                        {locale === 'th' ? 'ดีขึ้น' : 'Improving'}
                      </span>
                    )}
                    {performanceTrends.costTrend > 5 && (
                      <span style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#ef444420', color: '#ef4444' }}>
                        {locale === 'th' ? 'แย่ลง' : 'Declining'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? `เทรนด์${hospitalityLabels.occupancyOrSales}` : `${hospitalityLabels.occupancyOrSales} trend`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: performanceTrends.utilizationTrend > 5 ? '#10b981' : performanceTrends.utilizationTrend < -5 ? '#ef4444' : '#6b7280',
                    }}>
                      {performanceTrends.utilizationTrend > 0 ? '+' : ''}{performanceTrends.utilizationTrend.toFixed(1)}%
                    </div>
                    {performanceTrends.utilizationTrend > 5 && (
                      <span style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#10b98120', color: '#10b981' }}>
                        {locale === 'th' ? 'ดีขึ้น' : 'Improving'}
                      </span>
                    )}
                    {performanceTrends.utilizationTrend < -5 && (
                      <span style={{ padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: '#ef444420', color: '#ef4444' }}>
                        {locale === 'th' ? 'แย่ลง' : 'Declining'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                {dailyMetricsForTrends && dailyMetricsForTrends.length > 0 ? (
                  <div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      {locale === 'th' 
                        ? `มีข้อมูล ${dailyMetricsForTrends.length} วัน แต่ต้องการอย่างน้อย 14 วันสำหรับการคำนวณเทรนด์`
                        : `Have ${dailyMetricsForTrends.length} days of data, but need at least 14 days to calculate trends`}
                    </div>
                    {dailyMetricsForTrends.length < 14 && (
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {locale === 'th' 
                          ? `ต้องการอีก ${14 - dailyMetricsForTrends.length} วัน`
                          : `Need ${14 - dailyMetricsForTrends.length} more days`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {locale === 'th' 
                      ? 'ข้อมูลไม่เพียงพอสำหรับแสดงเทรนด์ (ต้องการอย่างน้อย 14 วัน)'
                      : 'Insufficient data to show trends (minimum 14 days required)'}
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* BLOCK 4: Active Alerts (Simplified) */}
        <SectionCard title={locale === 'th' ? 'การแจ้งเตือนที่ใช้งานอยู่' : 'Active Alerts'}>
          {activeAlerts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ไม่มีการแจ้งเตือนที่ใช้งานอยู่' : 'No active alerts'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeAlerts.map((alert) => {
                const severityColor = getSeverityColor(alert.severity);
                return (
                  <div
                    key={alert.id}
                    onClick={() => router.push(paths.branchAlertsWithQuery?.(alert.id) ?? paths.branchOverview ?? '/')}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0a0a0a' }}>
                          {alert.name}
                        </div>
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: severityColor + '20',
                          color: severityColor,
                        }}>
                          {getSeverityLabel(alert.severity, locale)}
                        </span>
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: '#e5e7eb',
                          color: '#6b7280',
                        }}>
                          {alert.category}
                        </span>
                      </div>
                      {alert.impact > 0 && !hideFinancials && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {locale === 'th' ? 'ผลกระทบรายได้: ' : 'Revenue impact: '}
                          <span style={{ fontWeight: 600, color: '#ef4444' }}>฿{formatCurrency(alert.impact)}/mo</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {alert.status}
                    </div>
                  </div>
                );
              })}
              {mergedBranchAlerts.length > 5 && (
                <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => router.push(paths.branchAlerts ?? paths.branchOverview ?? '/')}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: 'transparent',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#6b7280',
                      cursor: 'pointer',
                    }}
                  >
                    {locale === 'th' ? `ดูการแจ้งเตือนทั้งหมด (${mergedBranchAlerts.length})` : `View All Alerts (${mergedBranchAlerts.length})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* BLOCK 5: Recommended Actions (from branch_recommendations when available, else from alerts) */}
        <SectionCard title={locale === 'th' ? 'สิ่งที่คุณควรทำในสัปดาห์นี้' : 'What You Should Do This Week'}>
          {kpiRecommendations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {kpiRecommendations.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#eab308', marginTop: '0.375rem', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    {r.category && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem', textTransform: 'capitalize' }}>{r.category}</div>
                    )}
                    <div style={{ fontSize: '14px', color: '#0a0a0a', lineHeight: '1.4' }}>{r.recommendation}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : recommendedActions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {mergedBranchAlerts.length > 0
                ? (locale === 'th' ? 'รักษาแนวโน้มปัจจุบัน' : 'Maintain current trajectory')
                : (locale === 'th' ? 'ยังไม่มีแนวทางที่แนะนำในขณะนี้' : 'No suggested actions at this time')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recommendedActions.map((action, idx) => {
                const severityColor = getSeverityColor(action.severity || 'warning');
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                    }}
                  >
                    {/* Red Dot Indicator */}
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: severityColor,
                      marginTop: '0.375rem',
                      flexShrink: 0,
                    }} />
                    
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title with Severity Badge */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem', 
                        marginBottom: '0.5rem', 
                        flexWrap: 'wrap',
                      }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#0a0a0a', lineHeight: '1.4' }}>
                          {action.title}
                        </div>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: severityColor + '20',
                          color: severityColor,
                        }}>
                          {getSeverityLabel(action.severity || 'warning', locale)}
                        </span>
                      </div>
                      
                      {/* Explanation */}
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.5rem', lineHeight: '1.5' }}>
                        {action.explanation}
                      </div>
                      
                      {/* Suggested Action */}
                      <div style={{ fontSize: '13px', color: '#374151', fontWeight: 500, marginBottom: '0.5rem' }}>
                        💡 {action.suggestedAction}
                      </div>
                      
                      {/* Revenue Impact (hidden for viewer role) */}
                      {action.revenueImpact > 0 && !hideFinancials && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                          {locale === 'th' ? 'ผลกระทบโดยประมาณ: ' : 'Estimated impact: '}
                          <span style={{ fontWeight: 600, color: '#ef4444' }}>
                            ฿{formatCurrency(action.revenueImpact)} / {locale === 'th' ? 'เดือน' : 'month'}
                          </span>
                        </div>
                      )}
                      
                      {/* Take Action Button */}
                      <button
                        onClick={() => router.push(paths.branchAlertsWithQuery?.(action.alertId) ?? paths.branchOverview ?? '/')}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem 1rem',
                          backgroundColor: '#0a0a0a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {locale === 'th' ? 'ดำเนินการ' : 'Take Action'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <OperatingFooterTrust />
          </>
        )}
      </div>
    </PageLayout>
  );
}
