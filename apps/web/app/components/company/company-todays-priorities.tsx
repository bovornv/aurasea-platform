'use client';

import { formatCurrency } from '../../utils/formatting';
import type { TodayPrioritiesRow } from '../../services/db/today-priorities-service';

interface Props {
  rows: TodayPrioritiesRow[];
  locale: string;
  loading?: boolean;
}

function summaryTitle(row: TodayPrioritiesRow, th: boolean): string {
  const s = row.short_title?.trim();
  if (s) return s;
  const at = row.alert_type?.replace(/_/g, ' ').trim();
  const br = row.branch_name?.trim();
  if (at && br) return `${at} — ${br}`;
  return at || br || (th ? 'ลำดับความสำคัญ' : 'Priority');
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
  const whatNow = th ? 'ทำอะไรตอนนี้:' : 'What to do now:';
  const doThis = th ? 'ทำแบบนี้' : 'Do this';
  const why = th ? 'เหตุผล' : 'Why';
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
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#334155', marginBottom: '18px', letterSpacing: '-0.02em' }}>
        {title}
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{emptyMsg}</p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{whatNow}</p>
          <ol
            style={{
              margin: '0 0 28px 0',
              paddingLeft: '1.35rem',
              fontSize: '15px',
              lineHeight: 1.55,
              color: '#0f172a',
            }}
          >
            {visible.map((row, idx) => {
              const amt = row.impact_estimate_thb ?? 0;
              const amtStr = formatCurrency(amt, numLocale);
              const label = impactLabelUi(row.impact_label, th);
              const key = `n-${row.branch_id}-${row.alert_type}-${idx}`;
              return (
                <li key={key} style={{ marginBottom: '10px', paddingLeft: '2px' }}>
                  <span style={{ fontWeight: 600 }}>{summaryTitle(row, th)}</span>{' '}
                  <span style={{ fontWeight: 600, color: '#b91c1c' }}>
                    (฿{amtStr} {label})
                  </span>
                </li>
              );
            })}
          </ol>

          <div
            style={{
              height: '1px',
              background: 'linear-gradient(90deg, transparent, #e2e8f0 12%, #e2e8f0 88%, transparent)',
              marginBottom: '20px',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {visible.map((item, idx) => {
              const branch = item.branch_name?.trim() || item.branch_id || (th ? 'สาขา' : 'Branch');
              const alertLabel =
                item.alert_type?.replace(/_/g, ' ').trim() || (th ? 'แจ้งเตือน' : 'Alert');
              const action = (item.action_text ?? '').trim();
              const reason = (item.reason_short ?? '').trim();
              const key = `c-${item.branch_id}-${item.alert_type}-${idx}`;

              return (
                <div key={key} style={{ padding: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '10px',
                    }}
                  >
                    {branch} — {alertLabel}
                  </div>
                  {action !== '' && (
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: 1.55, color: '#334155' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{doThis}:</span> {action}
                    </p>
                  )}
                  {reason !== '' && (
                    <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#64748b' }}>
                      <span style={{ fontWeight: 600, color: '#475569' }}>{why}:</span> {reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
