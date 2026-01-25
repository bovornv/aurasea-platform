// Decision feed item component - focused, contextual view
'use client';

import Link from 'next/link';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import { getSeverityColor, getSeverityLabel, getCategoryLabel, getTimeHorizonLabel } from '../utils/alert-utils';
import { getTimeAgo } from '../utils/date-utils';
import { useI18n } from '../hooks/use-i18n';

interface DecisionFeedItemProps {
  alert: HospitalityAlert;
}

export function DecisionFeedItem({ alert }: DecisionFeedItemProps) {
  const { locale, t } = useI18n();

  return (
    <Link
      href={`/alert/${alert.id}`}
      style={{
        display: 'block',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: '#ffffff',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#d1d5db';
        e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'start' }}>
        {/* Severity indicator */}
        <div
          style={{
            width: '4px',
            borderRadius: '2px',
            backgroundColor: getSeverityColor(alert.severity),
            flexShrink: 0,
            alignSelf: 'stretch',
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#0a0a0a' }}>
                {alert.title}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
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
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
              {getTimeAgo(new Date(alert.timestamp), locale)}
            </span>
          </div>

          <p style={{ color: '#374151', fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '0.5rem' }}>
            {alert.message}
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              {getTimeHorizonLabel(alert.timeHorizon, locale)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              {Math.round(alert.confidence * 100)}% {t('common.confidence')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
