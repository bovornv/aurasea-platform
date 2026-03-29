'use client';

import type { CompanyBusinessTrendHighlightRow } from '../../services/db/company-business-trends-highlight-service';

/** Violet accent — matches branch overview Business Trends; distinct from WW green / Opportunities blue / Watchlist orange. */
const BULLET_BG = '#7c3aed';
const BULLET_RING = '0 0 0 2px rgba(124, 58, 237, 0.28)';
const HEADLINE_COLOR = '#5b21b6';

export function CompanyBusinessTrendSummary({
  row,
  loading,
  locale,
}: {
  row: CompanyBusinessTrendHighlightRow | null;
  loading: boolean;
  locale: string;
}) {
  const th = locale === 'th';
  const normalize = (s: string | null | undefined): string =>
    (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

  const headlineForRow = (r: CompanyBusinessTrendHighlightRow): string => {
    const title = (r.trend_text ?? '').trim() || '—';
    const branchName = (r.branch_name ?? '').trim();
    if (!branchName || normalize(title).includes(normalize(branchName))) return title;
    return `${title} — ${branchName}`;
  };

  if (loading) {
    return <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>{th ? 'กำลังโหลด…' : 'Loading…'}</p>;
  }

  if (!row || (!(row.trend_text ?? '').trim() && !(row.read_text ?? '').trim() && !(row.meaning_text ?? '').trim())) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
        {th ? 'ยังไม่มีแนวโน้มจากสาขาในช่วงนี้' : 'No branch trend snapshot available yet'}
      </p>
    );
  }

  const headline = headlineForRow(row);

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
      <li
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
            background: BULLET_BG,
            boxShadow: BULLET_RING,
          }}
        />
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ color: HEADLINE_COLOR, fontWeight: 700 }}>{headline}</span>
          {row.read_text?.trim() ? (
            <span style={{ color: '#64748b', fontWeight: 500 }}>{row.read_text.trim()}</span>
          ) : null}
          {row.meaning_text?.trim() ? (
            <span style={{ color: '#64748b', fontWeight: 500 }}>{row.meaning_text.trim()}</span>
          ) : null}
        </span>
      </li>
    </ul>
  );
}
