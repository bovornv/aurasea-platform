/**
 * Alert Trend Card Component
 * 
 * Compact alert trend visualization for Trends page
 */
'use client';

import { useState, useMemo } from 'react';
import { SectionCard } from '../section-card';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';

interface AlertTrendCardProps {
  businessGroupId: string;
  locale: string;
}

export function AlertTrendCard({ businessGroupId, locale }: AlertTrendCardProps) {
  const [trendWindow, setTrendWindow] = useState<30 | 90>(30);
  const { alerts } = useHospitalityAlerts();

  // For now, show current alert stats
  // TODO: Load historical alert counts from health score trend service
  const currentAlertCount = alerts?.length || 0;
  
  const criticalCount = useMemo(() => {
    return alerts?.filter(a => a.severity === 'critical').length || 0;
  }, [alerts]);

  const warningCount = useMemo(() => {
    return alerts?.filter(a => a.severity === 'warning').length || 0;
  }, [alerts]);

  const avgAlerts = useMemo(() => {
    // Placeholder - would need historical data
    return currentAlertCount;
  }, [currentAlertCount]);

  return (
    <SectionCard title={locale === 'th' ? 'แนวโน้มการแจ้งเตือน' : 'Alert Trend'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          {locale === 'th' ? 'ปัจจุบัน' : 'Current'}
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => setTrendWindow(30)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '12px',
              border: `1px solid ${trendWindow === 30 ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '4px',
              backgroundColor: trendWindow === 30 ? '#eff6ff' : 'transparent',
              color: trendWindow === 30 ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            30d
          </button>
          <button
            onClick={() => setTrendWindow(90)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '12px',
              border: `1px solid ${trendWindow === 90 ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '4px',
              backgroundColor: trendWindow === 90 ? '#eff6ff' : 'transparent',
              color: trendWindow === 90 ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            90d
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#0a0a0a' }}>
            {currentAlertCount}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
            {locale === 'th' ? 'การแจ้งเตือนที่ใช้งานอยู่' : 'Active alerts'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', fontSize: '13px' }}>
          <div>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{criticalCount}</span>
            <span style={{ color: '#6b7280', marginLeft: '0.25rem' }}>
              {locale === 'th' ? 'วิกฤต' : 'Critical'}
            </span>
          </div>
          <div>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{warningCount}</span>
            <span style={{ color: '#6b7280', marginLeft: '0.25rem' }}>
              {locale === 'th' ? 'เตือน' : 'Warning'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '0.5rem' }}>
          {locale === 'th' 
            ? `เฉลี่ย: ${avgAlerts} การแจ้งเตือน/วัน`
            : `Average: ${avgAlerts} alerts/day`}
        </div>
      </div>
    </SectionCard>
  );
}
