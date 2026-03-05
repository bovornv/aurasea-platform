/**
 * Branch Health Score Card Component
 * 
 * Displays individual branch health scores with trend arrows
 */
'use client';

import { useI18n } from '../hooks/use-i18n';
import type { BranchHealthScore } from '../services/health-score-service';

interface BranchHealthScoreCardProps {
  branchScore: BranchHealthScore;
  onClick?: () => void;
}

export function BranchHealthScoreCard({ branchScore, onClick }: BranchHealthScoreCardProps) {
  const { locale } = useI18n();

  const getHealthScoreColor = (score: number): string => {
    if (score >= 70) return '#10b981'; // green
    if (score >= 50) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable'): string => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      case 'stable':
        return '→';
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable'): string => {
    switch (trend) {
      case 'up':
        return '#10b981';
      case 'down':
        return '#ef4444';
      case 'stable':
        return '#6b7280';
    }
  };

  return (
    <div
      onClick={onClick}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.5rem',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        opacity: branchScore.hasSufficientData ? 1 : 0.6,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', margin: '0 0 0.25rem 0' }}>
            {branchScore.branchName}
          </h3>
          {!branchScore.hasSufficientData && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              backgroundColor: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#92400e',
              marginTop: '0.25rem',
            }}>
              <span>⚠️</span>
              <span>{locale === 'th' ? 'ข้อมูลไม่เพียงพอ' : 'Low Data Confidence'}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '24px',
            fontWeight: 600,
            color: getHealthScoreColor(branchScore.healthScore),
          }}>
            {branchScore.healthScore.toFixed(1)}
          </span>
          <span style={{
            fontSize: '18px',
            fontWeight: 600,
            color: getTrendColor(branchScore.trend),
          }}>
            {getTrendIcon(branchScore.trend)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', fontSize: '12px', color: '#6b7280' }}>
        <span>
          {locale === 'th' ? 'วิกฤต' : 'Critical'}: {branchScore.alertCounts.critical}
        </span>
        <span>
          {locale === 'th' ? 'คำเตือน' : 'Warning'}: {branchScore.alertCounts.warning}
        </span>
        <span>
          {locale === 'th' ? 'ข้อมูล' : 'Info'}: {branchScore.alertCounts.informational}
        </span>
      </div>

      {branchScore.hasSufficientData && (
        <div style={{ marginTop: '0.75rem', fontSize: '11px', color: '#9ca3af' }}>
          {locale === 'th' 
            ? `ความเชื่อมั่น: ${Math.round(branchScore.dataConfidence * 100)}%`
            : `Confidence: ${Math.round(branchScore.dataConfidence * 100)}%`}
        </div>
      )}
    </div>
  );
}
