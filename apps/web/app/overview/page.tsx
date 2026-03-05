// Overview page - Situational awareness
'use client';

import { PageLayout } from '../components/page-layout';
import { SectionCard } from '../components/section-card';
import { ErrorState } from '../components';
import { useBusinessState } from '../hooks/use-business-state';
import { useI18n } from '../hooks/use-i18n';

export default function OverviewPage() {
  const { summary, loading, error, refresh } = useBusinessState();
  const { t } = useI18n();

  return (
    <PageLayout title={t('overview.title')} subtitle={t('overview.subtitle')}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('overview.loading')}</p>
        </div>
      ) : error ? (
        <ErrorState
          message={error.message}
          action={{
            label: t('common.retry'),
            onClick: refresh,
          }}
        />
      ) : !summary ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('overview.noData')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            {t('overview.snapshotNote')}
          </p>
          <SectionCard title={t('overview.demandStatus')}>
            <p>{t('overview.demandStatusStable')}</p>
          </SectionCard>

          <SectionCard title={t('overview.laborIntensityStatus')}>
            <p>{t('overview.laborIntensityNormal')}</p>
          </SectionCard>

          <SectionCard title={t('overview.cashStressStatus')}>
            <p>{t('overview.cashStressMonitoring')}</p>
          </SectionCard>

          <SectionCard title={t('overview.forecastReliability')}>
            <p>{t('overview.forecastReliabilityModerate')}</p>
          </SectionCard>
        </div>
      )}
    </PageLayout>
  );
}
