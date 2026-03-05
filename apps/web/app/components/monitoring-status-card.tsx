// Monitoring Status Card Component
'use client';

import { memo } from 'react';
import Link from 'next/link';
import { formatDateTime } from '../utils/date-utils';
import { useI18n } from '../hooks/use-i18n';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { getBusinessCapabilities } from '../services/business-capabilities-service';
import { ConfidenceBadge } from './confidence-badge';
import type { MonitoringStatus } from '../services/monitoring-service';
import type { SignalTrend } from '../services/operational-signals-service';

interface MonitoringStatusCardProps {
  status: MonitoringStatus;
  trends: SignalTrend[];
  onRefresh: () => Promise<void>;
  showReminder?: boolean;
  onDismissReminder?: () => void;
}

export const MonitoringStatusCard = memo(function MonitoringStatusCard({ status, trends, onRefresh, showReminder, onDismissReminder }: MonitoringStatusCardProps) {
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch } = useCurrentBranch();
  const capabilities = getBusinessCapabilities(setup);
  
  // Determine metrics page URL based on branch ID
  const metricsHref = '/branch/log-today';

  // Get tracking state label and color
  const getTrackingStateLabel = () => {
    if (status.trackingState === 'active') {
      return locale === 'th' ? 'กำลังติดตาม' : 'Tracking: Active';
    } else if (status.trackingState === 'degraded') {
      return locale === 'th' ? 'ติดตาม (ความแม่นยำลดลง)' : 'Tracking: Degraded';
    } else {
      return locale === 'th' ? 'ติดตาม (ข้อมูลเก่า)' : 'Tracking: Stale';
    }
  };

  const getTrackingStateColor = () => {
    if (status.trackingState === 'active') return '#10b981';
    if (status.trackingState === 'degraded') return '#f59e0b';
    return '#ef4444';
  };

  // Calculate data freshness
  const getDataFreshness = () => {
    if (!status.lastOperationalUpdateAt) {
      return { label: locale === 'th' ? 'ไม่มีข้อมูล' : 'No data', color: '#9ca3af', days: null };
    }
    const now = new Date();
    const dataAgeMs = now.getTime() - status.lastOperationalUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
    
    if (dataAgeDays <= 7) {
      return { label: locale === 'th' ? 'ใหม่' : 'Fresh', color: '#10b981', days: dataAgeDays };
    } else if (dataAgeDays <= 14) {
      return { label: locale === 'th' ? 'กำลังเก่า' : 'Aging', color: '#f59e0b', days: dataAgeDays };
    } else {
      return { label: locale === 'th' ? 'เก่า' : 'Stale', color: '#ef4444', days: dataAgeDays };
    }
  };

  const dataFreshness = getDataFreshness();

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.75rem',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem' }}>
        {/* LEFT SIDE: Information Zone */}
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'ระบบกำลังติดตามธุรกิจของคุณ' : 'System is watching your business'}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: status.isActive ? getTrackingStateColor() : '#9ca3af',
              }}
            />
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {getTrackingStateLabel()}
            </span>
          </div>
          {status.confidenceImpact === 'reduced' && (
            <p style={{ fontSize: '12px', color: '#f59e0b', margin: 0, fontStyle: 'italic' }}>
              {locale === 'th' 
                ? 'ความเชื่อมั่นลดลงเนื่องจากข้อมูลเก่า — อัปเดตข้อมูลเพื่อฟื้นฟูความแม่นยำ'
                : 'Confidence reduced due to stale data — Update data to restore accuracy'}
            </p>
          )}
        </div>
        
        {/* RIGHT SIDE: Primary Action Zone */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <ConfidenceBadge status={status} />
          <Link
            href={metricsHref}
            style={{
              fontSize: '14px',
              color: '#ffffff',
              padding: '0.625rem 1rem',
              borderRadius: '6px',
              border: '1px solid #0a0a0a',
              backgroundColor: '#0a0a0a',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              whiteSpace: 'nowrap',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#374151';
              e.currentTarget.style.borderColor = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0a0a0a';
              e.currentTarget.style.borderColor = '#0a0a0a';
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid #3b82f6';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            {locale === 'th' ? 'อัปเดตตัวเลขล่าสุด' : 'Update Latest Metrics'}
          </Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
            {locale === 'th' ? 'สถานะการติดตาม' : 'Monitoring'}
          </p>
          <p style={{ fontSize: '14px', color: '#374151', margin: 0, fontWeight: 500 }}>
            {status.isActive 
              ? (locale === 'th' ? 'ทำงานอยู่' : 'Active')
              : (locale === 'th' ? 'หยุดชั่วคราว' : 'Paused')}
          </p>
        </div>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
            {locale === 'th' ? 'ความสดของข้อมูล' : 'Data freshness'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: dataFreshness.color,
            }} />
            <p style={{ fontSize: '14px', color: '#374151', margin: 0, fontWeight: 500 }}>
              {dataFreshness.label}
              {dataFreshness.days !== null && (
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400, marginLeft: '0.25rem' }}>
                  ({dataFreshness.days} {locale === 'th' ? 'วัน' : 'days'})
                </span>
              )}
            </p>
          </div>
        </div>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
            {locale === 'th' ? 'อัปเดตล่าสุด' : 'Last update'}
          </p>
          <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>
            {status.lastOperationalUpdateAt
              ? formatDateTime(status.lastOperationalUpdateAt, locale === 'th' ? 'th-TH' : 'en-US')
              : t('hospitality.dashboard.notEvaluatedYet')}
          </p>
        </div>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
            {t('hospitality.dashboard.lastEvaluated')}
          </p>
          <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>
            {status.lastEvaluated
              ? formatDateTime(status.lastEvaluated, locale === 'th' ? 'th-TH' : 'en-US')
              : t('hospitality.dashboard.notEvaluatedYet')}
          </p>
        </div>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
            {t('hospitality.dashboard.dataCoverage')}
          </p>
          <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>
            {status.dataCoverageDays > 0
              ? `${status.dataCoverageDays} ${t('hospitality.dashboard.days')}`
              : t('hospitality.dashboard.noDataYet')}
          </p>
        </div>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
            {t('hospitality.dashboard.evaluations')}
          </p>
          <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>
            {status.evaluationCount}
          </p>
        </div>
      </div>
      
      {/* Signal Trends */}
      {trends.length > 0 && (
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.75rem' }}>
            {t('hospitality.dashboard.signalTrends')}
          </p>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {trends.map((trend) => {
              const trendSymbol = trend.direction === 'improving' ? '↑' : trend.direction === 'deteriorating' ? '↓' : '→';
              const trendColor = trend.direction === 'improving' ? '#10b981' : trend.direction === 'deteriorating' ? '#ef4444' : '#6b7280';
              return (
                <div key={trend.signal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '16px', color: trendColor, fontWeight: 600 }}>
                    {trendSymbol}
                  </span>
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    {t(`hospitality.dashboard.trend${trend.signal.charAt(0).toUpperCase() + trend.signal.slice(1)}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Update Reminder */}
      {showReminder && onDismissReminder && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          borderRadius: '8px',
          backgroundColor: '#fef3c7',
          border: '1px solid #fcd34d',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#92400e', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'คุณยังไม่ได้อัปเดตข้อมูลการดำเนินงานในสัปดาห์นี้' : 'You have not updated operational data this week'}
              </p>
              <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>
                {locale === 'th' 
                  ? 'อัปเดตข้อมูลเพื่อให้การติดตามมีความแม่นยำ'
                  : 'Update data to maintain monitoring accuracy'}
              </p>
            </div>
            <button
              onClick={onDismissReminder}
              aria-label={locale === 'th' ? 'ปิดการแจ้งเตือน' : 'Dismiss reminder'}
              style={{
                fontSize: '12px',
                color: '#78350f',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid #fcd34d',
                backgroundColor: '#ffffff',
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = '2px solid #3b82f6';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = 'none';
              }}
            >
              {locale === 'th' ? 'ปิด' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
