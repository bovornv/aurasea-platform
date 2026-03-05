// Alert suppression notice component
'use client';

import Link from 'next/link';
import { useI18n } from '../hooks/use-i18n';
import { useCurrentBranch } from '../hooks/use-current-branch';
import type { AlertSuppressionInfo } from '../services/monitoring-service';

interface AlertSuppressionNoticeProps {
  suppressionInfo: AlertSuppressionInfo;
}

export function AlertSuppressionNotice({ suppressionInfo }: AlertSuppressionNoticeProps) {
  const { t, locale } = useI18n();
  const { branch } = useCurrentBranch();
  
  // Use new metrics route
  const metricsHref = '/branch/log-today';

  if (!suppressionInfo.isSuppressed) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid #fbbf24',
        borderRadius: '12px',
        padding: '1.5rem',
        backgroundColor: '#fef3c7',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#92400e', marginBottom: '0.5rem' }}>
            {locale === 'th' 
              ? 'การแจ้งเตือนถูกระงับเนื่องจากข้อมูลไม่เพียงพอ'
              : 'Alerts suppressed due to insufficient data'}
          </h3>
          <p style={{ fontSize: '14px', color: '#78350f', marginBottom: '0.75rem', lineHeight: '1.6' }}>
            {locale === 'th' 
              ? `มีการระงับการแจ้งเตือน ${suppressionInfo.suppressedCount} รายการ เนื่องจากความเชื่อมั่นของข้อมูลต่ำกว่า 50% นี่เป็นเพราะคุณภาพข้อมูลไม่ใช่ความปลอดภัยทางธุรกิจ`
              : `${suppressionInfo.suppressedCount} alert(s) have been suppressed because data confidence is below 50%. This is due to low data quality, not business safety.`}
          </p>
          <p style={{ fontSize: '13px', color: '#92400e', marginBottom: '1rem', fontStyle: 'italic' }}>
            {locale === 'th'
              ? 'การแจ้งเตือนระดับข้อมูล (Informational) ยังคงแสดงอยู่'
              : 'Informational alerts are still shown'}
          </p>
          <Link
            href={metricsHref}
            style={{
              display: 'inline-block',
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: '#78350f',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#92400e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#78350f';
            }}
          >
            {locale === 'th' 
              ? 'อัปเดตตัวเลขล่าสุด'
              : 'Update Latest Metrics'}
          </Link>
        </div>
      </div>
    </div>
  );
}
