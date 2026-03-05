// Home page - Decision feed showing alerts
'use client';

import { useMemo } from 'react';
import { PageLayout } from '../components/page-layout';
import { DecisionFeedItem } from '../components/decision-feed-item';
import { EmptyState, ErrorState } from '../components';
import { LoadingSpinner } from '../components/loading-spinner';
import { useHospitalityAlerts } from '../hooks/use-hospitality-alerts';
import { useI18n } from '../hooks/use-i18n';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useMonitoring } from '../hooks/use-monitoring';
import { useUserSession } from '../contexts/user-session-context';
import { OnboardingChecklist } from '../components/onboarding-checklist';

export default function HomePage() {
  const { alerts, loading, error, refreshAlerts } = useHospitalityAlerts();
  const { t } = useI18n();
  const { setup } = useBusinessSetup();
  const { status: monitoringStatus } = useMonitoring();
  const { permissions } = useUserSession();
  const isOwner = permissions.role === 'owner' || permissions.role === 'admin';

  // Filter to show critical, warning, and opportunity alerts in the feed
  const feedAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const alertType = (alert as any).type;
      // Show all critical/warning alerts, plus opportunity alerts (revenue opportunities)
      return alert.severity === 'critical' || 
             alert.severity === 'warning' || 
             alertType === 'opportunity';
    });
  }, [alerts]);

  return (
    <PageLayout title={t('home.title')} subtitle={t('home.subtitle')}>
      {/* Onboarding Checklist - owner only; when setup incomplete or monitoring not active */}
      {isOwner && (!setup.isCompleted || !monitoringStatus.isActive) && (
        <OnboardingChecklist />
      )}
      
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <LoadingSpinner />
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
        <>
          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid #86efac',
              backgroundColor: '#dcfce7',
              marginBottom: '1.5rem',
            }}
          >
            <p style={{ fontSize: '0.9375rem', color: '#166534', margin: 0, fontWeight: 500 }}>
              ✓ {t('home.noAlerts')} — {t('home.systemStable')}
            </p>
          </div>
          <EmptyState
            title={t('home.noAlerts')}
            description={t('home.noAlertsDesc')}
            action={{
              label: t('home.viewAllAlerts'),
              onClick: () => window.location.href = '/hospitality/alerts',
            }}
          />
        </>
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
