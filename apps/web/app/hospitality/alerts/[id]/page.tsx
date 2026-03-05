// Alert Detail Page - Phase 4 MVP
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLayout } from '../../../components/page-layout';
import { useHospitalityAlertDetail } from '../../../hooks/use-hospitality-alert-detail';
import { useHospitalityAlerts } from '../../../hooks/use-hospitality-alerts';
import { LoadingSpinner } from '../../../components/loading-spinner';
import { EmptyState } from '../../../components/empty-state';
import { getSeverityColor, getSeverityLabel, getTimeHorizonLabel } from '../../../utils/alert-utils';
import { formatDateTime, formatDate } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatting';
import { useI18n } from '../../../hooks/use-i18n';
import { ConfidenceTimeline } from '../../../components/confidence-timeline';

export default function AlertDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { detail, loading, notFound } = useHospitalityAlertDetail(id);
  const { alerts } = useHospitalityAlerts();
  const { t, locale } = useI18n();

  if (loading) {
    return (
      <PageLayout 
        title={t('hospitality.alertDetail.title')} 
        subtitle={`Alert ID: ${id}`}
      >
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (notFound || !detail || !detail.alert) {
    return (
      <PageLayout 
        title={t('hospitality.alertDetail.title')} 
        subtitle={t('hospitality.alertDetail.subtitle')}
      >
        <EmptyState
          title={t('hospitality.alertDetail.notFoundTitle')}
          description={t('hospitality.alertDetail.notFoundDescription')}
          action={{
            label: t('hospitality.alertDetail.backToAlerts'),
            onClick: () => window.location.href = '/hospitality/alerts',
          }}
        />
      </PageLayout>
    );
  }

  const { alert, explanation, evaluation } = detail;
  const positions = (alert as any).positions as Array<{ date: Date; balance: number; daysOfCoverage: number }> | undefined;
  
  // Get alert title from translated alert (if available) or use message
  const alertTitle = alert.message.split(' within')[0] || 
                     alert.message.split(' show')[0] ||
                     alert.message.split(' rising')[0] ||
                     alert.message.split(' compressed')[0] ||
                     alert.message.split(' below')[0] ||
                     alert.message.split(' differs')[0] ||
                     alert.message.split(' reduced')[0] ||
                     'Alert';

  // Find related alerts (same severity or domain, excluding current alert)
  const relatedAlerts = alerts
    .filter(a => a.id !== alert.id && (a.severity === alert.severity || a.domain === alert.domain))
    .slice(0, 3);

  return (
    <PageLayout 
      title={alertTitle} 
      subtitle={t('hospitality.alertDetail.subtitle')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" style={{ fontSize: '14px', color: '#6b7280' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href="/hospitality"
              style={{
                color: '#6b7280',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              {locale === 'th' ? 'ภาพรวม' : 'Overview'}
            </Link>
            <span style={{ color: '#d1d5db' }}>/</span>
            <Link
              href="/hospitality/alerts"
              style={{
                color: '#6b7280',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              {locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'}
            </Link>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ color: '#374151', fontWeight: 500 }}>
              {alertTitle.length > 40 ? alertTitle.substring(0, 40) + '...' : alertTitle}
            </span>
          </div>
        </nav>
        {/* Alert Header */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '12px',
                    padding: '0.375rem 0.625rem',
                    borderRadius: '6px',
                    backgroundColor: getSeverityColor(alert.severity),
                    color: '#ffffff',
                    fontWeight: 500,
                    letterSpacing: '0.01em',
                  }}
                >
                  {getSeverityLabel(alert.severity, locale)}
                </span>
                {(alert as any).type === 'opportunity' && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '0.375rem 0.625rem',
                      borderRadius: '6px',
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      fontWeight: 600,
                      letterSpacing: '0.01em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {locale === 'th' ? 'โอกาส' : 'Opportunity'}
                  </span>
                )}
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                  {getTimeHorizonLabel(alert.timeHorizon, locale)}
                </span>
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em', lineHeight: '1.3' }}>
                {alert.message}
              </h2>
            </div>
          </div>

          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.5rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f3f4f6' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500, letterSpacing: '0.01em' }}>{t('hospitality.alertDetail.confidence')}</p>
              <p style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em' }}>
                {Math.round((alert as any).confidenceAdjusted !== undefined 
                  ? (alert as any).confidenceAdjusted 
                  : alert.confidence) * 100}%
              </p>
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '0.375rem', fontStyle: 'italic' }}>
                {t('hospitality.alertDetail.descriptiveScore')}
                {(alert as any).confidenceDecayReason && (
                  <span style={{ display: 'block', marginTop: '0.25rem', color: '#f59e0b' }}>
                    {locale === 'th' 
                      ? `(ลดลงเนื่องจาก: ${(alert as any).confidenceDecayReason})`
                      : `(Reduced: ${(alert as any).confidenceDecayReason})`}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500, letterSpacing: '0.01em' }}>{t('hospitality.alertDetail.evaluated')}</p>
              <p style={{ fontSize: '15px', color: '#374151', margin: 0 }}>
                {formatDateTime(alert.timestamp, locale === 'th' ? 'th-TH' : 'en-US')}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500, letterSpacing: '0.01em' }}>{t('hospitality.alertDetail.relevanceWindow')}</p>
              <p style={{ fontSize: '15px', color: '#374151', margin: 0 }}>
                {formatDate(alert.relevanceWindow.start, locale === 'th' ? 'th-TH' : 'en-US')} - {formatDate(alert.relevanceWindow.end, locale === 'th' ? 'th-TH' : 'en-US')}
              </p>
            </div>
            {positions && positions.length > 0 && (
              <div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500, letterSpacing: '0.01em' }}>{t('hospitality.alertDetail.lowestCoverage')}</p>
                <p style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em' }}>
                  {Math.round(Math.min(...positions.map(p => p.daysOfCoverage)))} {t('hospitality.alertDetail.days')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Explanation Section */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
            {t('hospitality.alertDetail.explanation')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                {t('hospitality.alertDetail.primaryFactor')}
              </p>
              <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: '1.6', margin: 0 }}>
                {explanation.primaryFactor}
              </p>
            </div>

            {explanation.contributingFactors.length > 0 && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                  {t('hospitality.alertDetail.contributingFactors')}
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '15px', color: '#6b7280', lineHeight: '1.6' }}>
                  {explanation.contributingFactors.map((factor, idx) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>{factor}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                {t('hospitality.alertDetail.dataQuality')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '15px', color: '#6b7280' }}>
                <p style={{ margin: 0 }}>{explanation.dataQuality.completeness}</p>
                <p style={{ margin: 0 }}>{explanation.dataQuality.historicalCoverage}</p>
                <p style={{ margin: 0 }}>{explanation.dataQuality.variance}</p>
              </div>
            </div>

            {/* Impact Analysis (for demand drop, weekend-weekday alerts) */}
            {explanation.impactAnalysis && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                  {locale === 'th' ? 'การวิเคราะห์ผลกระทบ' : 'Impact Analysis'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '15px', color: '#6b7280' }}>
                  {explanation.impactAnalysis.revenueImpact && (
                    <p style={{ margin: 0 }}>{explanation.impactAnalysis.revenueImpact}</p>
                  )}
                  {explanation.impactAnalysis.occupancyImpact && (
                    <p style={{ margin: 0 }}>{explanation.impactAnalysis.occupancyImpact}</p>
                  )}
                  {explanation.impactAnalysis.volumeImpact && (
                    <p style={{ margin: 0 }}>{explanation.impactAnalysis.volumeImpact}</p>
                  )}
                </div>
              </div>
            )}

            {/* Utilization Analysis (for capacity/utilization alerts) */}
            {explanation.utilizationAnalysis && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                  {locale === 'th' ? 'การวิเคราะห์การใช้งาน' : 'Utilization Analysis'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '15px', color: '#6b7280' }}>
                  {explanation.utilizationAnalysis.averageOccupancy && (
                    <p style={{ margin: 0 }}>{explanation.utilizationAnalysis.averageOccupancy}</p>
                  )}
                  {explanation.utilizationAnalysis.peakDayPattern && (
                    <p style={{ margin: 0 }}>{explanation.utilizationAnalysis.peakDayPattern}</p>
                  )}
                  {explanation.utilizationAnalysis.consistencyPattern && (
                    <p style={{ margin: 0 }}>{explanation.utilizationAnalysis.consistencyPattern}</p>
                  )}
                </div>
              </div>
            )}

            {/* Profitability Analysis (for revenue concentration, seasonality alerts) */}
            {explanation.profitabilityAnalysis && (
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem', letterSpacing: '0.01em' }}>
                  {locale === 'th' ? 'การวิเคราะห์ความสามารถในการทำกำไร' : 'Profitability Analysis'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '15px', color: '#6b7280' }}>
                  {explanation.profitabilityAnalysis.breakEvenAssessment && (
                    <p style={{ margin: 0 }}>{explanation.profitabilityAnalysis.breakEvenAssessment}</p>
                  )}
                  {explanation.profitabilityAnalysis.revenueGapAnalysis && (
                    <p style={{ margin: 0 }}>{explanation.profitabilityAnalysis.revenueGapAnalysis}</p>
                  )}
                  {explanation.profitabilityAnalysis.riskLevel && (
                    <p style={{ margin: 0 }}>{explanation.profitabilityAnalysis.riskLevel}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Key Facts */}
        {positions && positions.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '2rem',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
              {t('hospitality.alertDetail.keyFacts')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Show critical points: start, lowest, end */}
              {[
                positions[0],
                positions.find(p => p.daysOfCoverage === Math.min(...positions.map(pp => pp.daysOfCoverage))),
                positions[positions.length - 1]
              ].filter(Boolean).map((pos, idx) => {
                if (!pos) return null;
                const isLowest = pos.daysOfCoverage === Math.min(...positions.map(p => p.daysOfCoverage));
                const labelKey = idx === 0 ? 'start' : idx === 1 ? 'lowestPoint' : 'end';
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '1rem 1.25rem', 
                      backgroundColor: isLowest ? '#fef2f2' : '#f9fafb', 
                      borderRadius: '8px',
                      border: isLowest ? '1px solid #fee2e2' : '1px solid transparent'
                    }}
                  >
                    <span style={{ fontSize: '15px', color: '#374151', fontWeight: isLowest ? 500 : 400 }}>
                      {t(`hospitality.alertDetail.${labelKey}`)}: {formatDate(pos.date, locale === 'th' ? 'th-TH' : 'en-US')}
                    </span>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '15px', color: '#6b7280' }}>
                      <span>{t('hospitality.alertDetail.balance')}: {formatCurrency(pos.balance, locale === 'th' ? 'th-TH' : 'en-US')}</span>
                      <span style={{ fontWeight: isLowest ? 600 : 400, color: isLowest ? '#dc2626' : '#6b7280' }}>
                        {t('hospitality.alertDetail.coverage')}: {Math.round(pos.daysOfCoverage)} {t('hospitality.alertDetail.days')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contributing Factors from Alert */}
        {alert.contributingFactors && alert.contributingFactors.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '2rem',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
              {t('hospitality.alertDetail.contributingFactors')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {alert.contributingFactors.map((factor, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                  <span style={{ fontSize: '15px', color: '#374151' }}>{factor.factor}</span>
                  <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
                    Weight: {Math.round(factor.weight * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conditions */}
        {alert.conditions && alert.conditions.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '2rem',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
              {t('hospitality.alertDetail.conditions')}
            </h3>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '15px', color: '#6b7280', lineHeight: '1.6' }}>
              {alert.conditions.map((condition, idx) => (
                <li key={idx} style={{ marginBottom: '0.75rem' }}>{condition}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Disclaimer */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '1.5rem 2rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0, fontStyle: 'italic', lineHeight: '1.6' }}>
            <strong style={{ fontWeight: 500 }}>{t('common.note')}:</strong> {t('hospitality.alertDetail.disclaimer')}
          </p>
        </div>

        {/* Confidence Timeline */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <ConfidenceTimeline />
        </div>

        {/* Related Alerts */}
        {relatedAlerts.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '2rem',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
              {locale === 'th' ? 'การแจ้งเตือนที่เกี่ยวข้อง' : 'Related Alerts'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {relatedAlerts.map((relatedAlert) => (
                <Link
                  key={relatedAlert.id}
                  href={`/hospitality/alerts/${relatedAlert.id}`}
                  style={{
                    display: 'block',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem 1.25rem',
                    backgroundColor: '#f9fafb',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '6px',
                            backgroundColor: getSeverityColor(relatedAlert.severity),
                            color: '#ffffff',
                            fontWeight: 500,
                          }}
                        >
                          {getSeverityLabel(relatedAlert.severity, locale)}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          {getTimeHorizonLabel(relatedAlert.timeHorizon, locale)}
                        </span>
                      </div>
                      <p style={{ fontSize: '15px', color: '#374151', margin: 0, fontWeight: 500 }}>
                        {relatedAlert.title}
                      </p>
                      <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '0.5rem', margin: 0, lineHeight: '1.5' }}>
                        {relatedAlert.message.length > 100 
                          ? relatedAlert.message.substring(0, 100) + '...' 
                          : relatedAlert.message}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <Link
            href="/hospitality/alerts"
            style={{
              display: 'inline-block',
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
              e.currentTarget.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            ← {t('hospitality.alertDetail.backToAlerts')}
          </Link>
          <Link
            href="/hospitality/data-entry"
            style={{
              display: 'inline-block',
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: '#0a0a0a',
              color: '#ffffff',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0a0a0a';
            }}
          >
            {locale === 'th' ? 'อัปเดตข้อมูล' : 'Update Data'}
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
