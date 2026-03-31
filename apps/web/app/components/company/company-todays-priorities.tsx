'use client';

import type { CSSProperties } from 'react';
import type { TodayPrioritiesRow } from '../../services/db/today-priorities-service';
import { PriorityItemBody } from '../priority/priority-item-body';

interface Props {
  rows: TodayPrioritiesRow[];
  locale: string;
  loading?: boolean;
}

function segmentOf(row: TodayPrioritiesRow): 'fix_first' | 'next_moves' | 'more' {
  const s = (row.priority_segment || '').toLowerCase();
  if (s === 'fix_first' || s === 'next_moves' || s === 'more') return s;
  const rk = row.rank ?? 99;
  if (rk === 1) return 'fix_first';
  if (rk >= 2 && rk <= 4) return 'next_moves';
  return 'more';
}

export function CompanyTodaysPriorities({ rows, locale, loading }: Props) {
  const th = locale === 'th';

  const title = th ? 'ลำดับความสำคัญวันนี้' : "Today's Priorities";
  const emptyMsg = th ? 'ทุกอย่างโอเค — ไม่มีลำดับความสำคัญวันนี้' : 'All good — no priorities today';
  const loadingMsg = th ? 'กำลังโหลด…' : 'Loading…';
  const actionFallback = th ? 'ดำเนินการตามสัญญาณ' : 'Take action on this signal';

  const fixFirst = rows.filter((r) => segmentOf(r) === 'fix_first');
  const nextMoves = rows.filter((r) => segmentOf(r) === 'next_moves');
  const more = rows.filter((r) => segmentOf(r) === 'more');

  const hFix = th ? 'แก้เรื่องนี้ก่อน' : 'Fix This First';
  const hNext = th ? 'ลำดับถัดไป' : 'Next Best Moves';
  const hMore = th ? 'เพิ่มเตือน' : 'Also on the radar';

  const sectionHeadStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: '10px',
    marginTop: '4px',
  };

  function renderRow(row: TodayPrioritiesRow, idx: number, keyPrefix: string) {
    const branch = row.branch_name?.trim() || row.branch_id || (th ? 'สาขา' : 'Branch');
    const rawTitle =
      row.title?.trim() ||
      row.short_title?.trim() ||
      `${(row.alert_type || 'alert').replace(/_/g, ' ')} — ${branch}`;
    const action = (row.description ?? row.action_text ?? '').trim() || actionFallback;
    const key = `${keyPrefix}-${row.branch_id}-${row.alert_type}-${idx}`;

    return (
      <li key={key}>
        <PriorityItemBody
          titleRaw={rawTitle}
          description={action}
          locale={locale}
          headlineFallback={branch}
        />
      </li>
    );
  }

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
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: '#475569',
          marginBottom: '16px',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{loadingMsg}</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{emptyMsg}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {fixFirst.length > 0 && (
            <section aria-label={hFix}>
              <div style={sectionHeadStyle}>
                <span aria-hidden style={{ marginRight: '6px' }}>
                  🔥
                </span>
                {hFix}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {fixFirst.map((row, idx) => renderRow(row, idx, 'ff'))}
              </ul>
            </section>
          )}
          {nextMoves.length > 0 && (
            <section aria-label={hNext}>
              <div style={{ ...sectionHeadStyle, marginTop: fixFirst.length ? 0 : undefined }}>
                <span aria-hidden style={{ marginRight: '6px' }}>
                  🧠
                </span>
                {hNext}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {nextMoves.map((row, idx) => renderRow(row, idx, 'nm'))}
              </ul>
            </section>
          )}
          {more.length > 0 && (
            <section aria-label={hMore}>
              <div style={sectionHeadStyle}>
                <span aria-hidden style={{ marginRight: '6px' }}>
                  📌
                </span>
                {hMore}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {more.map((row, idx) => renderRow(row, idx, 'mr'))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
