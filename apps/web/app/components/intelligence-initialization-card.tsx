/**
 * Shown when intelligence stage is not FULLY_ACTIVE.
 * Layered activation: dynamic title, description, next milestone, progress.
 * Never shows empty or useless state.
 */
'use client';

import { SectionCard } from './section-card';
import {
  INTELLIGENCE_DAYS_TARGET,
  getActivationStage,
  getActivationTitle,
  getActivationDescription,
  getNextMilestone,
} from '../utils/intelligence-stage';

interface IntelligenceInitializationCardProps {
  coverageDays: number;
  locale?: 'en' | 'th';
}

export function IntelligenceInitializationCard({ coverageDays, locale = 'en' }: IntelligenceInitializationCardProps) {
  const target = INTELLIGENCE_DAYS_TARGET;
  const progress = Math.min(100, (coverageDays / target) * 100);
  const stage = getActivationStage(coverageDays);
  const title = getActivationTitle(stage, locale);
  const description = getActivationDescription(stage, locale);
  const nextMilestone = getNextMilestone(coverageDays, locale);

  const isInitializing = coverageDays < 7;

  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isInitializing && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.375rem 0.75rem',
              borderRadius: '8px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {locale === 'th' ? 'กำลังเริ่มต้น — กำลังรวบรวมข้อมูล' : 'Initializing — Collecting data'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ fontSize: '14px', color: '#374151' }}>
            {locale === 'th' ? 'ความครอบคลุมข้อมูล: ' : 'Data coverage: '}
            <strong>{coverageDays}</strong> / {target} {locale === 'th' ? 'วัน' : 'days'}
          </span>
        </div>
        <div
          style={{
            height: '8px',
            borderRadius: '4px',
            backgroundColor: '#e5e7eb',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: '#0a0a0a',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
          {description}
        </p>
        {nextMilestone && (
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            {locale === 'th' ? 'ปลดล็อกถัดไป: ' : 'Next unlock: '}
            <strong>{nextMilestone.label}</strong>
            {locale === 'th' ? ` (${nextMilestone.days} วัน)` : ` (${nextMilestone.days} days)`}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
