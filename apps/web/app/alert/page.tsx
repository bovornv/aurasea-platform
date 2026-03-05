// Alert page - Redirects to alerts page
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../components/page-layout';
import { LoadingSpinner } from '../components/loading-spinner';
import { useI18n } from '../hooks/use-i18n';

export default function AlertPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    // Redirect to the alerts page
    router.replace('/hospitality/alerts');
  }, [router]);

  return (
    <PageLayout 
      title={t('alerts.title')} 
      subtitle={t('alerts.subtitle', { count: 0, plural: 's' })}
    >
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <LoadingSpinner />
        <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '14px' }}>
          {t('common.redirecting')}
        </p>
      </div>
    </PageLayout>
  );
}
