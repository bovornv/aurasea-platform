'use client';

import type { OpportunitiesTodayRow } from '../../services/db/opportunities-today-service';

interface Props {
  rows: OpportunitiesTodayRow[];
  locale: string;
  loading?: boolean;
}

const ARROW = ' → ';

function OpportunityLine({ text }: { text: string }) {
  const i = text.indexOf(ARROW);
  if (i === -1) {
    return <span style={{ color: '#0c4a6e' }}>{text}</span>;
  }
  return (
    <span style={{ color: '#0c4a6e' }}>
      {text.slice(0, i)}
      <span style={{ fontWeight: 800, color: '#2563eb', letterSpacing: '-0.02em' }}> → </span>
      {text.slice(i + ARROW.length)}
    </span>
  );
}

export function CompanyOpportunitiesToday({ rows, locale, loading }: Props) {
  const th = locale === 'th';
  const visible = rows.slice(0, 3);

  const emptyMsg = th ? 'ยังไม่มีโอกาสชัดเจนวันนี้' : 'No clear opportunities today';
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
        const text = row.opportunity_text?.trim() || row.branch_name || '—';
        const key = `o-${row.branch_id}-${idx}`;
        return (
          <li
            key={key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '14px',
              lineHeight: 1.5,
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
                background: 'linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)',
                boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
              }}
            />
            <OpportunityLine text={text} />
          </li>
        );
      })}
    </ul>
  );
}
