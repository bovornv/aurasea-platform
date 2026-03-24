'use client';

import type { WatchlistTodayRow } from '../../services/db/watchlist-today-service';

interface Props {
  rows: WatchlistTodayRow[];
  locale: string;
  loading?: boolean;
}

export function CompanyWatchlistToday({ rows, locale, loading }: Props) {
  const th = locale === 'th';
  const visible = rows.slice(0, 3);
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';
  const fallback = th ? 'ไม่พบสัญญาณเตือนล่วงหน้า' : 'No early warning signals detected';

  if (loading) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>;
  }

  if (visible.length === 0) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{fallback}</p>;
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
        const text = row.warning_text?.trim() || fallback;
        const key = `wl-${row.branch_id || 'org'}-${idx}`;
        return (
          <li
            key={key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '14px',
              lineHeight: 1.5,
              color: '#92400e',
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
                background: '#f59e0b',
                boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.25)',
              }}
            />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

