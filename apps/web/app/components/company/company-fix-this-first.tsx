'use client';

import { formatCurrency } from '../../utils/formatting';
import type { AlertsFixThisFirstRow } from '../../services/db/alerts-fix-this-first-service';

interface Props {
  rows: AlertsFixThisFirstRow[];
  locale: string;
  loading?: boolean;
  maxItems?: number;
}

function borderColorForSeverity(severity: number | null | undefined): string {
  const s = severity ?? 0;
  if (s >= 3) return '#dc2626';
  if (s === 2) return '#ea580c';
  return '#9ca3af';
}

export function CompanyFixThisFirst({ rows, locale, loading, maxItems = 3 }: Props) {
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';
  const cap = Math.min(10, Math.max(1, maxItems));
  const visible = rows.slice(0, cap);

  const title = th ? 'แก้ไขก่อน' : 'Fix This First';
  const emptyMsg = th
    ? 'สาขาทั้งหมดอยู่ในเกณฑ์ที่ดี ไม่มีงานเร่งด่วน'
    : 'All branches performing well. No urgent actions.';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '0.25rem',
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>{title}</div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>{loadingMsg}</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.45 }}>{emptyMsg}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {visible.map((item, idx) => {
            const branch = item.branch_name?.trim() || item.branch_id || (th ? 'สาขา' : 'Branch');
            const alertTitle = item.alert_type?.trim() || (th ? 'แจ้งเตือน' : 'Alert');
            const impact = item.impact_estimate_thb ?? 0;
            const impactStr = formatCurrency(impact, numLocale);
            const cause = (item.cause ?? '').trim();
            const action = (item.recommended_action ?? '').trim();
            const key = `${item.branch_id}-${item.alert_type}-${idx}`;

            return (
              <div
                key={key}
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#fafafa',
                  borderRadius: '8px',
                  borderLeftWidth: '4px',
                  borderLeftStyle: 'solid',
                  borderLeftColor: borderColorForSeverity(item.severity),
                  borderTop: '1px solid #f3f4f6',
                  borderRight: '1px solid #f3f4f6',
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                  {branch} — {alertTitle}
                </div>
                <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{th ? 'ผลกระทบ' : 'Impact'}:</span>{' '}
                  <span style={{ fontWeight: 600, color: '#dc2626' }}>฿{impactStr}</span>
                </div>
                {cause !== '' && (
                  <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.45, marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>{th ? 'เหตุผล' : 'Reason'}:</span> {cause}
                  </div>
                )}
                {action !== '' && (
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{th ? 'การดำเนินการ' : 'Action'}:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{action}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
