// Alert card component for decision feed
'use client';

import Link from 'next/link';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import { getSeverityColor, getSeverityLabel, getCategoryLabel, getTimeHorizonLabel } from '../utils/alert-utils';
import { formatDate } from '../utils/date-utils';
import { useI18n } from '../hooks/use-i18n';
import { getRevenueImpactCopy } from '../utils/revenue-impact-copy';

interface AlertCardProps {
  alert: HospitalityAlert;
}

export function AlertCard({ alert }: AlertCardProps) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a' }}>
            {alert.title}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
          {formatDate(new Date(alert.timestamp), locale === 'th' ? 'th-TH' : 'en-US')}
        </span>
      </div>

      <p style={{ color: '#374151', marginBottom: '0.75rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
        {alert.message}
      </p>
      
      {/* Revenue Impact */}
      <div
        style={{
          padding: '0.625rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: '6px',
          marginBottom: '0.75rem',
        }}
      >
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem', marginTop: 0 }}>
          {getRevenueImpactCopy(alert.severity, locale).summary}
        </p>
        <p style={{ fontSize: '11px', color: '#78350f', margin: 0, lineHeight: '1.5' }}>
          {getRevenueImpactCopy(alert.severity, locale).explanation}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {t('common.confidence')}: {Math.round(alert.confidence * 100)}%
        </span>
      </div>
    </Link>
  );
}
