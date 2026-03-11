/**
 * Branch Alerts Page - Money Impact First
 * 
 * Decision-focused alerts view with financial clarity
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useAlertHistory } from '../../hooks/use-alert-history';
import { useResolvedBranchData } from '../../hooks/use-resolved-branch-data';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { useUserRole } from '../../contexts/user-role-context';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { formatCurrency } from '../../utils/formatting';
import { getSeverityColor, getSeverityLabel } from '../../utils/alert-utils';
import { formatDateTime } from '../../utils/date-utils';
import { safeNumber } from '../../utils/safe-number';
import { calculateRevenueExposure } from '../../utils/revenue-exposure-calculator';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { businessGroupService } from '../../services/business-group-service';
import type { ExtendedAlertContract } from '../../services/monitoring-service';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import { runAppAlertValidation, runFullAlertValidation } from '../../lib/run-alert-validation-app';
import { getBranchAlertsFromKpi, type BranchAlertRow } from '../../services/db/kpi-analytics-service';

/** Map branch_alerts rows to display list. Prefer alert_message + confidence_score; fallback to legacy columns. */
function flattenKpiAlerts(rows: BranchAlertRow[]): { id: string; message: string; type?: string; confidenceScore?: number | null }[] {
  const out: { id: string; message: string; type?: string; confidenceScore?: number | null }[] = [];
  rows.forEach((r, i) => {
    const baseId = `kpi-${r.branch_id}-${r.metric_date ?? i}`;
    const confidenceScore = r.confidence_score != null ? Number(r.confidence_score) : null;
    if (r.alert_message != null && String(r.alert_message).trim()) {
      out.push({ id: `${baseId}-msg`, message: String(r.alert_message).trim(), confidenceScore });
      return;
    }
    if (r.revenue_alert != null && String(r.revenue_alert).trim()) out.push({ id: `${baseId}-revenue`, message: String(r.revenue_alert), type: 'revenue', confidenceScore });
    if (r.customer_alert != null && String(r.customer_alert).trim()) out.push({ id: `${baseId}-customer`, message: String(r.customer_alert), type: 'customer', confidenceScore });
    if (r.occupancy_alert != null && String(r.occupancy_alert).trim()) out.push({ id: `${baseId}-occupancy`, message: String(r.occupancy_alert), type: 'occupancy', confidenceScore });
    if (r.cost_alert != null && String(r.cost_alert).trim()) out.push({ id: `${baseId}-cost`, message: String(r.cost_alert), type: 'cost', confidenceScore });
    if (r.cash_alert != null && String(r.cash_alert).trim()) out.push({ id: `${baseId}-cash`, message: String(r.cash_alert), type: 'cash', confidenceScore });
  });
  return out;
}

export default function BranchAlertsPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { alerts, loading, error, refreshAlerts } = useHospitalityAlerts();
  const { alerts: rawAlerts } = useAlertStore();
  const { branch } = useCurrentBranch();
  const { history } = useAlertHistory();
  const { role } = useUserRole();
  const hideFinancials = role?.canViewOnly === true;
  const [mounted, setMounted] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [validationRunning, setValidationRunning] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    branchType: 'accommodation' | 'fnb';
    totalTests: number;
    passed: number;
    failed: number;
    failures: Array<{ name: string; details?: string; expectedAlerts: string[]; triggeredAlerts: string[] }>;
  } | null>(null);
  const [fullValidationRunning, setFullValidationRunning] = useState(false);
  const [fullValidationResult, setFullValidationResult] = useState<string | null>(null);

  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter alerts for current branch only and exclude resolved alerts
  const branchAlerts = useMemo(() => {
    if (!mounted || !branch || !rawAlerts) return [];
    return rawAlerts.filter(alert => {
      // Must belong to current branch
      if (alert.branchId !== branch.id) return false;
      
      // PART 3: Exclude resolved alerts
      const extended = alert as ExtendedAlertContract;
      if (extended.status === 'resolved' || extended.resolvedAt) return false;
      
      return true;
    });
  }, [rawAlerts, branch, mounted]);

  // STEP 3: Use resolved branch data (single source of truth)
  const branchMetrics = useResolvedBranchData(branch?.id);
  
  // KPI layer: alerts from branch_alerts (preferred when available)
  const [kpiAlertsRows, setKpiAlertsRows] = useState<BranchAlertRow[]>([]);
  useEffect(() => {
    if (!branch?.id) return;
    getBranchAlertsFromKpi(branch.id).then(setKpiAlertsRows).catch(() => setKpiAlertsRows([]));
  }, [branch?.id]);

  const kpiAlertsDisplay = useMemo(() => flattenKpiAlerts(kpiAlertsRows), [kpiAlertsRows]);

  // Fallback: daily metrics for financial impact when using engine alerts
  const [dailyMetricsLast30Days, setDailyMetricsLast30Days] = useState<any[]>([]);
  useEffect(() => {
    if (!branch?.id) return;
    const { getDailyMetrics } = require('../../services/db/daily-metrics-service');
    getDailyMetrics(branch.id, 30).then((m: any) => setDailyMetricsLast30Days(m || [])).catch(() => setDailyMetricsLast30Days([]));
  }, [branch?.id]);

  // PART 3: Calculate financial impact metrics using rolling 30 days from daily_metrics
  const financialMetrics = useMemo(() => {
    if (!branchAlerts.length) {
      return {
        totalRevenueAtRisk: 0,
        totalOpportunityGain: 0,
        criticalCount: 0,
        warningCount: 0,
      };
    }

    // PART 3: Deduplicate alerts by code before calculating
    const alertsByCode = new Map<string, AlertContract>();
    branchAlerts.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    const uniqueBranchAlerts = Array.from(alertsByCode.values());

    // Calculate exposure for risk alerts (non-opportunity) using calculateRevenueExposure
    const riskAlerts = uniqueBranchAlerts.filter(alert => {
      const extended = alert as ExtendedAlertContract;
      return extended.type !== 'opportunity';
    });
    
    let totalRevenueAtRisk = 0;
    if (branchMetrics && riskAlerts.length > 0) {
      // PART 3: Use calculateRevenueExposure which uses rolling metrics from daily_metrics
      const riskExposure = calculateRevenueExposure(branchMetrics, riskAlerts);
      totalRevenueAtRisk = riskExposure.totalMonthlyLeakage;
      
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        const alertsWithImpact = riskAlerts.filter(a => ((a as ExtendedAlertContract).revenueImpact ?? 0) > 0);
        console.log('[FinancialImpact] Risk alerts:', {
          total: riskAlerts.length,
          withRevenueImpact: alertsWithImpact.length,
          calculatedExposure: totalRevenueAtRisk,
          sumOfRevenueImpact: alertsWithImpact.reduce((sum, a) => sum + ((a as ExtendedAlertContract).revenueImpact || 0), 0),
        });
      }
      
      // Fallback: if calculated exposure is 0 but alerts have revenueImpact, use that
      if (totalRevenueAtRisk === 0) {
        const sumFromImpact = riskAlerts.reduce((sum, alert) => {
          const extended = alert as ExtendedAlertContract;
          return sum + (extended.revenueImpact || 0);
        }, 0);
        if (sumFromImpact > 0) {
          totalRevenueAtRisk = sumFromImpact;
          if (process.env.NODE_ENV === 'development') {
            console.log('[FinancialImpact] Using revenueImpact fallback:', sumFromImpact);
          }
        }
      }
    } else if (riskAlerts.length > 0) {
      // Fallback: use revenueImpact if available (when branchMetrics not available)
      totalRevenueAtRisk = riskAlerts.reduce((sum, alert) => {
        const extended = alert as ExtendedAlertContract;
        return sum + (extended.revenueImpact || 0);
      }, 0);
    }

    // Calculate opportunity gain from opportunity alerts
    // Opportunities use revenueImpact directly (already calculated as potential gain)
    const opportunityAlerts = uniqueBranchAlerts.filter(alert => {
      const extended = alert as ExtendedAlertContract;
      return extended.type === 'opportunity';
    });
    
    let totalOpportunityGain = 0;
    if (opportunityAlerts.length > 0 && branchMetrics) {
      // Use revenueImpact directly if available (it's already calculated as potential gain)
      totalOpportunityGain = opportunityAlerts.reduce((sum, alert) => {
        const extended = alert as ExtendedAlertContract;
        const impact = extended.revenueImpact || 0;
        return sum + (impact > 0 ? impact : 0);
      }, 0);
      
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[FinancialImpact] Opportunity alerts:', {
          total: opportunityAlerts.length,
          withRevenueImpact: opportunityAlerts.filter(a => ((a as ExtendedAlertContract).revenueImpact ?? 0) > 0).length,
          totalGain: totalOpportunityGain,
        });
      }
      
      // If no revenueImpact, calculate potential gain based on alert type
      if (totalOpportunityGain === 0) {
        opportunityAlerts.forEach(alert => {
          const alertId = alert.id.toLowerCase();
          
          // Unused capacity opportunity (accommodation)
          if ((alertId.includes('capacity') || alertId.includes('occupancy') || alertId.includes('utilization'))
              && branchMetrics.modules.accommodation) {
            const occupancy = safeNumber(branchMetrics.modules.accommodation.occupancyRateLast30DaysPct, 0) / 100;
            const targetOccupancy = 0.75; // 75% target
            const rooms = safeNumber(branchMetrics.modules.accommodation.totalRoomsAvailable, 0);
            const adr = safeNumber(branchMetrics.modules.accommodation.averageDailyRoomRateTHB, 0);
            
            if (occupancy < targetOccupancy && rooms > 0 && adr > 0) {
              const occupancyGap = targetOccupancy - occupancy;
              const dailyGain = occupancyGap * rooms * adr;
              const monthlyGain = dailyGain * 30;
              totalOpportunityGain += Math.max(0, monthlyGain);
            }
          }
          
          // F&B opportunity (increase ticket size or customers)
          if ((alertId.includes('fnb') || alertId.includes('menu') || alertId.includes('customer'))
              && branchMetrics.modules.fnb) {
            const avgTicket = safeNumber(branchMetrics.modules.fnb.averageTicketPerCustomerTHB, 0);
            const expectedTicket = avgTicket * 1.2; // 20% higher potential
            const customers7d = safeNumber(branchMetrics.modules.fnb.totalCustomersLast7Days, 0);
            const customers30d = customers7d * (30 / 7);
            
            if (avgTicket < expectedTicket && customers30d > 0) {
              const ticketGap = expectedTicket - avgTicket;
              const monthlyGain = ticketGap * customers30d;
              totalOpportunityGain += Math.max(0, monthlyGain);
            }
          }
        });
      }
    }

    return {
      totalRevenueAtRisk: safeNumber(totalRevenueAtRisk, 0),
      totalOpportunityGain: safeNumber(totalOpportunityGain, 0),
      criticalCount: uniqueBranchAlerts.filter(a => a.severity === 'critical').length,
      warningCount: uniqueBranchAlerts.filter(a => a.severity === 'warning').length,
    };
  }, [branchAlerts, branchMetrics, dailyMetricsLast30Days]); // PART 3: Include dailyMetricsLast30Days for rolling 30-day calculation

  // Get top 3 money drivers (by impact)
  // FIX: Deduplicate by code and group by category, show only top 3
  const topMoneyDrivers = useMemo(() => {
    // Deduplicate by code first
    const alertsByCode = new Map<string, AlertContract>();
    branchAlerts.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    
    // Filter alerts with impact and group by category
    const alertsWithImpact = Array.from(alertsByCode.values())
      .filter((alert): alert is ExtendedAlertContract => {
        const extended = alert as ExtendedAlertContract;
        return extended.revenueImpact !== undefined && extended.revenueImpact > 0;
      });
    
    // Group by category (domain), take top from each category
    const alertsByCategory = new Map<string, ExtendedAlertContract[]>();
    alertsWithImpact.forEach(alert => {
      const category = alert.domain || 'general';
      const existing = alertsByCategory.get(category) || [];
      existing.push(alert as ExtendedAlertContract);
      alertsByCategory.set(category, existing);
    });
    
    // Get top alert from each category, then sort by impact
    const topFromEachCategory: ExtendedAlertContract[] = [];
    alertsByCategory.forEach((alerts) => {
      const top = alerts.sort((a, b) => (b.revenueImpact || 0) - (a.revenueImpact || 0))[0];
      topFromEachCategory.push(top);
    });
    
    // Sort all by impact and return top 3
    return topFromEachCategory
      .sort((a, b) => (b.revenueImpact || 0) - (a.revenueImpact || 0))
      .slice(0, 3);
  }, [branchAlerts]);

  // Get active alerts (simplified) with deduplication
  // FIX: Deduplicate by code first (most reliable), then by ID, then by content
  const activeAlerts = useMemo(() => {
    // FIX: Deduplicate by code first
    const alertsByCode = new Map<string, AlertContract>();
    branchAlerts.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    
    // Deduplicate alerts by ID (keep first occurrence)
    const alertsById = new Map<string, AlertContract>();
    Array.from(alertsByCode.values()).forEach(alert => {
      if (!alertsById.has(alert.id)) {
        alertsById.set(alert.id, alert);
      }
    });

    // Then deduplicate by content signature (message + severity + domain)
    const seenContent = new Set<string>();
    const uniqueAlerts: AlertContract[] = [];
    
    alertsById.forEach(alert => {
      const contentKey = `${alert.message || ''}|${alert.severity}|${alert.domain || ''}`;
      if (!seenContent.has(contentKey)) {
        seenContent.add(contentKey);
        uniqueAlerts.push(alert);
      }
    });

    return uniqueAlerts.map(alert => {
      const extended = alert as ExtendedAlertContract;
      
      // Clean up alert title - remove confusing ": 0" patterns and "within 0 days"
      let alertName = extended.revenueImpactTitle || alert.message.split('.')[0] || alert.message;
      
      // Remove "within 0 days" patterns (replace with "immediately")
      alertName = alertName.replace(/\s+within\s+0\s+days?/gi, ' immediately');
      alertName = alertName.replace(/\s+within\s+0\.0\s+days?/gi, ' immediately');
      
      // Remove duplicate "0 days" patterns
      alertName = alertName.replace(/\s*\.\s*0\s+days?\s*$/i, '');
      alertName = alertName.replace(/\s+0\s+days?\s*\.\s*0\s+days?\s*$/i, '');
      
      if (alertName.includes(':') && alertName.split(':').length > 1) {
        const parts = alertName.split(':');
        const lastPart = parts[parts.length - 1].trim();
        // Remove ": 0" or ": 0.0" patterns
        if (lastPart === '0' || lastPart === '0.0') {
          alertName = parts.slice(0, -1).join(':').trim();
        } else {
          alertName = lastPart || parts[0].trim();
        }
      }
      // Remove ": 0" at the end
      alertName = alertName.replace(/:\s*0(\.\d+)?\s*$/, '').trim() || alertName;
      
      // Calculate impact using revenue exposure calculator
      let impact = 0;
      if (branchMetrics) {
        const exposure = calculateRevenueExposure(branchMetrics, [alert]);
        impact = exposure.totalMonthlyLeakage;
      } else {
        // Fallback to revenueImpact if available
        impact = extended.revenueImpact || 0;
      }
      
      // Determine status based on history
      const historyItem = history.find(h => h.alertId === alert.id);
      let status: 'New' | 'Ongoing' | 'Improved' = 'New';
      if (historyItem) {
        if (historyItem.outcome === 'Resolved') {
          status = 'Improved';
        } else {
          status = 'Ongoing';
        }
      }
      
      return {
        id: alert.id,
        name: alertName,
        impact,
        status,
        confidence: Math.round((alert.confidence || 0.75) * 100),
        severity: alert.severity,
        domain: alert.domain || 'general',
      };
    });
  }, [branchAlerts, history, branchMetrics]);

  // Get resolved/improved alerts
  const resolvedAlerts = useMemo(() => {
    return history
      .filter(item => item.outcome === 'Resolved')
      .map(item => {
        const alert = branchAlerts.find(a => a.id === item.alertId);
        if (!alert) return null;
        return {
          id: item.id,
          alertId: item.alertId,
          name: item.title,
          beforeSeverity: alert.severity, // Assume current severity is "after"
          afterSeverity: 'informational' as const, // Resolved = informational
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 10); // Last 10 resolved
  }, [history, branchAlerts]);

  // Get category label
  const getCategoryLabel = (domain: string): string => {
    const categories: Record<string, { en: string; th: string }> = {
      cash: { en: 'Cash', th: 'เงินสด' },
      risk: { en: 'Risk', th: 'ความเสี่ยง' },
      demand: { en: 'Demand', th: 'ความต้องการ' },
      forecast: { en: 'Demand', th: 'ความต้องการ' },
      labor: { en: 'Cost', th: 'ต้นทุน' },
    };
    return categories[domain]?.[locale] || domain;
  };

  if (!mounted) {
    return (
      <PageLayout title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
        <ErrorState
          message={error instanceof Error ? error.message : String(error)}
          action={{
            label: locale === 'th' ? 'ลองอีกครั้ง' : 'Try Again',
            onClick: refreshAlerts,
          }}
        />
      </PageLayout>
    );
  }

  if (!branch) {
    return (
      <PageLayout title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
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
    <PageLayout title="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Alerts from intelligence engine (branch_alerts) — primary source */}
        <SectionCard title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
          {kpiAlertsDisplay.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ไม่มีการแจ้งเตือนจากระบบวิเคราะห์ในขณะนี้' : 'No alerts from the intelligence engine at this time.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {kpiAlertsDisplay.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#fefce8',
                    border: '1px solid #eab308',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#0a0a0a',
                  }}
                >
                  <div style={{ marginBottom: a.confidenceScore != null ? '0.5rem' : 0 }}>{a.message}</div>
                  {a.confidenceScore != null && (
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {locale === 'th' ? 'ความมั่นใจ: ' : 'Confidence: '}
                      <strong>{Math.round(a.confidenceScore)}%</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* SECTION 1: Revenue Risk Summary (engine alerts; when no KPI alerts or in addition) */}
        <SectionCard title={locale === 'th' ? 'ผลกระทบทางการเงิน (30 วันล่าสุด)' : 'Financial Impact (Last 30 Days)'}>
          {kpiAlertsDisplay.length > 0 && branchAlerts.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ใช้การแจ้งเตือนจากระบบวิเคราะห์ด้านบน' : 'Using alerts from analytics layer above.'}
            </div>
          ) : branchAlerts.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ไม่พบความเสี่ยงทางการเงิน' : 'No financial risks detected.'}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              padding: '1.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
            }}>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'รายได้ที่เสี่ยง' : 'Total Revenue at Risk'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#ef4444' }}>
                  {hideFinancials ? '—' : `฿${formatCurrency(financialMetrics.totalRevenueAtRisk)}/mo`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'โอกาสเพิ่มรายได้' : 'Total Opportunity Gain'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>
                  {hideFinancials ? '—' : `฿${formatCurrency(financialMetrics.totalOpportunityGain)}/mo`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'การแจ้งเตือนวิกฤต' : 'Critical Alerts'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: getSeverityColor('critical') }}>
                  {financialMetrics.criticalCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'คำเตือน' : 'Warnings'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: getSeverityColor('warning') }}>
                  {financialMetrics.warningCount}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        {/* SECTION 2: Top 3 Money Drivers */}
        {topMoneyDrivers.length > 0 && (
          <SectionCard title={locale === 'th' ? 'พื้นที่ที่มีผลกระทบมากที่สุด' : 'Biggest Impact Areas'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {topMoneyDrivers.map((alert, idx) => {
                const severityColor = getSeverityColor(alert.severity);
                return (
                  <div
                    key={alert.id}
                    onClick={() => router.push(`/branch/alerts?alert=${alert.id}`)}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '1rem',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a' }}>
                          {alert.revenueImpactTitle || alert.message.split('.')[0]}
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
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: '#e5e7eb',
                          color: '#6b7280',
                        }}>
                          {getCategoryLabel(alert.domain || 'general')}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.5' }}>
                        {alert.revenueImpactDescription || alert.message}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '140px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: alert.type === 'opportunity' ? '#10b981' : '#ef4444' }}>
                        {hideFinancials ? '—' : `฿${formatCurrency(alert.revenueImpact || 0)}/mo`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* SECTION 3: All Active Alerts (Simplified) */}
        <SectionCard title={locale === 'th' ? 'การแจ้งเตือนที่ใช้งานอยู่ทั้งหมด' : 'All Active Alerts'}>
          {activeAlerts.length === 0 ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
                {locale === 'th' ? '✓ ระบบเสถียร' : '✓ System stable'}
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                {locale === 'th' 
                  ? 'ไม่พบการแจ้งเตือนที่ใช้งานอยู่ในขณะนี้'
                  : 'No active alerts detected. System is operating normally.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeAlerts.map((alert) => {
                const severityColor = getSeverityColor(alert.severity);
                const statusColors = {
                  New: { bg: '#dbeafe', text: '#1e40af' },
                  Ongoing: { bg: '#fef3c7', text: '#92400e' },
                  Improved: { bg: '#d1fae5', text: '#065f46' },
                };
                const statusColor = statusColors[alert.status];
                
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
                      gap: '1rem',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0a0a0a' }}>
                          {alert.name}
                        </div>
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                        }}>
                          {alert.status}
                        </span>
                      </div>
                      {alert.impact > 0 && !hideFinancials ? (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {locale === 'th' ? 'ผลกระทบ: ' : 'Impact: '}
                          <span style={{ fontWeight: 600, color: '#ef4444' }}>฿{formatCurrency(alert.impact)}/mo</span>
                          {' • '}
                          {locale === 'th' ? 'ความมั่นใจ: ' : 'Confidence: '}
                          {alert.confidence}%
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {locale === 'th' ? 'ความมั่นใจ: ' : 'Confidence: '}
                          {alert.confidence}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* SECTION 4: Resolved / Improved Alerts (Collapsible) */}
        {resolvedAlerts.length > 0 && (
          <SectionCard title={locale === 'th' ? 'ปัญหาที่แก้ไขล่าสุด' : 'Recently Improved Issues'}>
            <button
              onClick={() => setShowResolved(!showResolved)}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: showResolved ? '1rem' : 0,
              }}
            >
              <span>
                {locale === 'th' 
                  ? `แสดง ${resolvedAlerts.length} รายการที่แก้ไขแล้ว`
                  : `Show ${resolvedAlerts.length} resolved items`}
              </span>
              <span>{showResolved ? '▲' : '▼'}</span>
            </button>
            
            {showResolved && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {resolvedAlerts.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>
                          {locale === 'th' ? 'ก่อน: ' : 'Before: '}
                          <span style={{
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: getSeverityColor(item.beforeSeverity) + '20',
                            color: getSeverityColor(item.beforeSeverity),
                          }}>
                            {getSeverityLabel(item.beforeSeverity, locale)}
                          </span>
                        </span>
                        <span>→</span>
                        <span>
                          {locale === 'th' ? 'หลัง: ' : 'After: '}
                          <span style={{
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: getSeverityColor(item.afterSeverity) + '20',
                            color: getSeverityColor(item.afterSeverity),
                          }}>
                            {getSeverityLabel(item.afterSeverity, locale)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* Dev-only: Alert Engine Validation */}
        {process.env.NODE_ENV === 'development' && branch && (
          <SectionCard title="Run Alert Engine Validation">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                Run deterministic tests for all 16 alerts (and optional full suite). Does not affect production.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                <button
                  type="button"
                  disabled={validationRunning || fullValidationRunning}
                  onClick={async () => {
                    setValidationRunning(true);
                    setValidationResult(null);
                    setFullValidationResult(null);
                    try {
                      const branchType =
                        (branch as any)?.moduleType === 'fnb' || (branch as any)?.module_type === 'fnb'
                          ? 'fnb'
                          : 'accommodation';
                      const result = await runAppAlertValidation(branchType);
                      setValidationResult({
                        branchType,
                        totalTests: result.totalTests,
                        passed: result.passed,
                        failed: result.failed,
                        failures: result.failures.map((f) => ({
                          name: f.name,
                          details: f.details,
                          expectedAlerts: f.expectedAlerts,
                          triggeredAlerts: f.triggeredAlerts,
                        })),
                      });
                    } catch (e) {
                      setValidationResult({
                        branchType: 'accommodation',
                        totalTests: 0,
                        passed: 0,
                        failed: 1,
                        failures: [
                          { name: 'Error', details: e instanceof Error ? e.message : String(e), expectedAlerts: [], triggeredAlerts: [] },
                        ],
                      });
                    } finally {
                      setValidationRunning(false);
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '14px',
                    fontWeight: 600,
                    backgroundColor: validationRunning || fullValidationRunning ? '#9ca3af' : '#0a0a0a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: validationRunning || fullValidationRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {validationRunning ? 'Running…' : 'Run for current branch type'}
                </button>
                <button
                  type="button"
                  disabled={validationRunning || fullValidationRunning}
                  onClick={async () => {
                    setFullValidationRunning(true);
                    setValidationResult(null);
                    setFullValidationResult(null);
                    try {
                      const out = await runFullAlertValidation();
                      setFullValidationResult(out.summary);
                    } catch (e) {
                      setFullValidationResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
                    } finally {
                      setFullValidationRunning(false);
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '14px',
                    fontWeight: 600,
                    backgroundColor: validationRunning || fullValidationRunning ? '#9ca3af' : '#374151',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: validationRunning || fullValidationRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {fullValidationRunning ? 'Running…' : 'Run full (Acc + F&B + scenarios)'}
                </button>
              </div>
              {validationResult && (
                <div style={{ marginTop: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>
                      ✔ Passed: {validationResult.passed}/{validationResult.totalTests}
                    </span>
                    {validationResult.failed > 0 && (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Failed: {validationResult.failed}</span>
                    )}
                  </div>
                  {validationResult.failures.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '13px', color: '#374151' }}>
                      {validationResult.failures.map((f, i) => (
                        <li key={i} style={{ marginBottom: '0.25rem' }}>
                          <strong>{f.name}</strong>: {f.details ?? `expected [${f.expectedAlerts.join(', ')}], got [${f.triggeredAlerts.join(', ')}]`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {fullValidationResult && (
                <pre style={{
                  margin: 0,
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '12px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '6px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {fullValidationResult}
                </pre>
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </PageLayout>
  );
}
