'use client';

import { formatCurrency } from '../../utils/formatting';
import type { TodayActionPlanRow } from '../../services/db/today-action-plan-service';

interface Props {
  rows: TodayActionPlanRow[];
  locale: string;
  loading?: boolean;
  /** Show top N (3–5 recommended). */
  maxItems?: number;
}

export function CompanyTodaysActionPlan({ rows, locale, loading, maxItems = 5 }: Props) {
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';
  const cap = Math.min(10, Math.max(1, maxItems));
  const visible = rows.slice(0, cap);

  const title = th ? 'แผนปฏิบัติวันนี้' : "Today's Action Plan";
  const emptyMsg = th ? 'ทุกอย่างโอเค — ไม่มีงานที่ต้องทำวันนี้' : 'All good — no actions needed today';
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
            const actionTitle = item.action_title?.trim() || (th ? 'การดำเนินการ' : 'Action');
            const actionText = (item.action_text ?? '').trim();
            const reason = (item.reason ?? '').trim();
            const impact = item.impact ?? 0;
            const impactStr = formatCurrency(impact, numLocale);
            const key = `${item.branch_id}-${item.action_title}-${idx}`;

            return (
              <div
                key={key}
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                  {branch} — {actionTitle}
                </div>
                {actionText !== '' && (
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45, marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{th ? 'การดำเนินการ' : 'Action'}:</span>{' '}
                    {actionText}
                  </div>
                )}
                {reason !== '' && (
                  <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.45, marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>{th ? 'เหตุผล' : 'Reason'}:</span> {reason}
                  </div>
                )}
                <div style={{ fontSize: '13px' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{th ? 'ผลกระทบ' : 'Impact'}:</span>{' '}
                  <span style={{ fontWeight: 600, color: '#b45309' }}>฿{impactStr}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
