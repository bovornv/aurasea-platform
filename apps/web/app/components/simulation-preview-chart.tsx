/**
 * Simulation Preview Chart
 * 
 * Lightweight chart showing daily revenue and cost trends
 * over the 40-day simulation dataset.
 */

'use client';

import { useMemo } from 'react';

interface DailyMetric {
  date: string;
  totalRevenue: number;
  totalCost: number;
}

interface SimulationPreviewChartProps {
  data: DailyMetric[];
  startDate: string;
  endDate: string;
}

export function SimulationPreviewChart({ data, startDate, endDate }: SimulationPreviewChartProps) {
  // Format date range for display
  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  };

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Calculate min/max for scaling
    const allValues = data.flatMap(d => [d.totalRevenue, d.totalCost]);
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const rawRange = rawMax - rawMin || 1;
    
    // Add padding (10% on each side) to bring lines closer when values are similar
    const padding = rawRange * 0.1;
    const min = rawMin - padding;
    const max = rawMax + padding;
    const range = max - min || 1;

    // Format dates for display (show first, middle, last)
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return {
      min,
      max,
      range,
      revenuePoints: data.map((d, idx) => {
        // Ensure last point is exactly at 100% when data.length > 1
        const x = data.length > 1 ? (idx / (data.length - 1)) * 100 : 0;
        const y = 100 - ((d.totalRevenue - min) / range) * 100;
        return { x, y, value: d.totalRevenue };
      }),
      costPoints: data.map((d, idx) => {
        // Ensure last point is exactly at 100% when data.length > 1
        const x = data.length > 1 ? (idx / (data.length - 1)) * 100 : 0;
        const y = 100 - ((d.totalCost - min) / range) * 100;
        return { x, y, value: d.totalCost };
      }),
      dateLabels: [
        { x: 0, label: formatDate(data[0].date) },
        { x: 50, label: formatDate(data[Math.floor(data.length / 2)].date) },
        { x: 100, label: formatDate(data[data.length - 1].date) },
      ],
    };
  }, [data]);

  if (!chartData || !data || data.length === 0) {
    return null;
  }

  const revenuePath = chartData.revenuePoints.map(p => `${p.x},${p.y}`).join(' ');
  const costPath = chartData.costPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Calculate averages for legend
  const avgRevenue = data.reduce((sum, d) => sum + d.totalRevenue, 0) / data.length;
  const avgCost = data.reduce((sum, d) => sum + d.totalCost, 0) / data.length;

  return (
    <div style={{
      marginTop: '1rem',
      padding: '0.75rem',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      maxHeight: '220px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
        📊 Simulation Preview (Last 40 Days)
      </div>
      <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '0.5rem' }}>
        Generated dataset: {formatDateRange(startDate, endDate)}
      </div>

      {/* Chart */}
      <div style={{
        height: '150px',
        position: 'relative',
        marginBottom: '0.5rem',
      }}>
        <svg width="100%" height="100%" style={{ overflow: 'visible' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Grid lines - using absolute coordinates to match polyline */}
          {[0, 25, 50, 75, 100].map(y => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="#f3f4f6"
              strokeWidth="0.5"
            />
          ))}

          {/* Cost line (red) */}
          <polyline
            points={costPath}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeOpacity="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Revenue line (green) */}
          <polyline
            points={revenuePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.5"
            strokeOpacity="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Date labels - using absolute coordinates */}
          {chartData.dateLabels.map((label, idx) => (
            <text
              key={idx}
              x={label.x}
              y="95"
              fontSize="8"
              fill="#9ca3af"
              textAnchor={idx === 0 ? 'start' : idx === chartData.dateLabels.length - 1 ? 'end' : 'middle'}
            >
              {label.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '10px',
        paddingTop: '0.5rem',
        borderTop: '1px solid #f3f4f6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '12px', height: '2px', backgroundColor: '#10b981' }} />
          <span style={{ color: '#6b7280' }}>Revenue</span>
          <span style={{ fontWeight: 600, color: '#10b981' }}>
            ฿{Math.round(avgRevenue).toLocaleString('en-US')}/day
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '12px', height: '2px', backgroundColor: '#ef4444' }} />
          <span style={{ color: '#6b7280' }}>Cost</span>
          <span style={{ fontWeight: 600, color: '#ef4444' }}>
            ฿{Math.round(avgCost).toLocaleString('en-US')}/day
          </span>
        </div>
      </div>
    </div>
  );
}
