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
import { getSeverityColor } from '../../utils/alert-utils';
import { runAppAlertValidation, runFullAlertValidation } from '../../lib/run-alert-validation-app';
import {
  getAlertsFromBranchAlertsDisplay,
  getFnbFinancialImpact,
  severityOrder,
  type BranchAlertsDisplayRow,
  type FnbFinancialImpactRow,
} from '../../services/db/kpi-analytics-service';

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

/** Severity badge color: high → red, medium → orange, low → yellow. */
function getSeverityBadgeColor(severity: string | null | undefined): { bg: string; text: string; border: string } {
  const s = (severity ?? '').toString().toLowerCase();
  if (s === 'high') return { bg: '#fef2f2', text: '#b91c1c', border: '#ef4444' };
  if (s === 'medium') return { bg: '#fff7ed', text: '#c2410c', border: '#f97316' };
  return { bg: '#fefce8', text: '#a16207', border: '#eab308' };
}

/** Display row: from branch_alerts_display; title and action from message_th/en and action_th/en. */
type AlertDisplayRow = BranchAlertsDisplayRow;

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
    Promise.all([
      getAlertsFromBranchAlertsDisplay(branch.id),
      branch.moduleType === 'fnb' ? getFnbFinancialImpact(branch.id) : Promise.resolve(null),
    ])
      .then(([rows, impact]) => {
        setAlertRows(rows);
        setFnbFinancialImpact(impact ?? null);
      })
      .catch((e) => {
        setAlertsError(e instanceof Error ? e : new Error(String(e)));
        setAlertRows([]);
        setFnbFinancialImpact(null);
      })
      .finally(() => setAlertsLoading(false));
  }, [branch?.id, branch?.moduleType]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  /** displayAlerts: one per alert_code (dedupe), confidence >= 10 for accommodation, sort by severity then metric_date desc. */
  const displayAlerts = useMemo(() => {
    const isFnb = branch?.moduleType === 'fnb';
    const filtered = alertRows.filter((row) => {
      if (!isFnb && effectiveConfidencePct(row.confidence_score) < 10) return false;
      return true;
    });
    const uniqueByCode = Object.values(
      filtered.reduce<Record<string, BranchAlertsDisplayRow>>((acc, alert) => {
        const code = alert.alert_code ?? alert.metric_date ?? String(Math.random());
        if (!acc[code]) acc[code] = alert;
        return acc;
      }, {})
    );
    uniqueByCode.sort((a, b) => {
      const orderA = severityOrder(a.alert_severity);
      const orderB = severityOrder(b.alert_severity);
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.metric_date ?? '';
      const dateB = b.metric_date ?? '';
      return dateB.localeCompare(dateA);
    });
    return uniqueByCode;
  }, [alertRows, branch?.moduleType]);

  const financialMetrics = useMemo(() => {
    if (branch?.moduleType === 'fnb' && fnbFinancialImpact) {
      return {
        totalRevenueAtRisk: Number(fnbFinancialImpact.total_revenue_at_risk) || 0,
        totalOpportunityGain: Number(fnbFinancialImpact.total_opportunity_gain) || 0,
        criticalCount: Number(fnbFinancialImpact.critical_alerts) || 0,
        warningCount: Number(fnbFinancialImpact.warnings) || 0,
      };
    }
    const dailyRisk = displayAlerts.reduce((sum, r) => {
      const v = Number(r.estimated_revenue_impact) || 0;
      return sum + (v < 0 ? Math.abs(v) : 0);
    }, 0);
    const dailyGain = displayAlerts.reduce((sum, r) => {
      const v = Number(r.estimated_revenue_impact) || 0;
      return sum + (v > 0 ? v : 0);
    }, 0);
    return {
      totalRevenueAtRisk: dailyRisk * 30,
      totalOpportunityGain: dailyGain * 30,
      criticalCount: displayAlerts.filter((r) => (r.alert_severity ?? '').toString().toLowerCase() === 'high').length,
      warningCount: displayAlerts.filter((r) => (r.alert_severity ?? '').toString().toLowerCase() === 'medium').length,
    };
  }, [displayAlerts, branch?.moduleType, fnbFinancialImpact]);

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
        {/* Alerts: branch_alerts_display only; title = message_th/message_en, action = action_th/action_en from Supabase */}
        <SectionCard title={locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}>
          {displayAlerts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {locale === 'th' ? 'ระบบเสถียร — ไม่พบการแจ้งเตือน' : 'System stable — no alerts detected.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {displayAlerts.map((row, idx) => {
                const isTh = localeKey === 'th';
                const alertTitle = (isTh ? (row.message_th ?? row.message_en) : (row.message_en ?? row.message_th)) ?? '';
                const alertAction = (isTh ? (row.action_th ?? row.action_en) : (row.action_en ?? row.action_th)) ?? '';
                const confidencePct = formatConfidenceScore(row.confidence_score);
                const impact = row.estimated_revenue_impact != null && !Number.isNaN(Number(row.estimated_revenue_impact)) ? Number(row.estimated_revenue_impact) : null;
                const severity = (row.alert_severity ?? 'low').toString().toLowerCase();
                const severityColors = getSeverityBadgeColor(row.alert_severity);
                const id = `alert-${row.branch_id}-${row.alert_code ?? idx}-${row.metric_date ?? ''}`;
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
                      <span style={{ fontWeight: 600 }}>⚠ {String(alertTitle).trim() || '—'}</span>
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
                        {severity}
                      </span>
                    </div>
                    {alertAction && (
                      <div style={{ fontSize: '13px', color: '#0369a1', marginBottom: '0.25rem' }}>
                        {localeKey === 'th' ? 'แนะนำ: ' : 'Suggested action: '}
                        <strong>{alertAction}</strong>
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
                        {localeKey === 'th' ? 'ผลกระทบโดยประมาณ: ' : 'Estimated impact: '}
                        <strong>{hideFinancials ? '—' : `฿${Number(impact).toLocaleString()}`}</strong>
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
                  {hideFinancials ? '—' : `฿${(financialMetrics.totalRevenueAtRisk ?? 0).toLocaleString()}/mo`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'โอกาสเพิ่มรายได้' : 'Total Opportunity Gain'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>
                  {hideFinancials ? '—' : `฿${(financialMetrics.totalOpportunityGain ?? 0).toLocaleString()}/mo`}
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

        {/* All Active Alerts: same as above, from branch_alerts_display; deduped by alert_code */}
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
                const isTh = localeKey === 'th';
                const alertTitle = (isTh ? (row.message_th ?? row.message_en) : (row.message_en ?? row.message_th)) ?? '';
                const alertAction = (isTh ? (row.action_th ?? row.action_en) : (row.action_en ?? row.action_th)) ?? '';
                const confidencePct = formatConfidenceScore(row.confidence_score);
                const impact = row.estimated_revenue_impact != null && !Number.isNaN(Number(row.estimated_revenue_impact)) ? Number(row.estimated_revenue_impact) : null;
                const severity = (row.alert_severity ?? 'low').toString().toLowerCase();
                const severityColors = getSeverityBadgeColor(row.alert_severity);
                const id = `active-${row.branch_id}-${row.alert_code ?? idx}-${row.metric_date ?? ''}`;
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
                      <span style={{ fontWeight: 600 }}>⚠ {String(alertTitle).trim() || '—'}</span>
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
                        {severity}
                      </span>
                    </div>
                    {alertAction && (
                      <div style={{ fontSize: '13px', color: '#0369a1', marginBottom: '0.25rem' }}>
                        {localeKey === 'th' ? 'แนะนำ: ' : 'Suggested action: '}
                        <strong>{alertAction}</strong>
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
                        {localeKey === 'th' ? 'ผลกระทบโดยประมาณ: ' : 'Estimated impact: '}
                        <strong>{hideFinancials ? '—' : `฿${Number(impact).toLocaleString()}`}</strong>
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
