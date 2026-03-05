/**
 * Health Score Trend Chart Component
 * 
 * Displays health score trend over time with 30/90 day toggle
 */
'use client';

import { useState, useMemo } from 'react';
import { SectionCard } from '../section-card';
import type { HealthScoreTrend } from '../../../../../core/sme-os/engine/contracts/health-score';

interface HealthScoreTrendChartProps {
  trend: HealthScoreTrend | null;
  currentScore: number | null;
  locale: string;
}

export function HealthScoreTrendChart({ trend, currentScore, locale }: HealthScoreTrendChartProps) {
  const [trendWindow, setTrendWindow] = useState<30 | 90>(30);

  const getHealthScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const displayTrend = useMemo(() => {
    if (!trend) return null;
    // Filter snapshots to match selected window
    const filtered = trend.snapshots.filter(s => {
      const daysDiff = (trend.endDate.getTime() - s.date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= trendWindow;
    });
    return {
      ...trend,
      snapshots: filtered,
    };
  }, [trend, trendWindow]);

  if (!trend || trend.hasInsufficientData) {
    return null;
  }

  const chartColor = currentScore ? getHealthScoreColor(currentScore) : '#3b82f6';

  return (
    <SectionCard title={locale === 'th' ? 'เทรนด์คะแนนสุขภาพ' : 'Health Score Trend'}>
      <div style={{ padding: '1.5rem' }}>
        {/* Toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setTrendWindow(30)}
              style={{
                padding: '0.375rem 0.75rem',
                border: `1px solid ${trendWindow === 30 ? '#3b82f6' : '#e5e7eb'}`,
                borderRadius: '6px',
                backgroundColor: trendWindow === 30 ? '#eff6ff' : 'white',
                color: trendWindow === 30 ? '#3b82f6' : '#6b7280',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: trendWindow === 30 ? 600 : 400,
              }}
            >
              30 {locale === 'th' ? 'วัน' : 'Days'}
            </button>
            <button
              onClick={() => setTrendWindow(90)}
              style={{
                padding: '0.375rem 0.75rem',
                border: `1px solid ${trendWindow === 90 ? '#3b82f6' : '#e5e7eb'}`,
                borderRadius: '6px',
                backgroundColor: trendWindow === 90 ? '#eff6ff' : 'white',
                color: trendWindow === 90 ? '#3b82f6' : '#6b7280',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: trendWindow === 90 ? 600 : 400,
              }}
            >
              90 {locale === 'th' ? 'วัน' : 'Days'}
            </button>
          </div>
        </div>

        {/* Chart */}
        <div style={{
          height: '200px',
          marginBottom: '1rem',
          position: 'relative',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '0.5rem',
        }}>
          {displayTrend && displayTrend.snapshots.length > 1 ? (
            <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
              {(() => {
                const snapshots = displayTrend.snapshots;
                const width = 100;
                const height = 100;
                const minScore = Math.max(0, Math.min(...snapshots.map(s => s.score)) - 5);
                const maxScore = Math.min(100, Math.max(...snapshots.map(s => s.score)) + 5);
                const range = maxScore - minScore || 1;
                
                const points = snapshots.map((snapshot, idx) => {
                  const x = (idx / (snapshots.length - 1)) * width;
                  const y = height - ((snapshot.score - minScore) / range) * height;
                  return `${x},${y}`;
                }).join(' ');
                
                return (
                  <polyline
                    points={points}
                    fill="none"
                    stroke={chartColor}
                    strokeWidth="2"
                    style={{ transform: 'scale(0.95)', transformOrigin: '0 0' }}
                  />
                );
              })()}
            </svg>
          ) : (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              {locale === 'th' ? 'ไม่มีข้อมูลเพียงพอ' : 'Insufficient data'}
            </div>
          )}
        </div>

        {/* Score Change & Interpretation */}
        {displayTrend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '20px' }}>
                {displayTrend.delta > 0 ? '▲' : displayTrend.delta < 0 ? '▼' : '—'}
              </span>
              <span style={{
                fontSize: '18px',
                fontWeight: 600,
                color: displayTrend.delta > 0 ? '#10b981' : displayTrend.delta < 0 ? '#ef4444' : '#6b7280',
              }}>
                {displayTrend.delta > 0 ? '+' : ''}{displayTrend.delta.toFixed(1)}
              </span>
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', flex: 1 }}>
              {Math.abs(displayTrend.delta) < 2
                ? (locale === 'th' 
                  ? 'คะแนนสุขภาพคงที่ในช่วงนี้'
                  : 'Health score remained stable')
                : displayTrend.trend === 'improving'
                ? (locale === 'th'
                  ? `คะแนนสุขภาพดีขึ้น ${Math.abs(displayTrend.delta).toFixed(1)} คะแนน`
                  : `Health score improved ${Math.abs(displayTrend.delta).toFixed(1)} points`)
                : (locale === 'th'
                  ? `คะแนนสุขภาพลดลง ${Math.abs(displayTrend.delta).toFixed(1)} คะแนน`
                  : `Health score declined ${Math.abs(displayTrend.delta).toFixed(1)} points`)}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
