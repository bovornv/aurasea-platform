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

/** Bold headline: title — branch_name (branch omitted if empty or already in title). Body: watchlist_text, else description. */
function watchlistHeadline(titleRaw: string, branchName: string): string {
  const t = (titleRaw ?? '').trim() || '—';
  const b = (branchName ?? '').trim();
  if (!b) return t;
  const nt = normalize(t);
  const nb = normalize(b);
  if (nt.includes(nb)) return t;
  return `${t} — ${b}`;
}

function toWatchlistParts(row: WatchlistTodayRow): { headline: string; body: string } {
  const title = (row.title ?? '').trim() || '—';
  const branchName = (row.branch_name ?? '').trim();
  const headline = watchlistHeadline(title, branchName);
  const wit = (row.watchlist_text ?? '').trim();
  const desc = (row.description ?? '').trim();
  let body = wit || desc;
  if (body && normalize(body) === normalize(headline)) body = '';
  return { headline, body };
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
  const meaningful = rows.filter(
    (r) => !isWeakWatchlistText(r.title, r.description, r.watchlist_text),
  );
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
    const shown = selectedRows.map(toWatchlistParts);
    const latestMetricDate =
      rows
        .map((r) => (r.metric_date ?? '').trim())
        .find((d) => d.length > 0) ?? null;
    console.log('[watchlist-source]', {
      page_context: 'company',
      organization_id: organizationId,
      relation_name_queried: 'watchlist_today',
      total_rows_returned: rows.length,
      latest_metric_date: latestMetricDate,
      meaningful_rows_count: meaningful.length,
      weak_rows_count: weakCount,
      selected_rows_after_latest_per_branch_filter: selectedRows.map((r) => ({
        branch_id: r.branch_id,
        metric_date: r.metric_date,
        title: r.title,
        branch_name: r.branch_name || null,
        watchlist_text: r.watchlist_text || null,
        description: r.description || null,
      })),
      fallback_used: selectedRows.length === 0,
      final_headline_shown: shown.map((x) => x.headline).filter(Boolean).slice(0, 3),
      final_body_shown: shown.map((x) => x.body).filter(Boolean).slice(0, 3),
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
        const parts = toWatchlistParts(row);
        const branchName = (row.branch_name ?? '').trim();
        const key = `wl-${row.branch_id || 'org'}-${row.metric_date ?? 'd'}-${normKey(row.title)}`;
        if (process.env.NODE_ENV === 'development') {
          console.log('[watchlist-company-row-render]', {
            organization_id: organizationId,
            branch_id: row.branch_id,
            branch_name: branchName || null,
            final_headline_shown: parts.headline || null,
            final_body_shown: parts.body || null,
          });
        }
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
              <span style={{ color: '#78350f', fontWeight: 700 }}>{parts.headline}</span>
              {parts.body ? (
                <span style={{ color: '#64748b', fontWeight: 500 }}>{parts.body}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

