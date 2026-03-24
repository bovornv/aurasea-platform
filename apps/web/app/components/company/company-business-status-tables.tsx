'use client';

import { useMemo, type CSSProperties } from 'react';
import type { NormalizedBusinessRow } from '../../services/db/company-today-data-service';
import type { ProfitabilityTrend } from '../../services/db/latest-metrics-service';
import { formatCurrency } from '../../utils/formatting';

/** Sticky column offset: health badge column */
const STICKY_HEALTH_W = 84;

function healthBadgeStyle(score: number | null): { bg: string; fg: string } {
  if (score == null || isNaN(score)) return { bg: '#f3f4f6', fg: '#6b7280' };
  const n = Math.round(score);
  if (n <= 60) return { bg: '#fee2e2', fg: '#b91c1c' };
  if (n <= 80) return { bg: '#ffedd5', fg: '#c2410c' };
  return { bg: '#dcfce7', fg: '#15803d' };
}

function HealthBadge({ score }: { score: number | null }) {
  const { bg, fg } = healthBadgeStyle(score);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '2.5rem',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '13px',
        fontWeight: 700,
        background: bg,
        color: fg,
        lineHeight: 1.2,
      }}
    >
      {score != null && !isNaN(score) ? Math.round(score) : '—'}
    </span>
  );
}

function trendGlyph(t: ProfitabilityTrend | null): { glyph: string; color: string } | null {
  if (t === 'up') return { glyph: '↑', color: '#059669' };
  if (t === 'flat') return { glyph: '→', color: '#9ca3af' };
  if (t === 'down') return { glyph: '↓', color: '#dc2626' };
  return null;
}

function TrendOnlyCell({ trend }: { trend: ProfitabilityTrend | null }) {
  const g = trendGlyph(trend);
  if (!g) {
    return <span style={{ color: '#9ca3af', fontWeight: 600 }}>—</span>;
  }
  return (
    <span style={{ color: g.color, fontWeight: 600, fontSize: '16px', lineHeight: 1 }}>{g.glyph}</span>
  );
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontSize: '13px',
  minWidth: 640,
};

const thBase: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
  color: '#64748b',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  background: '#fff',
};

const tdBase: CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#0f172a',
  verticalAlign: 'middle',
  background: '#fff',
};

const stickyHealthTh: CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: 0,
  zIndex: 4,
  textAlign: 'left',
  minWidth: STICKY_HEALTH_W,
  maxWidth: STICKY_HEALTH_W,
  width: STICKY_HEALTH_W,
  boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.12)',
};

const stickyHealthTd: CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: 0,
  zIndex: 2,
  textAlign: 'left',
  minWidth: STICKY_HEALTH_W,
  maxWidth: STICKY_HEALTH_W,
  width: STICKY_HEALTH_W,
  boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.08)',
};

const stickyBranchTh: CSSProperties = {
  ...thBase,
  position: 'sticky',
  left: STICKY_HEALTH_W,
  zIndex: 4,
  textAlign: 'left',
  minWidth: 140,
  boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.12)',
};

const stickyBranchTd: CSSProperties = {
  ...tdBase,
  position: 'sticky',
  left: STICKY_HEALTH_W,
  zIndex: 2,
  textAlign: 'left',
  minWidth: 140,
  maxWidth: 220,
  boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.08)',
};

const thNum: CSSProperties = { ...thBase, textAlign: 'right' };
const tdNum: CSSProperties = { ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const thArrow: CSSProperties = { ...thBase, textAlign: 'center' };
const tdArrow: CSSProperties = { ...tdBase, textAlign: 'center' };

function branchFreshnessLine(
  row: NormalizedBusinessRow,
  locale: string
): { text: string; stale: boolean } | null {
  const days = row.daysSinceUpdate;
  if (days == null || isNaN(days)) return null;
  const d = Math.floor(Math.max(0, days));
  const th = locale === 'th';
  if (d === 0) return { text: th ? 'อัปเดตล่าสุด: วันนี้' : 'Last updated: Today', stale: false };
  if (d === 1) return { text: th ? 'อัปเดตล่าสุด: เมื่อวาน' : 'Last updated: Yesterday', stale: false };
  return {
    text: th ? `อัปเดตล่าสุด: ${d} วันก่อน` : `Last updated: ${d} days ago`,
    stale: true,
  };
}

function BranchNameCell({ row, locale }: { row: NormalizedBusinessRow; locale: string }) {
  const line = branchFreshnessLine(row, locale);
  return (
    <div>
      <div>{row.branchName}</div>
      {line ? (
        <div
          style={{
            fontSize: '12px',
            marginTop: '2px',
            lineHeight: 1.35,
            color: line.stale ? '#c2410c' : '#6b7280',
          }}
        >
          {line.text}
        </div>
      ) : null}
    </div>
  );
}

interface Props {
  /** From `branch_business_status_api` (normalized). */
  rows: NormalizedBusinessRow[];
  locale?: string;
}

export function CompanyBusinessStatusTables({ rows, locale = 'th' }: Props) {
  const { accommodationRows, fnbRows } = useMemo(() => {
    const acc = rows.filter((r) => r.branchType === 'accommodation');
    const fnb = rows.filter((r) => r.branchType === 'fnb');
    const byHealth = (a: NormalizedBusinessRow, b: NormalizedBusinessRow) => {
      const ha = a.healthScore ?? 999;
      const hb = b.healthScore ?? 999;
      return ha - hb;
    };
    acc.sort(byHealth);
    fnb.sort(byHealth);
    return { accommodationRows: acc, fnbRows: fnb };
  }, [rows]);

  const isTh = locale === 'th';
  const subTitle = (label: string) => (
    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '1rem 0 0.5rem' }}>{label}</h3>
  );

  const branchHeader = isTh ? 'สาขา' : 'Branch name';

  return (
    <div>
      {subTitle(isTh ? 'ที่พัก' : 'Accommodation')}
      {accommodationRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          {isTh
            ? 'ไม่มีแถวที่พักใน branch_business_status_api'
            : 'No accommodation branches in branch_business_status_api.'}
        </p>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            marginBottom: '0.25rem',
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={stickyHealthTh}>{isTh ? 'สุขภาพ' : 'Health'}</th>
                <th style={stickyBranchTh}>{branchHeader}</th>
                <th style={thNum}>Revenue (฿)</th>
                <th style={thNum}>Occupancy (%)</th>
                <th style={thNum}>ADR (฿)</th>
                <th style={thNum}>RevPAR (฿)</th>
                <th style={thArrow}>{isTh ? 'กำไร' : 'Profitability'}</th>
              </tr>
            </thead>
            <tbody>
              {accommodationRows.map((r) => (
                <tr key={`${r.branchId}-${r.branchType}`}>
                  <td style={stickyHealthTd}>
                    <HealthBadge score={r.healthScore} />
                  </td>
                  <td style={stickyBranchTd}>
                    <BranchNameCell row={r} locale={locale} />
                  </td>
                  <td style={tdNum}>฿{formatCurrency(r.revenueThb)}</td>
                  <td style={tdNum}>
                    {r.occupancyPct != null && Number.isFinite(r.occupancyPct)
                      ? `${Math.round(r.occupancyPct)}%`
                      : '—'}
                  </td>
                  <td style={tdNum}>
                    {r.adrThb != null && Number.isFinite(r.adrThb) ? `฿${formatCurrency(r.adrThb)}` : '—'}
                  </td>
                  <td style={tdNum}>
                    {r.revparThb != null && Number.isFinite(r.revparThb)
                      ? `฿${formatCurrency(r.revparThb)}`
                      : '—'}
                  </td>
                  <td style={tdArrow}>
                    <TrendOnlyCell trend={r.profitabilityTrend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTitle('F&B')}
      {fnbRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          {isTh
            ? 'ไม่มีแถว F&B ใน branch_business_status_api'
            : 'No F&B branches in branch_business_status_api.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={stickyHealthTh}>{isTh ? 'สุขภาพ' : 'Health'}</th>
                <th style={stickyBranchTh}>{branchHeader}</th>
                <th style={thNum}>Revenue (฿)</th>
                <th style={thNum}>Customers</th>
                <th style={thNum}>Avg ticket (฿)</th>
                <th style={thNum}>Avg Cost (฿)</th>
                <th style={thArrow}>{isTh ? 'มาร์จิ้น' : 'Margin'}</th>
              </tr>
            </thead>
            <tbody>
              {fnbRows.map((r) => (
                <tr key={`${r.branchId}-${r.branchType}`}>
                  <td style={stickyHealthTd}>
                    <HealthBadge score={r.healthScore} />
                  </td>
                  <td style={stickyBranchTd}>
                    <BranchNameCell row={r} locale={locale} />
                  </td>
                  <td style={tdNum}>฿{formatCurrency(r.revenueThb)}</td>
                  <td style={tdNum}>
                    {r.customers != null && Number.isFinite(r.customers)
                      ? formatCurrency(r.customers, 'en-US')
                      : '—'}
                  </td>
                  <td style={tdNum}>
                    {r.avgTicketThb != null && Number.isFinite(r.avgTicketThb)
                      ? `฿${formatCurrency(r.avgTicketThb)}`
                      : '—'}
                  </td>
                  <td style={tdNum}>
                    {r.avgDailyCostThb != null && Number.isFinite(r.avgDailyCostThb)
                      ? `฿${formatCurrency(r.avgDailyCostThb)}`
                      : '—'}
                  </td>
                  <td style={tdArrow}>
                    <TrendOnlyCell trend={r.marginTrend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
