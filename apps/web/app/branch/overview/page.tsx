/**
 * Branch Overview Page - Decision-Focused Dashboard
 * 
 * 5-block layout: Health Snapshot → Revenue Leaks → Performance Movement → Active Alerts → Recommended Actions
 */
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { calculateHealthScoreFromAlerts, type HealthScoreCalculationResult } from '../../../../../core/sme-os/engine/services/alert-health-score-mapper';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { MonitoringStatusCard } from '../../components/monitoring-status-card';
import { CriticalAlertsSnapshot } from '../../components/alerts/critical-alerts-snapshot';
import { MonitoringErrorBoundary } from '../../components/monitoring-error-boundary';
import { HealthScoreFallback } from '../../components/health-score-fallback';
import { AlertsFallback } from '../../components/alerts-fallback';
import { formatCurrency } from '../../utils/formatting';
import { getSeverityColor, getSeverityLabel } from '../../utils/alert-utils';
import { safeNumber } from '../../utils/safe-number';
import { calculateRevenueExposure } from '../../utils/revenue-exposure-calculator';
import { runPlatformAudit } from '../../services/platform-audit-service';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { useIntelligenceStageBranch } from '../../hooks/use-intelligence-stage';
import { useAnomalySignals } from '../../hooks/use-anomaly-signals';
import { isFullyActive } from '../../utils/intelligence-stage';
import { IntelligenceInitializationCard } from '../../components/intelligence-initialization-card';
import { useUserRole } from '../../contexts/user-role-context';
import { OperatingHeader } from '../../components/operating-layer/operating-header';
import { OperatingSection } from '../../components/operating-layer/operating-section';
import { DailyPrompt } from '../../components/operating-layer/daily-prompt';
import { OperatingFooterTrust } from '../../components/operating-layer/operating-footer-trust';
import { getHospitalityLabels } from '../../utils/hospitality-labels';
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
  
  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });
  const { coverageDays, stage } = useIntelligenceStageBranch(branch?.id ?? null, branch?.moduleType);
  const { anomalyAlertsAsContracts, confidenceScore: anomalyConfidenceScore } = useAnomalySignals(
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

  // Merge anomaly alerts (branch_anomaly_signals) so early signals show after ~7 days
  const mergedBranchAlerts = useMemo(() => {
    if (!branch?.id) return [];
    const byId = new Map<string, AlertContract>();
    branchAlerts.forEach(a => byId.set(a.id, a));
    anomalyAlertsAsContracts.forEach(a => {
      if (!byId.has(a.id)) byId.set(a.id, a);
    });
    return Array.from(byId.values());
  }, [branch?.id, branchAlerts, anomalyAlertsAsContracts]);

  // PHASE 3: Calculate performance trends from daily_metrics
  // Compare last 7 days vs previous 7 days (requires minimum 14 days)
  // PART 1.1: Declare before branchHealthScore useMemo to avoid initialization error
  const [dailyMetricsForTrends, setDailyMetricsForTrends] = useState<DailyMetric[] | null>(null);
  

  // Calculate branch health score directly from active alerts weighted by money impact
  // Health score must compute from active alerts weighted by money impact
  // Wrapped in try-catch for safety
  const branchHealthScore = useMemo(() => {
    if (!branch || !branch.id || branchAlerts.length === 0) return null;
    
    try {
      // Calculate health score from active alerts weighted by money impact
      const healthScoreResult = calculateHealthScoreFromAlerts(branchAlerts as AlertContract[]);
      // Ensure score is valid (0-100, never NaN)
      const healthScore = Math.max(0, Math.min(100, healthScoreResult.score || 0));
      if (isNaN(healthScore) || !isFinite(healthScore)) {
        return null; // Return null to trigger fallback UI
      }
    
    // Calculate data confidence: freshnessScore * 0.5 + dependencyCoverageScore * 0.5
    const businessGroup = businessGroupService.getBusinessGroup();
    if (!businessGroup) return null;
    
    const branchSignals = operationalSignalsService.getAllSignals(branch.id, businessGroup.id);
    const latestSignal = branchSignals[0];
    
    // Calculate freshness score (0-100)
    const now = new Date();
    const dataAgeMs = latestSignal 
      ? now.getTime() - latestSignal.timestamp.getTime()
      : Infinity;
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
    const freshnessScore = latestSignal && dataAgeDays <= 7
      ? 100
      : latestSignal && dataAgeDays > 7
      ? Math.max(0, 100 - (dataAgeDays - 7) * 5)
      : 0;
    
    // Calculate dependency coverage score (0-100)
    let dependencyCoverageScore = 0;
    try {
      const latestMetrics = operationalSignalsService.getLatestMetrics(branch.id, businessGroup.id, undefined);
      if (latestMetrics) {
        const { calculateDataConfidence } = require('../../models/branch-metrics');
        const dependencyScore = calculateDataConfidence(latestMetrics);
        dependencyCoverageScore = dependencyScore; // Already 0-100
      } else {
        // Fallback: use signal count as proxy
        const signalCount = branchSignals.length;
        dependencyCoverageScore = signalCount >= 14 ? 100 : signalCount >= 7 ? 85 : signalCount >= 3 ? 70 : 50;
      }
    } catch (e) {
      // Fallback: use signal count as proxy
      const signalCount = branchSignals.length;
      dependencyCoverageScore = signalCount >= 14 ? 100 : signalCount >= 7 ? 85 : signalCount >= 3 ? 70 : 50;
    }
    
    // Data confidence = freshnessScore * 0.5 + dependencyCoverageScore * 0.5 (convert to 0-1)
    let dataConfidence = (freshnessScore * 0.5 + dependencyCoverageScore * 0.5) / 100;
    
    // PART 1.1: Fix confidence calculation - ensure never shows 0 when data exists
    // Confidence must NEVER show 0 if >= 7 days of data exist OR required daily metrics exist
    // Use dailyMetricsForTrends for actual data existence (most accurate)
    const hasRequiredData = branchSignals.length > 0 && latestSignal !== undefined;
    const hasDailyMetrics = dailyMetricsForTrends && dailyMetricsForTrends.length > 0;
    
    // Calculate actual data coverage from daily_metrics (most accurate)
    let actualDataCoverage = 0;
    if (hasDailyMetrics) {
      // Count unique days with data
      const uniqueDays = new Set(dailyMetricsForTrends.map(m => m.date));
      actualDataCoverage = uniqueDays.size;
    } else if (coverageDays > 0) {
      actualDataCoverage = coverageDays;
    }
    
    // PART 1.1: Confidence guard - never show 0 if data exists
    // Confidence must be computed from: Data coverage, Missing required fields, Freshness, Data mode (real vs simulation)
    // Minimum confidence floor = 40 if basic daily data exists
    // Minimum confidence floor = 60 if >= 7 days exist
    
    // Guard: if (confidence <= 0 && dataCoverage > 7 days) { confidence = 60; }
    if (actualDataCoverage >= 7 && dataConfidence <= 0) {
      dataConfidence = 0.60; // Minimum 60% if we have 7+ days
    }
    
    // Additional guards for different coverage levels
    if (actualDataCoverage >= 7) {
      // If we have >= 7 days of data, ensure minimum confidence floor
      if (dataConfidence <= 0) {
        dataConfidence = 0.60; // Minimum 60% if we have 7+ days
      } else if (dataConfidence < 0.40) {
        dataConfidence = Math.max(0.40, dataConfidence); // Minimum floor of 40% if basic data exists
      }
    } else if (actualDataCoverage > 0 && dataConfidence <= 0) {
      // If we have any daily data, ensure minimum floor
      dataConfidence = 0.40; // Minimum floor of 40% if any daily data exists
    } else if (hasRequiredData && dataConfidence <= 0) {
      // If we have required signals/metrics but no daily data count, still set minimum
      dataConfidence = 0.40; // Minimum floor of 40% if basic data exists
    }
    
    
    // Final guard: Confidence must NEVER show 0 if >= 7 days of data exist OR required daily metrics exist
    if (actualDataCoverage >= 7 && dataConfidence <= 0) {
      dataConfidence = 0.60; // Force 60% if we have 7+ days
    } else if (actualDataCoverage > 0 && dataConfidence <= 0) {
      dataConfidence = 0.40; // Force 40% if we have any data
    }
    
    // Ensure confidence is valid (0-1)
    dataConfidence = Math.max(0, Math.min(1, dataConfidence));
    
    // Get alert counts directly from branchAlerts
    const alertCountsFromResult = {
      critical: branchAlerts.filter(a => a.severity === 'critical').length,
      warning: branchAlerts.filter(a => a.severity === 'warning').length,
      informational: branchAlerts.filter(a => a.severity === 'informational').length,
    };
    
      return {
        healthScore,
        dataConfidence,
        alertCounts: alertCountsFromResult,
      };
    } catch (e) {
      // Log error in DEV mode only
      if (process.env.NODE_ENV === 'development') {
        console.error('[BranchOverview] Error calculating health score:', e);
      }
      return null; // Return null to trigger fallback UI
    }
  }, [branch, branchAlerts, coverageDays, dailyMetricsForTrends]); // PART 1.1 & 2: Include dailyMetricsForTrends to trigger recalculation

  // Calculate alert counts (include anomaly alerts for display)
  const alertCounts = useMemo(() => {
    return {
      critical: mergedBranchAlerts.filter(a => a.severity === 'critical').length,
      warning: mergedBranchAlerts.filter(a => a.severity === 'warning').length,
      informational: mergedBranchAlerts.filter(a => a.severity === 'informational').length,
      total: mergedBranchAlerts.length,
    };
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

  // Determine health status label
  const healthStatus = useMemo(() => {
    if (!branchHealthScore) return null;
    const score = branchHealthScore.healthScore;
    if (score >= 80) return { label: locale === 'th' ? 'เสถียร' : 'Stable', color: '#10b981' };
    if (score >= 60) return { label: locale === 'th' ? 'มีความเสี่ยง' : 'At Risk', color: '#f59e0b' };
    return { label: locale === 'th' ? 'วิกฤต' : 'Critical', color: '#ef4444' };
  }, [branchHealthScore, locale]);

  const hospitalityLabels = getHospitalityLabels(branch ?? null, locale === 'th' ? 'th' : 'en');

  // Latest daily metric (most recent by date) for Today's Revenue / Customers cards
  const latestDailyMetric = useMemo(() => {
    if (!dailyMetricsForTrends?.length) return null;
    const sorted = [...dailyMetricsForTrends].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted[0] ?? null;
  }, [dailyMetricsForTrends]);

  // Early signal one-liner for Mission Control card
  const earlySignalText = useMemo(() => {
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
  }, [performanceTrends, mergedBranchAlerts, coverageDays, locale]);

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
    <PageLayout title="" subtitle={branch?.branchName ?? ''}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Mission Control: business intelligence cards first */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '1rem',
        }}>
          <div style={{ padding: '1rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
              {locale === 'th' ? 'คะแนนสุขภาพธุรกิจ' : 'Business Health Score'}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: branchHealthScore != null ? (branchHealthScore.healthScore >= 80 ? '#10b981' : branchHealthScore.healthScore >= 60 ? '#f59e0b' : '#ef4444') : '#9ca3af' }}>
              {branchHealthScore != null ? `${Math.round(branchHealthScore.healthScore)}` : '—'}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>/ 100</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
              {locale === 'th' ? 'รายได้วันนี้' : "Today's Revenue"}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a' }}>
              {latestDailyMetric?.revenue != null ? `฿${formatCurrency(latestDailyMetric.revenue)}` : '—'}
            </div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
              {locale === 'th' ? 'ลูกค้า' : 'Customers'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a' }}>
              {latestDailyMetric?.customers != null ? latestDailyMetric.customers : '—'}
            </div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
              {locale === 'th' ? 'สัญญาณเบื้องต้น' : 'Early Signal'}
            </div>
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.3 }} title={earlySignalText}>
              {earlySignalText}
            </div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
              {locale === 'th' ? 'ความมั่นใจ' : 'Confidence'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a' }}>
              {anomalyConfidenceScore != null ? `${anomalyConfidenceScore}%` : branchHealthScore?.dataConfidence != null ? `${Math.round(branchHealthScore.dataConfidence * 100)}%` : '—'}
            </div>
          </div>
        </div>

        {/* System Learning / Data coverage — below intelligence cards */}
        {!fullyActive ? (
          <IntelligenceInitializationCard coverageDays={coverageDays} locale={locale === 'th' ? 'th' : 'en'} />
        ) : (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
          }}>
            {locale === 'th' ? 'ความครอบคลุมข้อมูล: ' : 'Data coverage: '}
            <strong>{dataCoverageDays}</strong> / 30 {locale === 'th' ? 'วัน' : 'days'}
          </div>
        )}

        {fullyActive && (
          <>
        <OperatingHeader />
        <DailyPrompt
          lastUpdated={lastUpdated ? new Date(lastUpdated).toISOString() : null}
          logTodayHref={paths.branchLog}
        />
        {/* Section A — สถานะธุรกิจวันนี้ */}
        <OperatingSection title="สถานะธุรกิจวันนี้">
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

        {/* BLOCK 1: Branch Health Snapshot */}
        <MonitoringErrorBoundary
          componentName="Branch Health Snapshot"
          fallback={
            <SectionCard title={locale === 'th' ? 'ภาพรวมสุขภาพสาขา' : 'Branch Health Snapshot'}>
              <HealthScoreFallback />
            </SectionCard>
          }
        >
          {branchHealthScore ? (
            <SectionCard title={locale === 'th' ? 'ภาพรวมสุขภาพสาขา' : 'Branch Health Snapshot'}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
            }}>
              {/* Left: Health Score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'คะแนนสุขภาพ' : 'Health Score'}
                  </div>
                  <div style={{
                    fontSize: '48px',
                    fontWeight: 700,
                    color: branchHealthScore.healthScore >= 80 ? '#10b981' : branchHealthScore.healthScore >= 60 ? '#f59e0b' : '#ef4444',
                    lineHeight: '1',
                  }}>
                    {Math.round(branchHealthScore.healthScore)}
                  </div>
                </div>
                <div>
                  <div style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: healthStatus?.color + '20',
                    color: healthStatus?.color,
                  }}>
                    {healthStatus?.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                    {locale === 'th' ? `ความมั่นใจ: ${anomalyConfidenceScore ?? Math.round(branchHealthScore.dataConfidence * 100)}%` : `Confidence: ${anomalyConfidenceScore ?? Math.round(branchHealthScore.dataConfidence * 100)}%`}
                  </div>
                </div>
              </div>

              {/* Right: Metrics */}
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a' }}>
                    {alertCounts.critical > 0 && <span style={{ color: '#ef4444' }}>{alertCounts.critical}</span>}
                    {alertCounts.warning > 0 && <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>{alertCounts.warning}</span>}
                    {alertCounts.informational > 0 && <span style={{ color: '#3b82f6', marginLeft: '0.5rem' }}>{alertCounts.informational}</span>}
                    {alertCounts.total === 0 && <span style={{ color: '#6b7280' }}>0</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'รายได้ที่เสี่ยง' : 'Revenue at Risk'}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: totalRevenueAtRisk > 0 ? '#ef4444' : '#10b981' }}>
                    {hideFinancials ? '—' : `฿${formatCurrency(totalRevenueAtRisk)}/mo`}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'ความสดของข้อมูล' : 'Data Freshness'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#0a0a0a' }}>
                    {lastUpdated ? new Date(lastUpdated).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
          ) : anomalyConfidenceScore != null ? (
            <SectionCard title={locale === 'th' ? 'ภาพรวมสุขภาพสาขา' : 'Branch Health Snapshot'}>
              <div style={{ padding: '1.5rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {locale === 'th' ? 'ความมั่นใจ: ' : 'Confidence: '}
                  <strong>{anomalyConfidenceScore}%</strong>
                </div>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', marginBottom: 0 }}>
                  {locale === 'th' ? 'สัญญาณจากข้อมูลล่าสุด (รอข้อมูลเพิ่มสำหรับคะแนนสุขภาพ)' : 'Early signals from latest data (more data needed for full health score)'}
                </p>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title={locale === 'th' ? 'ภาพรวมสุขภาพสาขา' : 'Branch Health Snapshot'}>
              <HealthScoreFallback />
            </SectionCard>
          )}
        </MonitoringErrorBoundary>
        </OperatingSection>

        {/* Section B — ระบบเตือนความเสี่ยง */}
        <OperatingSection title="ระบบเตือนความเสี่ยง">
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
                    onClick={() => router.push(`/branch/alerts?alert=${alert.id}`)}
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
                    onClick={() => router.push(paths.branchAlerts || '/branch/alerts')}
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

        {/* BLOCK 5: Recommended Actions */}
        <SectionCard title={locale === 'th' ? 'สิ่งที่คุณควรทำในสัปดาห์นี้' : 'What You Should Do This Week'}>
          {recommendedActions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {/* PART 7: Show "Maintain current trajectory" if alerts exist but no suggested actions, otherwise show "No suggested actions" */}
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
                        onClick={() => router.push(`/branch/alerts?alert=${action.alertId}`)}
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
