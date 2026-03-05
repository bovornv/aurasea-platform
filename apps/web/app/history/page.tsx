// History page - Decision memory
'use client';

import { PageLayout } from '../components/page-layout';
import { useAlertHistory } from '../hooks/use-alert-history';
import { EmptyState } from '../components/empty-state';
import { useI18n } from '../hooks/use-i18n';
import { formatDate } from '../utils/date-utils';
import Link from 'next/link';

export default function HistoryPage() {
  const { history, loading, clearHistory } = useAlertHistory();
  const { t, locale } = useI18n();

  if (loading) {
    return (
      <PageLayout title={t('history.title')} subtitle={t('history.subtitle')}>
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('history.loading')}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t('history.title')} subtitle={t('history.subtitle')}>
      {history.length === 0 ? (
        <EmptyState
          title={t('history.noHistory')}
          description={t('history.noHistoryDesc')}
        />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button
              onClick={clearHistory}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#6b7280',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
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
              {t('history.clearHistory')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {history.map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a' }}>
                      {item.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {formatDate(item.date, locale === 'th' ? 'th-TH' : 'en-US')}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: item.response === 'Acknowledged' ? '#dbeafe' : '#f3f4f6',
                          color: item.response === 'Acknowledged' ? '#1e40af' : '#6b7280',
                          fontWeight: 500,
                        }}
                      >
                        {item.response === 'Acknowledged' ? t('history.acknowledged') : t('history.ignored')}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: item.outcome === 'Resolved' ? '#dcfce7' : item.outcome === 'Escalated' ? '#fee2e2' : '#fef3c7',
                          color: item.outcome === 'Resolved' ? '#166534' : item.outcome === 'Escalated' ? '#991b1b' : '#92400e',
                          fontWeight: 500,
                        }}
                      >
                        {item.outcome === 'Resolved' ? t('history.resolved') : item.outcome === 'Escalated' ? t('history.escalated') : t('history.ongoing')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </PageLayout>
  );
}
