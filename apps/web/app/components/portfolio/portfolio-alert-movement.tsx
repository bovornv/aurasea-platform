/**
 * Portfolio Alert Movement Component
 * 
 * Compact summary of alert changes over time
 */
'use client';

import { useState, useMemo } from 'react';
import { SectionCard } from '../section-card';

interface PortfolioAlertMovementProps {
  businessGroupId: string;
  locale: string;
}

export function PortfolioAlertMovement({ businessGroupId, locale }: PortfolioAlertMovementProps) {
  const [window, setWindow] = useState<30 | 90>(30);

  const comparisonData = useMemo(() => {
    if (typeof window === 'undefined') return null;

    try {
      const { getBeforeAfterAlertComparison } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
      const beforeAfter30 = getBeforeAfterAlertComparison(businessGroupId, 30);
      const beforeAfter90 = getBeforeAfterAlertComparison(businessGroupId, 90);
      
      return window === 30 ? beforeAfter30 : beforeAfter90;
    } catch (e) {
      console.error('Failed to load alert comparison:', e);
      return null;
    }
  }, [businessGroupId, window]);

  if (!comparisonData || comparisonData.comparisons.length === 0) {
    return null;
  }

  const { summary } = comparisonData;

  return (
    <SectionCard title={locale === 'th' ? 'การเปลี่ยนแปลงการแจ้งเตือน' : 'Alert Changes'}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Window Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setWindow(30)}
            style={{
              padding: '0.375rem 0.75rem',
              border: `1px solid ${window === 30 ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '6px',
              backgroundColor: window === 30 ? '#eff6ff' : 'white',
              color: window === 30 ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: window === 30 ? 600 : 400,
            }}
          >
            30 {locale === 'th' ? 'วัน' : 'Days'}
          </button>
          <button
            onClick={() => setWindow(90)}
            style={{
              padding: '0.375rem 0.75rem',
              border: `1px solid ${window === 90 ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '6px',
              backgroundColor: window === 90 ? '#eff6ff' : 'white',
              color: window === 90 ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: window === 90 ? 600 : 400,
            }}
          >
            90 {locale === 'th' ? 'วัน' : 'Days'}
          </button>
        </div>

        {/* Metrics */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '18px' }}>✅</span>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {locale === 'th' ? 'ความเสี่ยงที่แก้ไขแล้ว' : 'Risks Resolved'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#10b981' }}>
                {summary.resolvedCount}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {locale === 'th' ? 'ความเสี่ยงใหม่' : 'New Risks'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#ef4444' }}>
                {summary.newCount}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '18px' }}>🔄</span>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {locale === 'th' ? 'ปรับปรุงแล้ว' : 'Improved'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#3b82f6' }}>
                {summary.improvedCount}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
