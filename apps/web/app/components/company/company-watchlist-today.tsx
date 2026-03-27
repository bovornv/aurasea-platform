'use client';

import type { WatchlistTodayRow } from '../../services/db/watchlist-today-service';

function normKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().slice(0, 80);
}

interface Props {
  rows: WatchlistTodayRow[];
  locale: string;
  loading?: boolean;
  organizationId?: string | null;
}

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isWeakWatchlistText(...parts: Array<string | null | undefined>): boolean {
  const n = normalize(parts.filter(Boolean).join(' | '));
  if (!n) return true;
  return (
    n.includes('no early warning signals detected') ||
    n.includes('no meaningful watchlist signals detected today') ||
    n.includes('business stable today') ||
    n.includes('operations stable today') ||
    n.includes('no urgent priority issues detected')
  );
}

function toDisplay(row: WatchlistTodayRow): { title: string; detail: string } {
  const title = (row.title ?? '').trim();
  const warning = (row.warning_text ?? '').trim();
  const desc = (row.description ?? '').trim();
  const nDesc = normalize(desc);
  const nWarning = normalize(warning);
  let detail = '';
  if (nDesc && nWarning) {
    if (nDesc === nWarning || nDesc.includes(nWarning)) detail = desc;
    else if (nWarning.includes(nDesc)) detail = warning;
    else detail = desc;
  } else {
    detail = desc || warning;
  }
  if (title && normalize(detail).startsWith(`${normalize(title)} -`)) {
    detail = detail.slice(title.length + 3).trim();
  }
  if (normalize(detail) === normalize(title)) detail = '';
  return { title: title || (detail || '—'), detail };
}

function toDateKey(date: string | null | undefined): string {
  const d = (date ?? '').trim();
  return d.length > 0 ? d.slice(0, 10) : '';
}

function toSortNum(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

export function CompanyWatchlistToday({ rows, locale, loading, organizationId = null }: Props) {
  const th = locale === 'th';
  const meaningful = rows.filter((r) => !isWeakWatchlistText(r.title, r.description, r.warning_text));
  const sortedMeaningful = [...meaningful].sort((a, b) => {
    const dateCmp = toDateKey(b.metric_date).localeCompare(toDateKey(a.metric_date));
    if (dateCmp !== 0) return dateCmp;
    return toSortNum(b.sort_score) - toSortNum(a.sort_score);
  });
  const latestPerBranch = new Map<string, WatchlistTodayRow>();
  for (const row of sortedMeaningful) {
    const key = (row.branch_id ?? '').trim();
    if (!key || latestPerBranch.has(key)) continue;
    latestPerBranch.set(key, row);
  }
  const selectedRows = Array.from(latestPerBranch.values()).slice(0, 3);
  const weakCount = Math.max(0, rows.length - meaningful.length);
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';
  const fallback = th ? 'ยังไม่พบสัญญาณเตือนที่มีนัยสำคัญในวันนี้' : 'No meaningful watchlist signals detected today';

  if (loading) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>;
  }

  if (process.env.NODE_ENV === 'development') {
    const shown = selectedRows.map(toDisplay);
    const latestMetricDate =
      rows
        .map((r) => (r.metric_date ?? '').trim())
        .find((d) => d.length > 0) ?? null;
    console.log('[watchlist-source]', {
      page_context: 'company',
      organization_id: organizationId,
      relation_name_queried: 'watchlist_today_v_next',
      total_rows_returned: rows.length,
      latest_metric_date: latestMetricDate,
      meaningful_rows_count: meaningful.length,
      weak_rows_count: weakCount,
      selected_rows_after_latest_per_branch_filter: selectedRows.map((r) => ({
        branch_id: r.branch_id,
        metric_date: r.metric_date,
        title: r.title,
        detail: r.description || r.warning_text || null,
      })),
      fallback_used: selectedRows.length === 0,
      final_title_shown: shown.map((x) => x.title).filter(Boolean).slice(0, 3),
      final_detail_shown: shown.map((x) => x.detail).filter(Boolean).slice(0, 3),
      selected_title: shown[0]?.title ?? null,
      selected_detail: shown[0]?.detail ?? null,
    });
  }

  if (selectedRows.length === 0) {
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
      {selectedRows.map((row) => {
        const parts = toDisplay(row);
        const key = `wl-${row.branch_id || 'org'}-${row.metric_date ?? 'd'}-${normKey(row.warning_text || row.title)}`;
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
                background: '#f59e0b',
                boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.25)',
              }}
            />
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#78350f', fontWeight: 700 }}>{parts.title}</span>
              {parts.detail ? <span style={{ color: '#64748b', fontWeight: 500 }}>{parts.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

