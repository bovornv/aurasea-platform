// Confidence timeline visualization component
'use client';

import { monitoringService, type ConfidenceSnapshot } from '../services/monitoring-service';
import { useI18n } from '../hooks/use-i18n';
import { useEffect, useState } from 'react';

interface ConfidenceTimelineProps {
  className?: string;
}

export function ConfidenceTimeline({ className }: ConfidenceTimelineProps) {
  const { t, locale } = useI18n();
  const [history, setHistory] = useState<ConfidenceSnapshot[]>([]);

  useEffect(() => {
    const snapshots = monitoringService.getConfidenceHistory();
    setHistory(snapshots);
    
    // Refresh history when monitoring status changes (e.g., after data update)
    const interval = setInterval(() => {
      const updated = monitoringService.getConfidenceHistory();
      if (updated.length !== snapshots.length || 
          (updated.length > 0 && snapshots.length > 0 && 
           updated[0].date.getTime() !== snapshots[0].date.getTime())) {
        setHistory(updated);
      }
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  if (history.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
        {locale === 'th' 
          ? 'ยังไม่มีประวัติความเชื่อมั่น' 
          : 'No confidence history yet'}
      </div>
    );
  }

  // Prepare data for visualization (last 30 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const filteredHistory = history
    .filter(s => new Date(s.date).getTime() >= thirtyDaysAgo.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (filteredHistory.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
        {locale === 'th' 
          ? 'ยังไม่มีข้อมูลในช่วง 30 วันที่ผ่านมา' 
          : 'No data in the last 30 days'}
      </div>
    );
  }

  // Calculate min/max for scaling with padding
  const confidences = filteredHistory.map(s => s.confidenceAdjusted);
  const minConfidence = Math.max(0, Math.min(...confidences) - 0.05); // Add 5% padding at bottom
  const maxConfidence = Math.min(1, Math.max(...confidences) + 0.05); // Add 5% padding at top
  const range = maxConfidence - minConfidence || 0.1; // Minimum range to prevent division by zero

  // Sparkline dimensions
  const width = 100;
  const height = 50;
  const padding = 8;
  const leftPadding = 45; // Space for Y-axis labels

  // Generate SVG path - handle single point case
  let pathData = '';
  let points: Array<{ x: number; y: number }> = [];
  
  if (filteredHistory.length === 1) {
    // Single point: show as horizontal line at current confidence
    const x = leftPadding + (width - leftPadding - padding);
    const y = height - padding - ((filteredHistory[0].confidenceAdjusted - minConfidence) / range) * (height - padding * 2);
    points = [{ x, y }];
    // Draw a short horizontal line to show it's a single data point
    pathData = `M ${leftPadding},${y} L ${x},${y}`;
  } else {
    // Multiple points: draw line chart
    points = filteredHistory.map((snapshot, index) => {
      const x = leftPadding + (index / (filteredHistory.length - 1)) * (width - leftPadding - padding);
      const y = height - padding - ((snapshot.confidenceAdjusted - minConfidence) / range) * (height - padding * 2);
      return { x, y };
    });
    pathData = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  }

  return (
    <div className={className} style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>
          {locale === 'th' ? 'ความเชื่อมั่นของข้อมูล (30 วัน)' : 'Data Confidence (30 days)'}
        </h4>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
          {locale === 'th' 
            ? 'ความเชื่อมั่นลดลงเมื่อข้อมูลไม่ได้รับการอัปเดตอย่างสม่ำเสมอ'
            : 'Confidence decreases when data is not updated regularly'}
        </p>
      </div>

      <div style={{ position: 'relative', width: '100%', height: `${height + 35}px`, paddingLeft: '8px' }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
          {/* Background area - only show if multiple points */}
          {filteredHistory.length > 1 && (
            <path
              d={`M ${points[0].x},${points[0].y} L ${pathData.split('L').slice(1).join('L')} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`}
              fill="rgba(59, 130, 246, 0.1)"
            />
          )}
          
          {/* Sparkline */}
          <path
            d={pathData}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          ))}
        </svg>

        {/* X-axis labels */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '11px', 
          color: '#6b7280',
          marginTop: '8px',
          paddingLeft: `${leftPadding}px`,
          paddingRight: `${padding}px`
        }}>
          {filteredHistory.length > 1 ? (
            <>
              <span>
                {new Date(filteredHistory[0].date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
              <span>
                {new Date(filteredHistory[filteredHistory.length - 1].date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
            </>
          ) : (
            <span style={{ width: '100%', textAlign: 'center' }}>
              {new Date(filteredHistory[0].date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { 
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
          )}
        </div>

        {/* Y-axis labels - positioned inside SVG area */}
        <div style={{ 
          position: 'absolute',
          left: '8px',
          top: '0',
          height: `${height}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: '#9ca3af',
          width: '35px',
          textAlign: 'right',
          paddingRight: '8px'
        }}>
          <span>{(maxConfidence * 100).toFixed(0)}%</span>
          <span>{(minConfidence * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Current confidence and data point count */}
      {filteredHistory.length > 0 && (
        <div style={{ 
          marginTop: '1rem', 
          paddingTop: '0.75rem',
          borderTop: '1px solid #e5e7eb',
          fontSize: '12px', 
          color: '#6b7280',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>
            {locale === 'th' ? 'ความเชื่อมั่นปัจจุบัน' : 'Current confidence'}:{' '}
            <span style={{ fontWeight: 600, color: '#374151' }}>
              {(filteredHistory[filteredHistory.length - 1].confidenceAdjusted * 100).toFixed(0)}%
            </span>
          </span>
          {filteredHistory.length === 1 && (
            <span style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
              {locale === 'th' 
                ? 'ข้อมูลเพียง 1 จุด — อัปเดตข้อมูลเพื่อดูแนวโน้ม'
                : '1 data point — Update data to see trends'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
