'use client';

import {
  dedupeWhatsWorkingRows,
  isWeakWhatsWorkingText,
  selectLatestMeaningfulWhatsWorkingPerBranch,
  type WhatsWorkingTodayRow,
} from '../../services/db/whats-working-today-service';

interface Props {
  rows: WhatsWorkingTodayRow[];
  locale: string;
  loading?: boolean;
  organizationId?: string | null;
}

export function CompanyWhatsWorkingToday({ rows, locale, loading, organizationId = null }: Props) {
  const th = locale === 'th';
  const normalize = (s: string | null | undefined): string =>
    (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const toParts = (row: WhatsWorkingTodayRow): { headline: string; body: string } => {
    const title = (row.title ?? '').trim() || '—';
    const branchName = (row.branch_name ?? '').trim();
    const head =
      !branchName || normalize(title).includes(normalize(branchName))
        ? title
        : `${title} — ${branchName}`;
    const wit = (row.whats_working_text ?? '').trim();
    const desc = (row.description ?? '').trim();
    let body = wit || desc;
    if (body && normalize(body) === normalize(head)) body = '';
    return { headline: head, body };
  };
  const deduped = dedupeWhatsWorkingRows(rows);
  const selectedRows = selectLatestMeaningfulWhatsWorkingPerBranch(deduped);
  const visible = selectedRows.slice(0, 3);

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

  if (process.env.NODE_ENV === 'development') {
    const sortedAll = [...deduped].sort((a, b) => {
      const da = (a.metric_date ?? '').slice(0, 10);
      const db = (b.metric_date ?? '').slice(0, 10);
      const dc = db.localeCompare(da);
      if (dc !== 0) return dc;
      return (b.sort_score ?? Number.NEGATIVE_INFINITY) - (a.sort_score ?? Number.NEGATIVE_INFINITY);
    });
    const latest = sortedAll[0] ?? null;
    console.log('[whats-working-source]', {
      page_context: 'company',
      organization_id: organizationId,
      source_relation: 'whats_working_today',
      rows_returned: rows.length,
      latest_row_title: latest?.title ?? null,
      meaningful_rows_count: deduped.filter(
        (r) => !isWeakWhatsWorkingText(r.title, r.description, r.whats_working_text),
      ).length,
      selected_final_row: visible.slice(0, 3).map((r) => {
        const parts = toParts(r);
        return {
          branch_id: r.branch_id,
          selected_title: r.title ?? null,
          selected_description: r.description ?? null,
          final_headline_shown: parts.headline,
          final_body_shown: parts.body || null,
        };
      }),
      fallback_used: visible.some((r) =>
        isWeakWhatsWorkingText(r.title, r.description, r.whats_working_text),
      ),
    });
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
      {visible.map((row) => {
        const parts = toParts(row);
        const key = `w-${row.branch_id}-${row.metric_date ?? 'd'}-${normalize(parts.headline).slice(0, 80)}`;
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
                background: '#22c55e',
                boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)',
              }}
            />
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#166534', fontWeight: 700 }}>{parts.headline}</span>
              {parts.body ? <span style={{ color: '#64748b', fontWeight: 500 }}>{parts.body}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
