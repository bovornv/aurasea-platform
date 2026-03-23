'use client';

import { formatCurrency } from '../../utils/formatting';
import type { TodayPrioritiesRow } from '../../services/db/today-priorities-service';

interface Props {
  rows: TodayPrioritiesRow[];
  locale: string;
  loading?: boolean;
}

function humanAlertType(raw: string | null | undefined, th: boolean): string {
  const s = raw?.replace(/_/g, ' ').trim();
  if (!s) return th ? 'แจ้งเตือน' : 'Alert';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function impactLabelUi(raw: string | null | undefined, th: boolean): string {
  const x = (raw || 'at risk').toLowerCase();
  if (th) {
    if (x === 'opportunity') return 'โอกาส';
    return 'เสี่ยง';
  }
  if (x === 'opportunity') return 'opportunity';
  return 'at risk';
}

export function CompanyTodaysPriorities({ rows, locale, loading }: Props) {
  const th = locale === 'th';
  const numLocale = th ? 'th-TH' : 'en-US';
  const visible = rows.slice(0, 3);

  const title = th ? 'ลำดับความสำคัญวันนี้' : "Today's Priorities";
  const whyLabel = th ? 'เหตุผล' : 'Why';
  const emptyMsg = th ? 'ทุกอย่างโอเค — ไม่มีลำดับความสำคัญวันนี้' : 'All good — no priorities today';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {visible.map((row, idx) => {
            const branch = row.branch_name?.trim() || row.branch_id || (th ? 'สาขา' : 'Branch');
            const alertLabel = humanAlertType(row.alert_type, th);
            const action = (row.action_text ?? '').trim();
            const amt = row.impact_estimate_thb ?? 0;
            const amtStr = formatCurrency(amt, numLocale);
            const label = impactLabelUi(row.impact_label, th);
            const reason = (row.reason_short ?? '').trim();
            const key = `p-${row.branch_id}-${row.alert_type}-${idx}`;
            const lead =
              action !== ''
                ? `${branch} — ${alertLabel}: ${action}`
                : `${branch} — ${alertLabel}`;

            return (
              <div key={key}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    lineHeight: 1.5,
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {lead}{' '}
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>
                    (฿{amtStr} {label})
                  </span>
                </p>
                {reason !== '' && (
                  <p
                    style={{
                      margin: '6px 0 0 0',
                      fontSize: '13px',
                      lineHeight: 1.45,
                      fontWeight: 400,
                      color: '#94a3b8',
                    }}
                  >
                    {whyLabel}: {reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
