// Alert list page - Shows all alerts
'use client';

import { useMemo } from 'react';
import { PageLayout } from '../components/page-layout';
import { AlertCard } from '../components/alert-card';
import { EmptyState, ErrorState } from '../components';
import { useAlerts } from '../hooks/use-alerts';
import { useI18n } from '../hooks/use-i18n';
import { getSeverityColor } from '../utils/alert-utils';

export default function AlertPage() {
  const { alerts, loading, error, refreshAlerts } = useAlerts();
  const { t } = useI18n();

  // Group alerts by severity
  const groupedAlerts = useMemo(() => {
    const groups = {
      critical: alerts.filter(a => a.severity === 'critical'),
      warning: alerts.filter(a => a.severity === 'warning'),
      informational: alerts.filter(a => a.severity === 'informational'),
    };
    return groups;
  }, [alerts]);

  const totalAlerts = alerts.length;

  return (
    <PageLayout 
      title={t('alerts.title')} 
      subtitle={t('alerts.subtitle', { 
        count: totalAlerts, 
        plural: totalAlerts !== 1 ? 's' : '' 
      })}
    >
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('alerts.loading')}</p>
        </div>
      ) : error ? (
        <ErrorState
          message={error.message}
          action={{
            label: t('common.retry'),
            onClick: refreshAlerts,
          }}
        />
      ) : alerts.length === 0 ? (
        <EmptyState
          title={t('alerts.noAlerts')}
          description={t('alerts.noAlertsDesc')}
          action={{
            label: t('common.refresh'),
            onClick: refreshAlerts,
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Critical Alerts Section */}
          {groupedAlerts.critical.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '4px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: getSeverityColor('critical'),
                  }}
                />
                <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('alerts.critical')} ({groupedAlerts.critical.length})
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {groupedAlerts.critical.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </section>
          )}

          {/* Warning Alerts Section */}
          {groupedAlerts.warning.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '4px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: getSeverityColor('warning'),
                  }}
                />
                <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('alerts.warnings')} ({groupedAlerts.warning.length})
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {groupedAlerts.warning.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </section>
          )}

          {/* Informational Alerts Section */}
          {groupedAlerts.informational.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '4px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: getSeverityColor('informational'),
                  }}
                />
                <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('alerts.informational')} ({groupedAlerts.informational.length})
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {groupedAlerts.informational.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageLayout>
  );
}
