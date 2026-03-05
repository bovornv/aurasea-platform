// Alert detail page
'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useAlert } from '../../hooks/use-alert';
import { getSeverityColor, getSeverityLabel, getCategoryLabel, getTimeHorizonLabel } from '../../utils/alert-utils';
import { formatDate } from '../../utils/date-utils';
import { Button } from '../../components/button';
import { useAlertHistory } from '../../hooks/use-alert-history';
import { useI18n } from '../../hooks/use-i18n';
import Link from 'next/link';

export default function AlertDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { alert, loading, error } = useAlert(id);
  const { addHistoryItem } = useAlertHistory();
  const { t, locale } = useI18n();
  const router = useRouter();

  const handleAcknowledge = () => {
    if (alert) {
      addHistoryItem({
        alertId: alert.id,
        title: alert.title,
        response: 'Acknowledged',
        outcome: 'Resolved',
      });
      router.push('/home');
    }
  };

  const handleIgnore = () => {
    if (alert) {
      addHistoryItem({
        alertId: alert.id,
        title: alert.title,
        response: 'Ignored',
        outcome: 'Ongoing',
      });
      router.push('/home');
    }
  };

  if (loading) {
    return (
      <PageLayout title={t('alertDetail.title')} subtitle={`Alert ID: ${id}`}>
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('common.loading')}</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !alert) {
    return (
      <PageLayout title={t('alertDetail.title')} subtitle={`Alert ID: ${id}`}>
        <div
          style={{
            padding: '2rem',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
          }}
        >
          <p>{error?.message || t('common.alertNotFound')}</p>
          <Link
            href="/home"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #dc2626',
              backgroundColor: '#ffffff',
              color: '#dc2626',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {t('alertDetail.backToFeed')}
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t('alertDetail.title')} subtitle={`Alert ID: ${id}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Alert Header */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a' }}>
                {alert.title}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: getSeverityColor(alert.severity),
                    color: '#ffffff',
                    fontWeight: 500,
                  }}
                >
                  {getSeverityLabel(alert.severity, locale)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {getCategoryLabel(alert.category, locale)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {getTimeHorizonLabel(alert.timeHorizon, locale)}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              {formatDate(new Date(alert.timestamp), locale === 'th' ? 'th-TH' : 'en-US')}
            </span>
          </div>
        </div>

        {/* Section 1: What is happening */}
        <section>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#0a0a0a' }}>
            {t('alertDetail.whatIsHappening')}
          </h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <p style={{ color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
              {alert.message}
            </p>
            {alert.context && (
              <p style={{ color: '#6b7280', lineHeight: '1.6', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                {alert.context}
              </p>
            )}
          </div>
        </section>

        {/* Section 2: Why this matters */}
        <section>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#0a0a0a' }}>
            {t('alertDetail.whyThisMatters')}
          </h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <p style={{ color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
              {alert.severity === 'critical' && t('alertDetail.criticalDesc')}
              {alert.severity === 'warning' && t('alertDetail.warningDesc')}
              {alert.severity === 'informational' && t('alertDetail.infoDesc')}
            </p>
          </div>
        </section>

        {/* Section 3: What caused this */}
        <section>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#0a0a0a' }}>
            {t('alertDetail.whatCausedThis')}
          </h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <p style={{ color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem', marginBottom: '0.75rem' }}>
              {t('alertDetail.causedByIntro')}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.causedBy1')}
              </li>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.causedBy2')}
              </li>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.causedBy3')}
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: What to consider */}
        <section>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#0a0a0a' }}>
            {t('alertDetail.whatToConsider')}
          </h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.consider1')}
              </li>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.consider2')}
              </li>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.consider3')}
              </li>
              <li style={{ marginBottom: '0.75rem', color: '#374151', lineHeight: '1.6', fontSize: '0.9375rem' }}>
                • {t('alertDetail.consider4')}
              </li>
            </ul>
          </div>
        </section>

        {/* Section 5: Confidence level */}
        <section>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#0a0a0a' }}>
            {t('alertDetail.confidenceLevel')}
          </h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
                  {Math.round(alert.confidence * 100)}%
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${alert.confidence * 100}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: '1.6' }}>
              {t('alertDetail.confidenceDesc')}
            </p>
          </div>
        </section>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
          <Button onClick={handleAcknowledge}>{t('common.acknowledge')}</Button>
          <Button onClick={handleIgnore} variant="secondary">{t('common.ignore')}</Button>
          <Link
            href="/home"
            style={{
              marginLeft: 'auto',
              padding: '0.625rem 1.25rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-block',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
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
            {t('alertDetail.backToFeed')}
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
