'use client';

import type { CSSProperties } from 'react';
import { formatCurrency } from '../../utils/formatting';
import type { TodayPrioritiesRow } from '../../services/db/today-priorities-service';

interface Props {
  rows: TodayPrioritiesRow[];
  locale: string;
  loading?: boolean;
}

function titleLine(row: TodayPrioritiesRow, th: boolean): string {
  return (
    row.short_title?.trim() ||
    row.alert_type?.replace(/_/g, ' ').trim() ||
    (th ? 'ลำดับความสำคัญ' : 'Priority')
  );
}

const actionClamp: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export function CompanyTodaysPriorities({ rows, locale, loading }: Props) {
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';
  const visible = rows.slice(0, 3);

  const title = th ? 'ลำดับความสำคัญวันนี้' : "Today's Priorities";
  const part1 = th ? 'ทำอะไรตอนนี้' : 'What to do now';
  const part2 = th ? 'รายละเอียด' : 'Details';
  const doThis = th ? 'ทำแบบนี้' : 'Do this';
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
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>{title}</div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>{loadingMsg}</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.45 }}>{emptyMsg}</p>
      ) : (
        <>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '10px',
            }}
          >
            {part1}
          </div>
          <ol
            style={{
              margin: '0 0 22px 0',
              paddingLeft: '1.25rem',
              fontSize: '15px',
              lineHeight: 1.5,
              color: '#0f172a',
            }}
          >
            {visible.map((row, idx) => {
              const impact = row.impact ?? 0;
              const impactStr = formatCurrency(impact, numLocale);
              const key = `n-${row.branch_id}-${row.alert_type}-${idx}`;
              return (
                <li key={key} style={{ marginBottom: '8px', paddingLeft: '4px' }}>
                  <span style={{ fontWeight: 700 }}>{titleLine(row, th)}</span>{' '}
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>(฿{impactStr})</span>
                </li>
              );
            })}
          </ol>

          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '12px',
            }}
          >
            {part2}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    backgroundColor: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#0f172a',
                      marginBottom: '10px',
                    }}
                  >
                    {branch} — {alertLabel}
                  </div>
                  {action !== '' && (
                    <div style={{ fontSize: '14px', lineHeight: 1.45, marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{doThis}:</span>{' '}
                      <div style={{ ...actionClamp, fontWeight: 600, color: '#1e293b', marginTop: '2px' }}>
                        {action}
                      </div>
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
