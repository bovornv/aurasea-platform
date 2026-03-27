'use client';

import type { OpportunitiesTodayRow } from '../../services/db/opportunities-today-service';

function normKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().slice(0, 80);
}

interface Props {
  rows: OpportunitiesTodayRow[];
  locale: string;
  loading?: boolean;
  organizationId?: string | null;
}

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isGenericStableText(s: string | null | undefined): boolean {
  const n = normalize(s);
  if (!n) return true;
  return (
    n.includes('operations stable today') ||
    n.includes('no urgent priority issues detected') ||
    n.includes('ยังไม่มีโอกาสชัดเจนวันนี้')
  );
}

function deriveOpportunityParts(row: OpportunitiesTodayRow): { title: string; detail: string } {
  const title = (row.title ?? '').trim();
  const opportunity = (row.opportunity_text ?? '').trim();
  const description = (row.description ?? '').trim();
  const nOpp = normalize(opportunity);
  const nDesc = normalize(description);
  let detail = '';
  if (nOpp && nDesc) {
    if (nOpp === nDesc || nOpp.includes(nDesc)) detail = opportunity;
    else if (nDesc.includes(nOpp)) detail = description;
    else detail = opportunity;
  } else {
    detail = opportunity || description;
  }
  if (title && normalize(detail).startsWith(`${normalize(title)} -`)) {
    detail = detail.slice(title.length + 3).trim();
  }
  if (normalize(detail) === normalize(title)) detail = '';
  return { title: title || (detail || '—'), detail };
}

function withBranchInHeadline(title: string, branchName: string): string {
  const t = title.trim();
  const b = branchName.trim();
  if (!b) return t;
  if (!t) return b;
  const nt = normalize(t);
  const nb = normalize(b);
  if (nt.includes(nb)) return t;
  return `${t} — ${b}`;
}

export function CompanyOpportunitiesToday({ rows, locale, loading, organizationId = null }: Props) {
  const th = locale === 'th';
  const actionable = rows
    .filter((r) => !isGenericStableText(r.title) && !isGenericStableText(r.opportunity_text) && !isGenericStableText(r.description))
    .slice(0, 3);

  const emptyMsg = th ? 'ยังไม่มีโอกาสชัดเจนวันนี้' : 'No clear opportunities today';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';

  if (loading) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>;
  }
  if (actionable.length === 0) {
    return <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{emptyMsg}</p>;
  }

  if (process.env.NODE_ENV === 'development') {
    const selected = actionable.slice(0, 3).map((r) => {
      const parts = deriveOpportunityParts(r);
      const finalTitle = withBranchInHeadline(parts.title, (r.branch_name ?? '').trim());
      return {
        branch_id: r.branch_id,
        branch_name: r.branch_name ?? null,
        final_title_shown: finalTitle || null,
        final_detail_shown: parts.detail || null,
      };
    });
    console.log('[opportunities-source]', {
      page_context: 'company',
      organization_id: organizationId,
      source_used: 'company_dashboard_merged_opportunities',
      fallback_used: false,
      rows_returned: rows.length,
      actionable_rows_count: actionable.length,
      selected_rows_after_fallback: selected,
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
      {actionable.map((row) => {
        const parts = deriveOpportunityParts(row);
        const finalTitle = withBranchInHeadline(parts.title, (row.branch_name ?? '').trim());
        const key = `o-${row.branch_id}-${row.metric_date ?? 'd'}-${normKey(row.opportunity_text || row.title)}`;
        if (process.env.NODE_ENV === 'development') {
          console.log('[opportunities-company-row-render]', {
            organization_id: organizationId,
            branch_id: row.branch_id,
            branch_name: row.branch_name ?? null,
            final_title_shown: finalTitle || null,
            final_detail_shown: parts.detail || null,
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
                background: 'linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)',
                boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
              }}
            />
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#0c4a6e', fontWeight: 700 }}>{finalTitle}</span>
              {parts.detail ? <span style={{ color: '#64748b', fontWeight: 500 }}>{parts.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
