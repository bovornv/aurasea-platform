'use client';

import { useRouter } from 'next/navigation';
import { formatCurrency } from '../../utils/formatting';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import type { NormalizedCriticalAlertRow } from '../../services/db/company-today-data-service';

interface Props {
  rows: NormalizedCriticalAlertRow[];
  locale: string;
}

/** Critical alerts from `alerts_critical` (impact_estimate_thb DESC). */
export function CompanyCriticalAlertsDb({ rows, locale }: Props) {
  const router = useRouter();
  const paths = useOrgBranchPaths();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
          {locale === 'th'
            ? 'ไม่มีแถวใน alerts_critical สำหรับสาขาที่เลือก'
            : 'No rows in alerts_critical for selected branches.'}
        </p>
      ) : (
        rows.map((alert, i) => (
          <div
            key={`${alert.branchId}-${i}-${alert.title}`}
            style={{
              padding: '1rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>
              {alert.branchName}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
              {alert.title || '—'}
            </div>
            <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600 }}>Cause:</span> {alert.cause || '—'}
            </div>
            <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 600 }}>Impact:</span>{' '}
              <span style={{ fontWeight: 600, color: '#b91c1c' }}>
                ฿{formatCurrency(alert.impactThb)}{' '}
                {locale === 'th' ? '(ประมาณการจากฐานข้อมูล)' : '(from DB estimate)'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600 }}>Action:</span> {alert.action || '—'}
            </div>
          </div>
        ))
      )}
      {paths.companyAlerts && (
        <button
          type="button"
          onClick={() => router.push(paths.companyAlerts!)}
          style={{
            marginTop: '0.25rem',
            padding: '0.625rem 1rem',
            backgroundColor: 'transparent',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          {locale === 'th' ? 'ดูการแจ้งเตือนทั้งหมด →' : 'View all alerts →'}
        </button>
      )}
    </div>
  );
}
