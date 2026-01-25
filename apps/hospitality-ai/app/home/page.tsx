// Home page - Decision feed showing alerts
'use client';

import { useMemo } from 'react';
import { PageLayout } from '../components/page-layout';
import { DecisionFeedItem } from '../components/decision-feed-item';
import { EmptyState, ErrorState } from '../components';
import { useAlerts } from '../hooks/use-alerts';
import { useI18n } from '../hooks/use-i18n';

export default function HomePage() {
  const { alerts, loading, error, refreshAlerts } = useAlerts();
  const { t } = useI18n();

  // Filter to show only critical and warning alerts in the feed
  const feedAlerts = useMemo(() => {
    return alerts.filter(alert => 
      alert.severity === 'critical' || alert.severity === 'warning'
    );
  }, [alerts]);

  return (
    <PageLayout title={t('home.title')} subtitle={t('home.subtitle')}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('home.loading')}</p>
        </div>
      ) : error ? (
        <ErrorState
          message={error.message}
          action={{
            label: t('common.retry'),
            onClick: refreshAlerts,
          }}
        />
      ) : feedAlerts.length === 0 ? (
        <EmptyState
          title={t('home.noAlerts')}
          description={t('home.noAlertsDesc')}
          action={{
            label: t('home.viewAllAlerts'),
            onClick: () => window.location.href = '/alert',
          }}
        />
      ) : (
        <>
          <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: '0.875rem', color: '#374151', margin: 0 }}>
              {t('home.showingAlerts', { 
                count: feedAlerts.length, 
                plural: feedAlerts.length !== 1 ? 's' : '' 
              })}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {feedAlerts.map((alert) => (
              <DecisionFeedItem key={alert.id} alert={alert} />
            ))}
          </div>
        </>
      )}
    </PageLayout>
  );
}
