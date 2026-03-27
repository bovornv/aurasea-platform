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
  const toDisplay = (row: WhatsWorkingTodayRow): { title: string; detail: string } => {
    const title =
      (row.title ?? '').trim() ||
      (row.highlight_text ?? '').trim() ||
      (row.description ?? '').trim() ||
      '—';
    const detail = (row.description ?? '').trim() || (row.highlight_text ?? '').trim();
    if (detail && normalize(detail) === normalize(title)) return { title, detail: '' };
    return { title, detail };
  };
  const withBranch = (title: string, branchName: string): string => {
    const t = title.trim();
    const b = branchName.trim();
    if (!b) return t;
    const nt = normalize(t);
    const nb = normalize(b);
    if (nt.includes(nb)) return t;
    return `${t} — ${b}`;
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
      source_relation: 'whats_working_today_v_next',
      rows_returned: rows.length,
      latest_row_title: latest?.title ?? null,
      meaningful_rows_count: deduped.filter((r) => !isWeakWhatsWorkingText(r.title, r.description, r.highlight_text)).length,
      selected_final_row: visible.slice(0, 3).map((r) => {
        const parts = toDisplay(r);
        return {
          branch_id: r.branch_id,
          selected_title: r.title ?? null,
          selected_description: r.description ?? null,
          selected_highlight_text: r.highlight_text ?? null,
          final_title_shown: withBranch(parts.title, (r.branch_name ?? '').trim()),
          final_detail_shown: parts.detail || null,
        };
      }),
      fallback_used: visible.some((r) => isWeakWhatsWorkingText(r.title, r.description, r.highlight_text)),
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
        const parts = toDisplay(row);
        const finalTitle = withBranch(parts.title, (row.branch_name ?? '').trim());
        const key = `w-${row.branch_id}-${row.metric_date ?? 'd'}-${normalize(finalTitle).slice(0, 80)}`;
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
              <span style={{ color: '#166534', fontWeight: 700 }}>{finalTitle}</span>
              {parts.detail ? <span style={{ color: '#64748b', fontWeight: 500 }}>{parts.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
