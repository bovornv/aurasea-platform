'use client';

import { formatCurrency } from '../../utils/formatting';
import type { TodayPrioritiesRow } from '../../services/db/today-priorities-service';

interface Props {
  rows: TodayPrioritiesRow[];
  locale: string;
  loading?: boolean;
  maxItems?: number;
}

function bulletLine(row: TodayPrioritiesRow, th: boolean): string {
  const branch = row.branch_name?.trim() || row.branch_id || (th ? 'สาขา' : 'Branch');
  const short =
    row.action_short?.trim() ||
    row.alert_type?.replace(/_/g, ' ').trim() ||
    (th ? 'ลำดับความสำคัญ' : 'Priority');
  return `${short} — ${branch}`;
}

export function CompanyTodaysPriorities({ rows, locale, loading, maxItems = 5 }: Props) {
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';
  const cap = Math.min(10, Math.max(1, maxItems));
  const visible = rows.slice(0, cap);

  const title = th ? 'ลำดับความสำคัญวันนี้' : "Today's Priorities";
  const emptyMsg = th ? 'ทุกอย่างโอเค — ไม่มีลำดับความสำคัญวันนี้' : 'All good — no priorities today';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px 18px',
        marginBottom: '0.25rem',
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>{title}</div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>{loadingMsg}</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.45 }}>{emptyMsg}</p>
      ) : (
        <>
          <ul
            style={{
              margin: '0 0 18px 0',
              paddingLeft: '1.1rem',
              color: '#0f172a',
              fontSize: '14px',
              fontWeight: 600,
              lineHeight: 1.55,
            }}
          >
            {visible.map((row, idx) => (
              <li key={`b-${row.branch_id}-${row.alert_type}-${idx}`} style={{ marginBottom: '6px' }}>
                {bulletLine(row, th)}
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {visible.map((item, idx) => {
              const branch = item.branch_name?.trim() || item.branch_id || (th ? 'สาขา' : 'Branch');
              const alertLabel =
                item.alert_type?.replace(/_/g, ' ').trim() || (th ? 'แจ้งเตือน' : 'Alert');
              const action = (item.action_text ?? '').trim();
              const impact = item.impact ?? 0;
              const impactStr = formatCurrency(impact, numLocale);
              const key = `c-${item.branch_id}-${item.alert_type}-${idx}`;

              return (
                <div
                  key={key}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '10px',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '12px',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {branch} — {alertLabel}
                  </div>
                  {action !== '' && (
                    <div style={{ fontSize: '14px', lineHeight: 1.5, marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{th ? 'การดำเนินการ' : 'Action'}:</span>{' '}
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{action}</span>
                    </div>
                  )}
                  <div style={{ fontSize: '13px' }}>
                    <span style={{ fontWeight: 600, color: '#64748b' }}>{th ? 'ผลกระทบ' : 'Impact'}:</span>{' '}
                    <span style={{ fontWeight: 700, color: '#dc2626' }}>฿{impactStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
