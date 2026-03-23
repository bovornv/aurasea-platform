'use client';

import type { WhatsWorkingTodayRow } from '../../services/db/whats-working-today-service';

interface Props {
  rows: WhatsWorkingTodayRow[];
  locale: string;
  loading?: boolean;
}

export function CompanyWhatsWorkingToday({ rows, locale, loading }: Props) {
  const th = locale === 'th';
  const visible = rows.slice(0, 3);

  const emptyMsg = th
    ? 'ผลงานคงที่ — ยังไม่มีสัญญาณเชิงบวกที่โดดเด่น'
    : 'Stable performance — no major positive signals yet';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';

  if (loading) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>;
  }
  if (visible.length === 0) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{emptyMsg}</p>;
  }

  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {visible.map((row, idx) => {
        const text = row.highlight_text?.trim() || row.branch_name || '—';
        const key = `w-${row.branch_id}-${idx}`;
        return (
          <li
            key={key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '14px',
              lineHeight: 1.5,
              color: '#166534',
              fontWeight: 500,
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: '8px',
                height: '8px',
                marginTop: '6px',
                borderRadius: '9999px',
                background: '#22c55e',
                boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)',
              }}
            />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
