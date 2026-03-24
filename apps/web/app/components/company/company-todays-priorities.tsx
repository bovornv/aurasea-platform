'use client';

import { formatCurrency } from '../../utils/formatting';
import type { TodayPrioritiesRow } from '../../services/db/today-priorities-service';

interface Props {
  rows: TodayPrioritiesRow[];
  locale: string;
  loading?: boolean;
}

function impactSuffix(th: boolean, impactLabel: string | null | undefined): string {
  const x = (impactLabel || 'at risk').toLowerCase();
  if (x === 'opportunity') {
    return th ? 'โอกาส' : 'opportunity';
  }
  return th ? 'เสี่ยง' : 'at risk';
}

export function CompanyTodaysPriorities({ rows, locale, loading }: Props) {
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';
  const visible = rows.slice(0, 3);

  const title = th ? 'ลำดับความสำคัญวันนี้' : "Today's Priorities";
  const emptyMsg = th ? 'ทุกอย่างโอเค — ไม่มีลำดับความสำคัญวันนี้' : 'All good — no priorities today';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';
  const actionFallback = th ? 'ดำเนินการตามสัญญาณ' : 'Take action on this signal';

  return (
    <div
      style={{
        background: '#fafafa',
        border: '1px solid #e8e8e8',
        borderRadius: '14px',
        padding: '18px 20px 20px',
        marginBottom: '0.25rem',
      }}
    >
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: '#475569',
          marginBottom: '16px',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{emptyMsg}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {visible.map((row, idx) => {
            const rank = row.rank ?? idx + 1;
            const branch = row.branch_name?.trim() || row.branch_id || (th ? 'สาขา' : 'Branch');
            const headline =
              (row.short_title?.trim() ||
                `${(row.alert_type || 'alert').replace(/_/g, ' ')} — ${branch}`) || branch;
            const amt = row.impact_estimate_thb ?? 0;
            const amtStr = formatCurrency(amt, numLocale);
            const riskWord = impactSuffix(th, row.impact_label);
            const titleLine = `${rank}. ${headline} (฿${amtStr} ${riskWord})`;
            const action = (row.action_text ?? '').trim() || actionFallback;
            const key = `p-${row.branch_id}-${row.alert_type}-${idx}`;

            return (
              <li key={key}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    lineHeight: 1.45,
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {titleLine}
                </p>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '13px',
                    lineHeight: 1.45,
                    fontWeight: 500,
                    color: '#64748b',
                  }}
                >
                  <span aria-hidden style={{ marginRight: '0.25rem' }}>
                    →
                  </span>
                  {action}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
