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

function CellMoneyBaht({ value, locale }: { value: number | null; locale: string }) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  return <span>฿{formatCurrency(value, numLocale(locale))}</span>;
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
    <div className="lbs">
      {/* Company summary strip (lightweight, not competing with branch lists) */}
      {summary ? (
        <div className="summaryStrip" aria-label={summaryLabel}>
          <div className="summaryItem">
            <div className="k">{isTh ? 'Revenue total' : 'Revenue total'}</div>
            <div className="v">{fmtMoney(summary.revenue_agg, locale) ?? dash}</div>
          </div>
          <div className="summaryItem">
            <div className="k">{isTh ? 'Branches updated' : 'Branches updated'}</div>
            <div className="v">
              {(fmtInt(summary.updated_branches_count, locale) ?? dash)}/{(fmtInt(summary.branches_count, locale) ?? dash)}
            </div>
          </div>
        </div>
      ) : null}

      {subTitle(isTh ? 'ที่พัก' : 'Accommodation')}
      {accommodationRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{emptyAcc}</p>
      ) : (
        <>
          {/* Desktop/wide: table */}
          <div className="tableWrap">
            <table style={tableStyle}>
              <thead><tr><th style={stickyHealthTh}>{isTh ? 'สุขภาพ' : 'Health'}</th><th style={stickyBranchTh}>{branchHeader}</th><th style={thNum}>Revenue</th><th style={thNum}>Occupancy</th><th style={thNum}>Rooms</th><th style={thNum}>ADR</th><th style={thNum}>RevPAR</th><th style={thArrow}>{isTh ? 'กำไร' : 'Profitability'}</th></tr></thead>
              <tbody>
                {accommodationRows.map((r) => (
                  <tr key={`${r.branch_id}-accommodation`}>
                    <td style={stickyHealthTd}><HealthBadge score={r.health_score} /></td>
                    <td style={stickyBranchTd}><BranchNameCell row={r} locale={locale} /></td>
                    <td style={tdNum}><CellMoneyBaht value={r.revenue} locale={locale} /></td>
                    <td style={tdNum}><CellPercent value={r.occupancy_rate} locale={locale} /></td>
                    <td style={tdNum}><span>{`${Math.round(r.rooms_sold ?? 0)}/${Math.round(r.rooms_available ?? 0)}`}</span></td>
                    <td style={tdNum}><CellMoneyBaht value={r.adr} locale={locale} /></td>
                    <td style={tdNum}><CellMoneyBaht value={r.revpar} locale={locale} /></td>
                    <td style={tdArrow}><SymbolCell symbol={r.profitability_symbol} locale={locale} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile/narrow: stacked cards */}
          <div className="cards">
            {accommodationRows.map((r) => (
              <div className="card" key={`${r.branch_id}-accommodation-card`}>
                <div className="cardTop">
                  <div className="cardName">{r.branch_name}</div>
                  <div className="cardHealth"><HealthBadge score={r.health_score} /></div>
                </div>
                <div className="cardGrid">
                  <div><div className="k">Revenue</div><div className="v">{fmtMoney(r.revenue, locale) ?? dash}</div></div>
                  <div><div className="k">Occupancy</div><div className="v">{fmtPct(r.occupancy_rate) ?? dash}</div></div>
                  <div><div className="k">Rooms</div><div className="v">{`${fmtInt(r.rooms_sold, locale) ?? dash}/${fmtInt(r.rooms_available, locale) ?? dash}`}</div></div>
                  <div><div className="k">ADR</div><div className="v">{fmtMoney(r.adr, locale) ?? dash}</div></div>
                  <div><div className="k">RevPAR</div><div className="v">{fmtMoney(r.revpar, locale) ?? dash}</div></div>
                  <div><div className="k">{isTh ? 'กำไร' : 'Profitability'}</div><div className="v"><SymbolCell symbol={r.profitability_symbol} locale={locale} /></div></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {subTitle('F&B')}
      {fnbRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{emptyFnb}</p>
      ) : (
        <>
          <div className="tableWrap">
            <table style={tableStyle}>
              <thead><tr><th style={stickyHealthTh}>{isTh ? 'สุขภาพ' : 'Health'}</th><th style={stickyBranchTh}>{branchHeader}</th><th style={thNum}>Revenue</th><th style={thNum}>Customers</th><th style={thNum}>Avg ticket</th><th style={thNum}>Avg Cost</th><th style={thArrow}>{isTh ? 'มาร์จิ้น' : 'Margin'}</th></tr></thead>
              <tbody>
                {fnbRows.map((r) => (
                  <tr key={`${r.branch_id}-fnb`}>
                    <td style={stickyHealthTd}><HealthBadge score={r.health_score} /></td>
                    <td style={stickyBranchTd}><BranchNameCell row={r} locale={locale} /></td>
                    <td style={tdNum}><CellMoneyBaht value={r.revenue} locale={locale} /></td>
                    <td style={tdNum}><CellInt value={r.customers} locale={locale} /></td>
                    <td style={tdNum}><CellMoneyBaht value={r.avg_ticket} locale={locale} /></td>
                    <td style={tdNum}><CellMoneyBaht value={r.avg_cost} locale={locale} /></td>
                    <td style={tdArrow}><SymbolCell symbol={r.margin_symbol} locale={locale} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cards">
            {fnbRows.map((r) => (
              <div className="card" key={`${r.branch_id}-fnb-card`}>
                <div className="cardTop">
                  <div className="cardName">{r.branch_name}</div>
                  <div className="cardHealth"><HealthBadge score={r.health_score} /></div>
                </div>
                <div className="cardGrid">
                  <div><div className="k">Revenue</div><div className="v">{fmtMoney(r.revenue, locale) ?? dash}</div></div>
                  <div><div className="k">Customers</div><div className="v">{fmtInt(r.customers, locale) ?? dash}</div></div>
                  <div><div className="k">Avg ticket</div><div className="v">{fmtMoney(r.avg_ticket, locale) ?? dash}</div></div>
                  <div><div className="k">Avg cost</div><div className="v">{fmtMoney(r.avg_cost, locale) ?? dash}</div></div>
                  <div><div className="k">{isTh ? 'มาร์จิ้น' : 'Margin'}</div><div className="v"><SymbolCell symbol={r.margin_symbol} locale={locale} /></div></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .summaryStrip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 2px 0 6px;
          padding: 2px 0 6px;
          border-bottom: 1px solid #f1f5f9;
        }
        .summaryItem {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .summaryItem .k {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .summaryItem .v {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .tableWrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 0.25rem; }
        .cards { display: none; }

        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px 12px;
          background: #fff;
          margin-bottom: 10px;
        }
        .cardTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .cardName {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 72vw;
        }
        .cardGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .cardGrid .k {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .cardGrid .v {
          margin-top: 2px;
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
        }

        /* Narrow / mobile: switch tables -> cards */
        @media (max-width: 860px) {
          .tableWrap { display: none; }
          .cards { display: block; }
          .summaryStrip { grid-template-columns: 1fr; }
        }

        /* Notepad-ish widths: keep summary compact */
        @media (max-width: 420px) {
          .cardGrid { grid-template-columns: 1fr; }
          .cardName { max-width: 62vw; }
        }
      `}</style>
    </div>
  );
}

