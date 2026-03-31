'use client';

import { useMemo, type CSSProperties } from 'react';
import type { CompanyLatestBusinessStatusV3Row } from '../../services/db/company-latest-business-status-v3-service';
import { formatCurrency } from '../../utils/formatting';
import type { CompanyStatusSummaryRow } from '../../services/db/company-status-summary-service';

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

const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px', minWidth: 640 };
const thBase: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #e5e7eb', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', background: '#fff' };
const tdBase: CSSProperties = { padding: '10px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', verticalAlign: 'middle', background: '#fff' };
const stickyHealthTh: CSSProperties = { ...thBase, position: 'sticky', left: 0, zIndex: 4, textAlign: 'left', minWidth: STICKY_HEALTH_W, maxWidth: STICKY_HEALTH_W, width: STICKY_HEALTH_W, boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.12)' };
const stickyHealthTd: CSSProperties = { ...tdBase, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', minWidth: STICKY_HEALTH_W, maxWidth: STICKY_HEALTH_W, width: STICKY_HEALTH_W, boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.08)' };
const stickyBranchTh: CSSProperties = { ...thBase, position: 'sticky', left: STICKY_HEALTH_W, zIndex: 4, textAlign: 'left', minWidth: 140, boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.12)' };
const stickyBranchTd: CSSProperties = { ...tdBase, position: 'sticky', left: STICKY_HEALTH_W, zIndex: 2, textAlign: 'left', minWidth: 140, maxWidth: 220, boxShadow: '4px 0 8px -4px rgba(15, 23, 42, 0.08)' };
const thNum: CSSProperties = { ...thBase, textAlign: 'right' };
const tdNum: CSSProperties = { ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const thArrow: CSSProperties = { ...thBase, textAlign: 'center' };
const tdArrow: CSSProperties = { ...tdBase, textAlign: 'center' };

function numLocale(locale: string): string { return locale === 'th' ? 'th-TH' : 'en-US'; }
function missingLabel(locale: string): string { return locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'; }

function fmtInt(n: number | null | undefined, locale: string): string | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n)).toLocaleString(numLocale(locale));
}

function fmtMoney(n: number | null | undefined, locale: string): string | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `฿${formatCurrency(Math.round(Number(n)), numLocale(locale))}`;
}

function fmtPct(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Math.round(Number(n))}%`;
}

function CellNum({ value, locale }: { value: number | null; locale: string }) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  return <span>{Math.round(value).toLocaleString(numLocale(locale))}</span>;
}

function daysSinceMetricDate(metricDate: string | null): number | null {
  if (!metricDate?.trim()) return null;
  const ymd = metricDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  let metric: Date;
  if (ymd) metric = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  else {
    const d = new Date(metricDate);
    if (isNaN(d.getTime())) return null;
    metric = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t0.getTime() - metric.getTime()) / 86400000);
  return Math.max(0, diff);
}

function branchFreshnessLine(row: CompanyLatestBusinessStatusV3Row, locale: string): { text: string; stale: boolean } | null {
  const days = daysSinceMetricDate(row.metric_date);
  if (days == null || isNaN(days)) return null;
  const d = Math.floor(days);
  const th = locale === 'th';
  if (d === 0) return { text: th ? 'อัปเดตล่าสุด: วันนี้' : 'Last updated: Today', stale: false };
  if (d === 1) return { text: th ? 'อัปเดตล่าสุด: เมื่อวาน' : 'Last updated: Yesterday', stale: false };
  return { text: th ? `อัปเดตล่าสุด: ${d} วันก่อน` : `Last updated: ${d} days ago`, stale: true };
}

function BranchNameCell({ row, locale }: { row: CompanyLatestBusinessStatusV3Row; locale: string }) {
  const line = branchFreshnessLine(row, locale);
  return (
    <div>
      <div>{row.branch_name}</div>
      {line ? <div style={{ fontSize: '12px', marginTop: '2px', lineHeight: 1.35, color: line.stale ? '#c2410c' : '#6b7280' }}>{line.text}</div> : null}
    </div>
  );
}

function SymbolCell({ symbol, locale }: { symbol: string | null; locale: string }) {
  const fb = missingLabel(locale);
  const s = (symbol ?? '').trim();
  if (!s) return <span style={{ color: '#9ca3af', fontWeight: 500 }}>{fb}</span>;
  const color =
    s === '↑' || s === '▲' ? '#059669'
    : s === '↓' || s === '▼' ? '#dc2626'
    : s === '→' || s === '—' ? '#64748b'
    : '#0f172a';
  return <span style={{ color, fontWeight: 700, fontSize: '16px', lineHeight: 1 }}>{s}</span>;
}

function CellMoney({ value, locale }: { value: number | null; locale: string }) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  return <span>{formatCurrency(value, numLocale(locale))}</span>;
}

function CellPercent({ value, locale, suffix = '%' }: { value: number | null; locale: string; suffix?: string }) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  return <span>{`${Math.round(value)}${suffix}`}</span>;
}

function CellInt({ value, locale }: { value: number | null; locale: string }) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  return <span>{Math.round(value).toLocaleString(numLocale(locale))}</span>;
}

interface Props { rows: CompanyLatestBusinessStatusV3Row[]; summary?: CompanyStatusSummaryRow | null; locale?: string; }

export function CompanyBusinessStatusTables({ rows, summary = null, locale = 'th' }: Props) {
  const { accommodationRows, fnbRows } = useMemo(() => {
    const acc = rows.filter((r) => r.business_type === 'accommodation');
    const fnb = rows.filter((r) => r.business_type === 'fnb');
    const byHealthThenName = (a: CompanyLatestBusinessStatusV3Row, b: CompanyLatestBusinessStatusV3Row) => {
      const ah = a.health_score;
      const bh = b.health_score;
      if (ah == null && bh != null) return 1;
      if (ah != null && bh == null) return -1;
      if (ah != null && bh != null && ah !== bh) return bh - ah; // desc
      return String(a.branch_name ?? '').localeCompare(String(b.branch_name ?? ''));
    };
    acc.sort(byHealthThenName);
    fnb.sort(byHealthThenName);
    return { accommodationRows: acc, fnbRows: fnb };
  }, [rows]);

  const isTh = locale === 'th';
  const subTitle = (label: string) => <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '1rem 0 0.5rem' }}>{label}</h3>;
  const branchHeader = isTh ? 'สาขา' : 'Branch name';
  const emptyAcc = isTh ? 'ไม่มีข้อมูลที่พัก' : 'No accommodation rows.';
  const emptyFnb = isTh ? 'ไม่มีข้อมูล F&B' : 'No F&B rows.';
  const summaryLabel = isTh ? 'สรุประดับบริษัท' : 'Company summary';
  const dash = '—';

  return (
    <div>
      {/* Company summary block (no freshness line here) */}
      {summary ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '12px 14px',
            background: '#ffffff',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.03em', textTransform: 'uppercase' as const }}>
              {summaryLabel}
            </div>
          </div>

          <div
            style={{
              marginTop: 8,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
              gap: 10,
              alignItems: 'baseline',
            }}
          >
            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {isTh ? 'Revenue total' : 'Revenue total'}:{' '}
              <span style={{ fontWeight: 800 }}>
                {fmtMoney(summary.revenue_agg, locale) ?? dash}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {isTh ? 'Branches updated' : 'Branches updated'}:{' '}
              <span style={{ fontWeight: 800 }}>
                {(fmtInt(summary.updated_branches_count, locale) ?? dash)}/{(fmtInt(summary.branches_count, locale) ?? dash)}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {isTh ? 'Rooms/Occupancy' : 'Rooms/Occupancy'}:{' '}
              <span style={{ fontWeight: 800 }}>
                {(fmtInt(summary.rooms_sold_agg, locale) ?? dash)}/{(fmtInt(summary.rooms_available_agg, locale) ?? dash)}
                {' '}
                <span style={{ color: '#64748b', fontWeight: 700 }}>
                  ({fmtPct(summary.occupancy_rate_weighted) ?? dash})
                </span>
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {isTh ? 'Customers/Avg ticket' : 'Customers/Avg ticket'}:{' '}
              <span style={{ fontWeight: 800 }}>
                {fmtInt(summary.customers_agg, locale) ?? dash}{' '}
                <span style={{ color: '#64748b', fontWeight: 700 }}>
                  ({fmtMoney(summary.avg_ticket_weighted, locale) ?? dash})
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {subTitle(isTh ? 'ที่พัก' : 'Accommodation')}
      {accommodationRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{emptyAcc}</p>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.25rem' }}>
          <table style={tableStyle}>
            <thead><tr><th style={stickyHealthTh}>{isTh ? 'สุขภาพ' : 'Health'}</th><th style={stickyBranchTh}>{branchHeader}</th><th style={thNum}>Revenue</th><th style={thNum}>Occupancy</th><th style={thNum}>Rooms</th><th style={thNum}>ADR</th><th style={thNum}>RevPAR</th><th style={thArrow}>{isTh ? 'กำไร' : 'Profitability'}</th></tr></thead>
            <tbody>
              {accommodationRows.map((r) => (
                <tr key={`${r.branch_id}-accommodation`}>
                  <td style={stickyHealthTd}><HealthBadge score={r.health_score} /></td>
                  <td style={stickyBranchTd}><BranchNameCell row={r} locale={locale} /></td>
                  <td style={tdNum}><CellMoney value={r.revenue} locale={locale} /></td>
                  <td style={tdNum}><CellPercent value={r.occupancy_rate} locale={locale} suffix="" /></td>
                  <td style={tdNum}><span>{`${Math.round(r.rooms_sold ?? 0)}/${Math.round(r.rooms_available ?? 0)}`}</span></td>
                  <td style={tdNum}><CellMoney value={r.adr} locale={locale} /></td>
                  <td style={tdNum}><CellMoney value={r.revpar} locale={locale} /></td>
                  <td style={tdArrow}><SymbolCell symbol={r.profitability_symbol} locale={locale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTitle('F&B')}
      {fnbRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{emptyFnb}</p>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={tableStyle}>
            <thead><tr><th style={stickyHealthTh}>{isTh ? 'สุขภาพ' : 'Health'}</th><th style={stickyBranchTh}>{branchHeader}</th><th style={thNum}>Revenue</th><th style={thNum}>Customers</th><th style={thNum}>Avg ticket</th><th style={thNum}>Avg Cost</th><th style={thArrow}>{isTh ? 'มาร์จิ้น' : 'Margin'}</th></tr></thead>
            <tbody>
              {fnbRows.map((r) => (
                <tr key={`${r.branch_id}-fnb`}>
                  <td style={stickyHealthTd}><HealthBadge score={r.health_score} /></td>
                  <td style={stickyBranchTd}><BranchNameCell row={r} locale={locale} /></td>
                  <td style={tdNum}><CellMoney value={r.revenue} locale={locale} /></td>
                  <td style={tdNum}><CellInt value={r.customers} locale={locale} /></td>
                  <td style={tdNum}><CellMoney value={r.avg_ticket} locale={locale} /></td>
                  <td style={tdNum}><CellMoney value={r.avg_cost} locale={locale} /></td>
                  <td style={tdArrow}><SymbolCell symbol={r.margin_symbol} locale={locale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

