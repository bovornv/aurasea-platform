/**
 * Revenue Last 30 Days Chart Component
 * 
 * Displays revenue trend over the last 30 days
 */
'use client';

import { useMemo, useEffect, useState } from 'react';
import { SectionCard } from '../section-card';
import { getDailyMetrics } from '../../services/db/daily-metrics-service';

interface RevenueLast30DaysChartProps {
  branchId: string;
  locale: string;
}

export function RevenueLast30DaysChart({ branchId, locale }: RevenueLast30DaysChartProps) {
  const [dailyMetrics, setDailyMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Unified daily_metrics: Fetch directly from table
    // SELECT metric_date, revenue, cost, cash_balance ORDER BY metric_date ASC
    getDailyMetrics(branchId, 30).then(metrics => {
      setDailyMetrics(metrics || []);
      setLoading(false);
    }).catch(err => {
      console.error('[RevenueChart] Failed to load daily metrics:', err);
      setDailyMetrics([]);
      setLoading(false);
    });
  }, [branchId]);

  const revenueData = useMemo(() => {
    // PART 4: Data Guard - Return null if no data (show empty state)
    if (!dailyMetrics || dailyMetrics.length === 0) {
      return null;
    }

    // PART 4: Use unified fields: revenue from daily_metrics
    // Filter out null/NaN/undefined values and ensure valid numbers
    const validMetrics = dailyMetrics
      .filter(m => {
        const revenue = m.revenue;
        return revenue !== null && revenue !== undefined && !isNaN(revenue) && isFinite(revenue);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(m => ({
        date: new Date(m.date),
        revenue: Number(m.revenue) || 0, // Ensure valid number
      }));
    
    // Need at least 2 points for a trend
    if (validMetrics.length < 2) {
      return null;
    }
    
    return validMetrics;
  }, [dailyMetrics]);

  // Data Guard: Show empty state if no data
  if (loading) {
    return (
      <SectionCard title={locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Revenue Last 30 Days'}>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
          {locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
        </div>
      </SectionCard>
    );
  }

  if (!revenueData || revenueData.length < 2) {
    return (
      <SectionCard title={locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Revenue Last 30 Days'}>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
          {locale === 'th' ? 'ไม่มีข้อมูล' : 'No data available'}
        </div>
      </SectionCard>
    );
  }

  const latestRevenue = revenueData[revenueData.length - 1].revenue;
  const previousRevenue = revenueData[0].revenue;
  const revenueChange = previousRevenue > 0
    ? ((latestRevenue - previousRevenue) / previousRevenue) * 100
    : 0;

  return (
    <SectionCard title={locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Revenue Last 30 Days'}>
      <div style={{ padding: '1.5rem' }}>
        {/* Revenue Change */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {locale === 'th' ? 'การเปลี่ยนแปลง: ' : 'Change: '}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '16px' }}>
              {revenueChange > 0 ? '▲' : revenueChange < 0 ? '▼' : '—'}
            </span>
            <span style={{
              fontSize: '16px',
              fontWeight: 600,
              color: revenueChange > 0 ? '#10b981' : revenueChange < 0 ? '#ef4444' : '#6b7280',
            }}>
              {revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Chart */}
        <div style={{
          height: '150px',
          position: 'relative',
        }}>
          <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
            {(() => {
              // PART 4: Guard against NaN and ensure valid numbers
              const values = revenueData.map(d => {
                const val = Number(d.revenue) || 0;
                return isNaN(val) || !isFinite(val) ? 0 : val;
              });
              
              // Ensure we have valid values
              if (values.length === 0 || values.every(v => v === 0)) {
                return null; // Return null to show empty state
              }
              
              const min = Math.min(...values);
              const max = Math.max(...values);
              const range = max - min || 1; // Prevent division by zero
              
              const points = values.map((v, idx) => {
                const x = (idx / (values.length - 1)) * 100;
                const y = 100 - ((v - min) / range) * 100;
                // Ensure y is valid (0-100)
                const validY = Math.max(0, Math.min(100, isNaN(y) || !isFinite(y) ? 0 : y));
                return `${x},${validY}`;
              }).join(' ');
              
              return (
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
              );
            })()}
          </svg>
        </div>

        {/* Latest Revenue */}
        <div style={{ marginTop: '1rem', fontSize: '14px', color: '#6b7280', textAlign: 'center' }}>
          {locale === 'th' ? 'รายได้ล่าสุด: ' : 'Latest Revenue: '}
          <span style={{ fontWeight: 600, color: '#0a0a0a' }}>
            {latestRevenue.toLocaleString('en-US')} {locale === 'th' ? 'บาท' : 'THB'}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}
