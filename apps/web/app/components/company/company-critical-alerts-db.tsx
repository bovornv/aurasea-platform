'use client';

import { useRouter } from 'next/navigation';
import { formatCurrency } from '../../utils/formatting';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import type { NormalizedCriticalAlertRow } from '../../services/db/company-today-data-service';

interface Props {
  rows: NormalizedCriticalAlertRow[];
  locale: string;
  /** Max cards to show (3–5). Default 5. */
  maxItems?: number;
}

const ACTION_FALLBACK = { en: 'Review performance', th: 'ทบทวนประสิทธิภาพ' };

/** Critical alerts from `alerts_critical` — deduped in service, sorted impact DESC, capped here. */
export function CompanyCriticalAlertsDb({ rows, locale, maxItems = 5 }: Props) {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';

  const cap = Math.min(5, Math.max(1, maxItems));
  const visible = rows.slice(0, cap);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
          {th
            ? 'ไม่มีแถวใน alerts_critical สำหรับสาขาที่เลือก'
            : 'No rows in alerts_critical for selected branches.'}
        </p>
      ) : (
        visible.map((alert) => {
          const actionText = alert.action?.trim() || (th ? ACTION_FALLBACK.th : ACTION_FALLBACK.en);
          const impactStr = formatCurrency(alert.impactThb, numLocale);
          return (
            <div
              key={alert.rowKey}
              style={{
                padding: '1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
                {alert.branchName}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                {alert.alertType}
              </div>
              {(alert.cause || '').trim() !== '' && (
                <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem', lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 600 }}>Cause:</span> {alert.cause}
                </div>
              )}
              <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: 600 }}>Impact:</span>{' '}
                <span style={{ fontWeight: 600, color: '#b91c1c' }}>
                  ฿{impactStr} {th ? 'เสี่ยงสูญเสียวันนี้' : 'at risk today'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>Action:</span> {actionText}
              </div>
            </div>
          );
        })
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
          {th ? 'ดูการแจ้งเตือนทั้งหมด →' : 'View all alerts →'}
        </button>
      )}
    </div>
  );
}
