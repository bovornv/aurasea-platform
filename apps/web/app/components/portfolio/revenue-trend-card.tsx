/**
 * Revenue Trend Card Component
 * 
 * Compact revenue trend visualization for Trends page
 */
'use client';

import { useState, useMemo } from 'react';
import { SectionCard } from '../section-card';
import { businessGroupService } from '../../services/business-group-service';
import { getDailyMetrics } from '../../services/db/daily-metrics-service';

interface RevenueTrendCardProps {
  businessGroupId: string;
  locale: string;
}

export function RevenueTrendCard({ businessGroupId, locale }: RevenueTrendCardProps) {
  const [trendWindow, setTrendWindow] = useState<30 | 90>(30);
  const [revenueData, setRevenueData] = useState<{ date: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useMemo(() => {
    const loadRevenueData = async () => {
      setLoading(true);
      try {
        const allBranches = businessGroupService.getAllBranches().filter(
          b => b.businessGroupId === businessGroupId
        );
        
        const revenueMap = new Map<string, number>();
        
        for (const branch of allBranches) {
          const dailyMetrics = await getDailyMetrics(branch.id, trendWindow);
          dailyMetrics.forEach(metric => {
            const date = metric.date;
            const existing = revenueMap.get(date) || 0;
            revenueMap.set(date, existing + (metric.revenue || 0));
          });
        }
        
        const sortedData = Array.from(revenueMap.entries())
          .map(([date, revenue]) => ({ date, revenue }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        setRevenueData(sortedData);
      } catch (e) {
        console.error('[RevenueTrendCard] Failed to load revenue data:', e);
        setRevenueData([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadRevenueData();
  }, [businessGroupId, trendWindow]);

  const totalRevenue = useMemo(() => {
    return revenueData.reduce((sum, d) => sum + d.revenue, 0);
  }, [revenueData]);

  const avgDailyRevenue = useMemo(() => {
    if (revenueData.length === 0) return 0;
    return totalRevenue / revenueData.length;
  }, [revenueData, totalRevenue]);

  const trendComparison = useMemo(() => {
    if (revenueData.length < 10) return null;
    
    const currentPeriod = revenueData.slice(-Math.floor(revenueData.length / 2));
    const previousPeriod = revenueData.slice(0, Math.floor(revenueData.length / 2));
    
    const currentAvg = currentPeriod.reduce((sum, d) => sum + d.revenue, 0) / currentPeriod.length;
    const previousAvg = previousPeriod.reduce((sum, d) => sum + d.revenue, 0) / previousPeriod.length;
    
    const delta = currentAvg - previousAvg;
    const percentChange = previousAvg > 0 ? (delta / previousAvg) * 100 : 0;
    
    return {
      delta,
      percentChange,
      isIncreasing: delta > 0,
    };
  }, [revenueData]);

  return (
<SectionCard title={locale === 'th' ? 'แนวโน้มรายได้' : 'Revenue Trend'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          {locale === 'th' ? `${trendWindow} วันล่าสุด` : `Last ${trendWindow} days`}
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

      {loading ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
          {locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
        </div>
      ) : revenueData.length === 0 ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
          {locale === 'th' ? 'ไม่มีข้อมูลรายได้' : 'No revenue data'}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a' }}>
              {totalRevenue.toLocaleString()} THB
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
              {locale === 'th' ? 'เฉลี่ยต่อวัน' : 'Daily avg'}: {avgDailyRevenue.toLocaleString()} THB
            </div>
            {trendComparison && (
              <div style={{ fontSize: '13px', color: trendComparison.isIncreasing ? '#10b981' : '#ef4444', marginTop: '0.25rem' }}>
                {trendComparison.isIncreasing ? '▲' : '▼'} {Math.abs(trendComparison.percentChange).toFixed(1)}%
                {locale === 'th' ? ' เทียบกับช่วงก่อนหน้า' : ' vs previous period'}
              </div>
            )}
          </div>
          
          {/* Simple line chart */}
          <div style={{ height: '80px', position: 'relative', marginTop: '0.5rem' }}>
            {revenueData.length > 1 && (
              <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                {(() => {
                  const maxRevenue = Math.max(...revenueData.map(d => d.revenue));
                  const minRevenue = Math.min(...revenueData.map(d => d.revenue));
                  const range = maxRevenue - minRevenue || 1;
                  
                  const points = revenueData.map((d, idx) => {
                    const x = (idx / (revenueData.length - 1)) * 100;
                    const y = 100 - ((d.revenue - minRevenue) / range) * 100;
                    return `${x},${y}`;
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
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}
