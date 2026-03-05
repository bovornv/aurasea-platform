/**
 * Confidence Badge Component
 * 
 * Displays data confidence score with color coding
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '../hooks/use-i18n';
import type { MonitoringStatus } from '../services/monitoring-service';

interface ConfidenceBadgeProps {
  status: MonitoringStatus;
}

export function ConfidenceBadge({ status }: ConfidenceBadgeProps) {
  const { locale } = useI18n();

  // Calculate confidence score
  // PART 1.1: Fix confidence - ensure never shows 0 when data exists
  const confidence = useMemo(() => {
    // If no data at all, return 0
    if (!status.lastOperationalUpdateAt && status.dataCoverageDays === 0) {
      return 0;
    }

    // Calculate freshness score (0-100)
    let freshnessScore = 100;
    if (status.lastOperationalUpdateAt) {
      const now = new Date();
      const dataAgeMs = now.getTime() - status.lastOperationalUpdateAt.getTime();
      const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
      
      if (dataAgeDays > 7) {
        freshnessScore = Math.max(0, 100 - (dataAgeDays - 7) * 5); // Decay 5 points per day after 7 days
      }
    } else {
      // If no lastOperationalUpdateAt but we have data coverage, assume moderate freshness
      freshnessScore = status.dataCoverageDays >= 7 ? 80 : 60;
    }

    // Calculate coverage score (0-100)
    // More days of data = higher coverage
    const coverageScore = Math.min(100, (status.dataCoverageDays / 30) * 100); // 30 days = 100%

    // Combined confidence: freshness (60%) + coverage (40%)
    let combinedConfidence = Math.round((freshnessScore * 0.6) + (coverageScore * 0.4));
    
    // PART 1.1: Confidence guard - never show 0 if data exists
    // Minimum confidence floor = 40 if basic daily data exists
    // Minimum confidence floor = 60 if >= 7 days exist
    if (status.dataCoverageDays >= 7) {
      if (combinedConfidence <= 0) {
        combinedConfidence = 60; // Minimum 60% if we have 7+ days
      } else if (combinedConfidence < 40) {
        combinedConfidence = Math.max(40, combinedConfidence); // Minimum floor of 40%
      }
    } else if (status.dataCoverageDays > 0 && combinedConfidence <= 0) {
      combinedConfidence = 40; // Minimum floor of 40% if any daily data exists
    }
    
    return Math.max(0, Math.min(100, combinedConfidence));
  }, [status.lastOperationalUpdateAt, status.dataCoverageDays]);

  // Get color based on confidence
  const getColor = () => {
    if (confidence >= 80) return { bg: '#d1fae5', text: '#065f46', dot: '#10b981' };
    if (confidence >= 50) return { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' };
    return { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' };
  };

  const colors = getColor();

  // Get last update text
  const getLastUpdateText = () => {
    if (!status.lastOperationalUpdateAt) {
      return locale === 'th' ? 'ยังไม่มีการอัปเดต' : 'No updates yet';
    }
    const now = new Date();
    const dataAgeMs = now.getTime() - status.lastOperationalUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
    
    if (dataAgeDays === 0) {
      return locale === 'th' ? 'อัปเดตวันนี้' : 'Updated today';
    } else if (dataAgeDays === 1) {
      return locale === 'th' ? 'อัปเดตเมื่อ 1 วันที่แล้ว' : 'Last updated 1 day ago';
    } else {
      return locale === 'th' 
        ? `อัปเดตเมื่อ ${dataAgeDays} วันที่แล้ว`
        : `Last updated ${dataAgeDays} days ago`;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: colors.bg,
        borderRadius: '6px',
        border: `1px solid ${colors.dot}40`,
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: colors.dot,
          flexShrink: 0,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
          {locale === 'th' ? 'ความเชื่อมั่น' : 'Confidence'} {confidence}%
        </div>
        <div style={{ fontSize: '11px', color: colors.text, opacity: 0.8 }}>
          {getLastUpdateText()}
        </div>
      </div>
    </div>
  );
}
