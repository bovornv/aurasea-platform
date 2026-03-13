/**
 * Branch Alerts Page - Money Impact First
 * 
 * Decision-focused alerts view with financial clarity
 */
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { useUserRole } from '../../contexts/user-role-context';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { formatCurrency } from '../../utils/formatting';
import { getSeverityColor, getSeverityLabel } from '../../utils/alert-utils';
import { runAppAlertValidation, runFullAlertValidation } from '../../lib/run-alert-validation-app';
import {
  getAlertsFromBranchAlertsToday,
  getAlertsFromBranchIntelligenceEngine,
  getAlertsFromFnbAlertsToday,
  getFnbFinancialImpact,
  severityOrder,
  type BranchAlertsTodayRow,
  type BranchIntelligenceEngineRow,
  type FnbAlertsTodayRow,
  type FnbFinancialImpactRow,
} from '../../services/db/kpi-analytics-service';

/** Normalize alert_type from DB to key (e.g. "Revenue Risk" → "revenue_risk"). */
function normalizeAlertType(type: string): string {
  return type.replace(/\s+/g, '_').toLowerCase();
}

/** Display confidence from DB: if value <= 1 treat as 0–1 fraction and show as %, else show as 0–100. */
function formatConfidenceScore(confidence_score: number | null | undefined): number | null {
  if (confidence_score == null || Number.isNaN(Number(confidence_score))) return null;
  const n = Number(confidence_score);
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return Math.min(100, Math.max(0, pct));
}

/** Effective confidence as 0–100 for filtering. Hide alerts when < 10. */
function effectiveConfidencePct(confidence_score: number | null | undefined): number {
  if (confidence_score == null || Number.isNaN(Number(confidence_score))) return 0;
  const n = Number(confidence_score);
  return n <= 1 ? n * 100 : n;
}

/** Localized alert message by type: th and en. */
const ALERT_MESSAGE: Record<string, { th: string; en: string }> = {
  revenue_risk: { th: 'รายได้ต่ำกว่าปกติ', en: 'Revenue is significantly below the recent trend' },
  pricing_opportunity: { th: 'มีโอกาสปรับราคาเพิ่ม', en: 'Demand surge detected. Pricing opportunity.' },
  demand_weakening: { th: 'ความต้องการเริ่มลดลง', en: 'Demand is weakening compared to recent days' },
  low_occupancy: { th: 'อัตราการเข้าพักต่ำ', en: 'Occupancy rate is very low' },
  near_full_capacity: { th: 'ห้องพักใกล้เต็ม', en: 'Hotel is nearly full' },
  revenue: { th: 'รายได้ต่ำกว่าปกติ', en: 'Revenue is significantly below the recent trend' },
  pricing: { th: 'มีโอกาสปรับราคาเพิ่ม', en: 'Demand surge detected. Pricing opportunity.' },
  demand: { th: 'ความต้องการเริ่มลดลง', en: 'Demand is weakening compared to recent days' },
  occupancy: { th: 'อัตราการเข้าพักต่ำ', en: 'Occupancy rate is very low' },
  capacity: { th: 'ห้องพักใกล้เต็ม', en: 'Hotel is nearly full' },
  weak_weekday_demand: { th: 'ความต้องการวันธรรมดาอ่อนแอ', en: 'Weak weekday demand' },
  strong_weekend_demand: { th: 'ความต้องการสุดสัปดาห์แข็งแรง', en: 'Strong weekend demand' },
  occupancy_gap: { th: 'ช่องว่างอัตราการเข้าพัก', en: 'Occupancy gap' },
  adr_pricing_opportunity: { th: 'โอกาสปรับราคา ADR', en: 'ADR pricing opportunity' },
  revenue_instability: { th: 'รายได้ไม่เสถียร', en: 'Revenue instability' },
};

/** Localized alert category label (title). */
const ALERT_CATEGORY_LABEL: Record<string, { th: string; en: string }> = {
  revenue: { th: 'รายได้', en: 'Revenue' },
  demand: { th: 'ความต้องการ', en: 'Demand' },
  occupancy: { th: 'อัตราการเข้าพัก', en: 'Occupancy' },
  pricing: { th: 'ราคา', en: 'Pricing' },
  capacity: { th: 'ความจุ', en: 'Capacity' },
};

/** Action recommendation by alert type (normalized key). Display under each alert. */
const ACTION_RECOMMENDATIONS: Record<string, string> = {
  revenue_risk: 'Run promotion or reduce price',
  demand_weakening: 'Increase marketing',
  low_occupancy: 'Launch discount campaign',
  near_full_capacity: 'Increase room price',
  weak_weekday_demand: 'Offer weekday deals',
  strong_weekend_demand: 'Increase weekend price',
  occupancy_gap: 'Adjust pricing distribution',
  adr_pricing_opportunity: 'Raise ADR gradually',
  revenue_instability: 'Stabilize pricing strategy',
  revenue: 'Run promotion or reduce price',
  demand: 'Increase marketing',
  occupancy: 'Launch discount campaign',
  capacity: 'Increase room price',
};

/** Row shape for formatAlertCard (branch_alerts_today or branch_intelligence_engine). */
type AlertRowLike = BranchAlertsTodayRow | BranchIntelligenceEngineRow;

/** Card title = alert_category (localized); message = alert_message; never use "Alert" as title. */
function formatAlertCard(
  row: AlertRowLike,
  locale: 'th' | 'en' = 'en'
): { title: string; description: string } {
  const msg = (row.alert_message ?? (row as any).revenue_alert ?? (row as any).customer_alert ?? (row as any).occupancy_alert ?? '').toString().trim();
  const categoryRaw = (row.alert_category ?? '').toString().trim().toLowerCase();
  const isTh = locale === 'th';

  const categoryLabel = categoryRaw && ALERT_CATEGORY_LABEL[categoryRaw]
    ? (isTh ? ALERT_CATEGORY_LABEL[categoryRaw].th : ALERT_CATEGORY_LABEL[categoryRaw].en)
    : '';

  let title = categoryLabel || (categoryRaw || (row.alert_type ?? '').toString().trim() || msg.split('.')[0]?.trim() || msg.slice(0, 50) || '—');
  if (title === 'Alert' || /^alert$/i.test(title)) title = '—';
  title = title.length > 60 ? title.slice(0, 57) + '...' : title;

  const description = msg.length > 60 ? msg.slice(0, 97) + '...' : msg;
  return { title, description };
}

function getActionRecommendation(alertType: string | null | undefined): string | null {
  if (!alertType) return null;
  const key = normalizeAlertType(alertType);
  return ACTION_RECOMMENDATIONS[key] ?? null;
}

/** Severity badge color: high → red, medium → orange, low → yellow. */
function getSeverityBadgeColor(severity: string | null | undefined): { bg: string; text: string; border: string } {
  const s = (severity ?? '').toString().toLowerCase();
  if (s === 'high') return { bg: '#fef2f2', text: '#b91c1c', border: '#ef4444' };
  if (s === 'medium') return { bg: '#fff7ed', text: '#c2410c', border: '#f97316' };
  return { bg: '#fefce8', text: '#a16207', border: '#eab308' };
}

/** Unified alert row: accommodation = branch_alerts_today + engine; F&B = fnb_alerts_today (alert_name as title, confidence as confidence_score). */
type AlertDisplayRow = Pick<
  BranchAlertsTodayRow,
  'branch_id' | 'metric_date' | 'alert_type' | 'alert_message' | 'recommendation' | 'confidence_score' | 'estimated_revenue_impact'
> & { alert_severity?: string | null; alert_name?: string | null };

export default function BranchAlertsPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();
  const { role } = useUserRole();
  const hideFinancials = role?.canViewOnly === true;
  const [mounted, setMounted] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<Error | null>(null);
  const [alertRows, setAlertRows] = useState<AlertDisplayRow[]>([]);
  const [fnbFinancialImpact, setFnbFinancialImpact] = useState<FnbFinancialImpactRow | null>(null);
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

  const localeKey = locale === 'th' || String(locale || '').toLowerCase().startsWith('th') ? 'th' : 'en';

  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAlerts = useCallback(() => {
    if (!branch?.id) return;
    setAlertsLoading(true);
    setAlertsError(null);
    if (branch.moduleType === 'fnb') {
      Promise.all([
        getAlertsFromFnbAlertsToday(branch.id),
        getFnbFinancialImpact(branch.id),
      ])
        .then(([rows, impact]) => {
          const filtered = (rows as FnbAlertsTodayRow[]).filter((r) => r.alert_name != null && String(r.alert_name).trim() !== '');
          const mapped: AlertDisplayRow[] = filtered.map((r) => ({
            branch_id: r.branch_id,
            metric_date: r.metric_date,
            alert_type: r.alert_name ?? null,
            alert_message: r.alert_message ?? null,
            recommendation: r.recommendation ?? null,
            confidence_score: r.confidence ?? null,
            estimated_revenue_impact: r.estimated_revenue_impact ?? null,
            alert_severity: null,
            alert_name: r.alert_name ?? null,
          }));
          setAlertRows(mapped);
          setFnbFinancialImpact(impact ?? null);
        })
        .catch((e) => {
          setAlertsError(e instanceof Error ? e : new Error(String(e)));
          setAlertRows([]);
          setFnbFinancialImpact(null);
        })
        .finally(() => setAlertsLoading(false));
      return;
    }
    setFnbFinancialImpact(null);
    Promise.all([
      getAlertsFromBranchAlertsToday(branch.id),
      getAlertsFromBranchIntelligenceEngine(branch.id),
    ])
      .then(([today, engine]) => {
        const todayNorm: AlertDisplayRow[] = (today as BranchAlertsTodayRow[]).map((r) => ({
          branch_id: r.branch_id,
          metric_date: r.metric_date,
          alert_type: r.alert_type,
          alert_message: r.alert_message,
          recommendation: r.recommendation,
          confidence_score: r.confidence_score,
          estimated_revenue_impact: r.estimated_revenue_impact,
          alert_severity: r.alert_severity,
        }));
        const engineNorm: AlertDisplayRow[] = (engine as BranchIntelligenceEngineRow[]).map((r) => ({
          branch_id: r.branch_id,
          metric_date: r.metric_date,
          alert_type: r.alert_type,
          alert_message: r.alert_message,
          recommendation: r.recommendation,
          confidence_score: r.confidence_score,
          estimated_revenue_impact: r.estimated_revenue_impact,
          alert_severity: null,
        }));
        const keys = new Set(todayNorm.map((r) => `${r.alert_type ?? ''}|${r.alert_message ?? ''}|${r.metric_date ?? ''}`));
        const merged = [...todayNorm];
        engineNorm.forEach((r) => {
          const key = `${r.alert_type ?? ''}|${r.alert_message ?? ''}|${r.metric_date ?? ''}`;
          if (!keys.has(key)) {
            keys.add(key);
            merged.push(r);
          }
        });
        setAlertRows(merged);
      })
      .catch((e) => {
        setAlertsError(e instanceof Error ? e : new Error(String(e)));
        setAlertRows([]);
      })
      .finally(() => setAlertsLoading(false));
  }, [branch?.id, branch?.moduleType]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  /** displayAlerts: F&B = no confidence filter, no dedupe (single source); accommodation = confidence >= 10, dedupe, sort by severity then metric_date desc. */
  const displayAlerts = useMemo(() => {
    const isFnb = branch?.moduleType === 'fnb';
    const seen = new Set<string>();
    const filtered = alertRows.filter((row) => {
      if (!isFnb && effectiveConfidencePct(row.confidence_score) < 10) return false;
      const key = `${row.alert_name ?? row.alert_type ?? ''}|${row.alert_message ?? ''}|${row.metric_date ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    filtered.sort((a, b) => {
      const orderA = severityOrder(a.alert_severity);
      const orderB = severityOrder(b.alert_severity);
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.metric_date ?? '';
      const dateB = b.metric_date ?? '';
      return dateB.localeCompare(dateA);
    });
    return filtered;
  }, [alertRows, branch?.moduleType]);

  /** alert_type categories: risk (revenue at risk) vs opportunity (opportunity gain). Daily impact × 30 = monthly. Accommodation only. */
  const ALERT_TYPES_REVENUE_AT_RISK = ['Revenue Collapse', 'Revenue Risk', 'Low Occupancy', 'Demand Weakening'];
  const ALERT_TYPES_OPPORTUNITY_GAIN = ['Pricing Opportunity', 'Near Full Capacity', 'Strong Demand'];

  const financialMetrics = useMemo(() => {
    if (branch?.moduleType === 'fnb' && fnbFinancialImpact) {
      return {
        totalRevenueAtRisk: Number(fnbFinancialImpact.total_revenue_at_risk) || 0,
        totalOpportunityGain: Number(fnbFinancialImpact.total_opportunity_gain) || 0,
        criticalCount: Number(fnbFinancialImpact.critical_alerts) || 0,
        warningCount: Number(fnbFinancialImpact.warnings) || 0,
      };
    }
    const norm = (t: string | null | undefined) => (t ?? '').toString().trim();
    const isRiskType = (type: string | null | undefined) =>
      ALERT_TYPES_REVENUE_AT_RISK.some((k) => norm(type).toLowerCase() === k.toLowerCase());
    const isOpportunityType = (type: string | null | undefined) =>
      ALERT_TYPES_OPPORTUNITY_GAIN.some((k) => norm(type).toLowerCase() === k.toLowerCase());

    const dailyRisk = displayAlerts
      .filter((r) => isRiskType(r.alert_type))
      .reduce((sum, r) => sum + Math.abs(Number(r.estimated_revenue_impact) || 0), 0);
    const dailyGain = displayAlerts
      .filter((r) => isOpportunityType(r.alert_type))
      .reduce((sum, r) => sum + Math.max(0, Number(r.estimated_revenue_impact) || 0), 0);

    return {
      totalRevenueAtRisk: dailyRisk * 30,
      totalOpportunityGain: dailyGain * 30,
      criticalCount: displayAlerts.filter((r) => (r as AlertDisplayRow).alert_severity === 'high').length,
      warningCount: displayAlerts.filter((r) => (r as AlertDisplayRow).alert_severity === 'medium').length,
    };
  }, [displayAlerts, branch?.moduleType, fnbFinancialImpact]);

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

  if (alertsLoading) {
    return (
      <PageLayout title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (alertsError) {
    return (
      <PageLayout title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
        <ErrorState
          message={alertsError.message}
          action={{
            label: locale === 'th' ? 'ลองอีกครั้ง' : 'Try Again',
            onClick: fetchAlerts,
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
        {/* Alerts: F&B = fnb_alerts_today only (alert_name, alert_message, recommendation, confidence, estimated_revenue_impact); accommodation = branch_alerts_today + engine */}
        <SectionCard title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
          {displayAlerts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ระบบเสถียร — ไม่พบการแจ้งเตือน' : 'System stable — no alerts detected.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {displayAlerts.map((row, idx) => {
                const title = (row.alert_name ?? row.alert_type ?? '').toString().trim() || '—';
                const message = (row.alert_message ?? '').toString().trim();
                const recommendation = (row.recommendation ?? '').toString().trim();
                const confidencePct = formatConfidenceScore(row.confidence_score);
                const impact = row.estimated_revenue_impact != null && !Number.isNaN(Number(row.estimated_revenue_impact)) ? Number(row.estimated_revenue_impact) : null;
                const severity = (row.alert_severity ?? 'low').toString().toLowerCase();
                const severityColors = getSeverityBadgeColor(row.alert_severity);
                const id = `engine-${row.branch_id}-${row.alert_name ?? row.alert_type ?? ''}-${row.metric_date ?? idx}`;
                const isFnb = branch?.moduleType === 'fnb';
                return (
                  <div
                    key={id}
                    style={{
                      padding: '1rem',
                      backgroundColor: severityColors.bg,
                      border: `1px solid ${severityColors.border}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#0a0a0a',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>⚠ {title || '—'}</span>
                      {!isFnb && (
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: severityColors.border,
                          color: '#fff',
                          textTransform: 'capitalize',
                        }}
                      >
                        {severity || 'low'}
                      </span>
                      )}
                    </div>
                    {message && <div style={{ color: '#374151', marginBottom: '0.5rem' }}>{message}</div>}
                    {recommendation && (
                      <div style={{ fontSize: '13px', color: '#0369a1', marginBottom: '0.25rem' }}>
                        {locale === 'th' ? 'แนะนำ: ' : 'Suggested action: '}
                        <strong>{recommendation}</strong>
                      </div>
                    )}
                    {confidencePct != null && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
                        {localeKey === 'th' ? 'ความมั่นใจ: ' : 'Confidence: '}
                        <strong>{confidencePct}%</strong>
                      </div>
                    )}
                    {impact != null && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
                        {localeKey === 'th' ? 'ผลกระทบโดยประมาณ: ' : 'Impact: '}
                        <strong>{hideFinancials ? '—' : `฿${formatCurrency(impact)}`}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Financial impact: F&B = fnb_financial_impact; accommodation = from displayAlerts */}
        <SectionCard title={locale === 'th' ? 'ผลกระทบทางการเงิน (โดยประมาณ)' : 'Estimated Financial Impact'}>
          {displayAlerts.length === 0 && branch?.moduleType !== 'fnb' ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ไม่พบความเสี่ยงทางการเงิน' : 'No financial impact from current alerts.'}
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

        {/* All Active Alerts: F&B = fnb_alerts_today only; accommodation = branch_alerts_today + engine */}
        <SectionCard title={locale === 'th' ? 'การแจ้งเตือนที่ใช้งานอยู่ทั้งหมด' : 'All Active Alerts'}>
          {displayAlerts.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
                {locale === 'th' ? '✓ ระบบเสถียร — ไม่พบการแจ้งเตือน' : '✓ System stable — no alerts detected.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {displayAlerts.map((row, idx) => {
                const title = (row.alert_name ?? row.alert_type ?? '').toString().trim() || '—';
                const message = (row.alert_message ?? '').toString().trim();
                const recommendation = (row.recommendation ?? '').toString().trim();
                const confidencePct = formatConfidenceScore(row.confidence_score);
                const impact = row.estimated_revenue_impact != null && !Number.isNaN(Number(row.estimated_revenue_impact)) ? Number(row.estimated_revenue_impact) : null;
                const severity = (row.alert_severity ?? 'low').toString().toLowerCase();
                const severityColors = getSeverityBadgeColor(row.alert_severity);
                const id = `active-${row.branch_id}-${row.alert_name ?? row.alert_type ?? ''}-${row.metric_date ?? idx}`;
                const isFnbActive = branch?.moduleType === 'fnb';
                return (
                  <div
                    key={id}
                    style={{
                      padding: '1rem',
                      backgroundColor: severityColors.bg,
                      border: `1px solid ${severityColors.border}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#0a0a0a',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>⚠ {title || '—'}</span>
                      {!isFnbActive && (
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: severityColors.border,
                          color: '#fff',
                          textTransform: 'capitalize',
                        }}
                      >
                        {severity || 'low'}
                      </span>
                      )}
                    </div>
                    {message && <div style={{ color: '#374151', marginBottom: '0.5rem' }}>{message}</div>}
                    {recommendation && (
                      <div style={{ fontSize: '13px', color: '#0369a1', marginBottom: '0.25rem' }}>
                        {locale === 'th' ? 'แนะนำ: ' : 'Suggested action: '}
                        <strong>{recommendation}</strong>
                      </div>
                    )}
                    {confidencePct != null && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
                        {localeKey === 'th' ? 'ความมั่นใจ: ' : 'Confidence: '}
                        <strong>{confidencePct}%</strong>
                      </div>
                    )}
                    {impact != null && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
                        {localeKey === 'th' ? 'ผลกระทบโดยประมาณ: ' : 'Impact: '}
                        <strong>{hideFinancials ? '—' : `฿${formatCurrency(impact)}`}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

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
