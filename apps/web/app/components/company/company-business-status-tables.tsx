'use client';

import { useMemo, type CSSProperties } from 'react';
import type { CompanyLatestBusinessStatusV2Row } from '../../services/db/company-latest-business-status-v2-service';
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

function numLocale(locale: string): string {
  return locale === 'th' ? 'th-TH' : 'en-US';
}

function missingLabel(locale: string): string {
  return locale === 'th' ? 'ไม่มีข้อมูล' : 'No data';
}

function daysSinceMetricDate(metricDate: string | null): number | null {
  if (!metricDate?.trim()) return null;
  const ymd = metricDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  let metric: Date;
  if (ymd) {
    metric = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  } else {
    const d = new Date(metricDate);
    if (isNaN(d.getTime())) return null;
    metric = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t0.getTime() - metric.getTime()) / 86400000);
  return Math.max(0, diff);
}

function branchFreshnessLine(
  row: CompanyLatestBusinessStatusV2Row,
  locale: string
): { text: string; stale: boolean } | null {
  const days = daysSinceMetricDate(row.metric_date);
  if (days == null || isNaN(days)) return null;
  const d = Math.floor(days);
  const th = locale === 'th';
  if (d === 0) return { text: th ? 'อัปเดตล่าสุด: วันนี้' : 'Last updated: Today', stale: false };
  if (d === 1) return { text: th ? 'อัปเดตล่าสุด: เมื่อวาน' : 'Last updated: Yesterday', stale: false };
  return {
    text: th ? `อัปเดตล่าสุด: ${d} วันก่อน` : `Last updated: ${d} days ago`,
    stale: true,
  };
}

function BranchNameCell({ row, locale }: { row: CompanyLatestBusinessStatusV2Row; locale: string }) {
  const line = branchFreshnessLine(row, locale);
  return (
    <div>
      <div>{row.branch_name}</div>
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

function ProfitabilityLabelCell({ label, locale }: { label: string | null; locale: string }) {
  const fb = missingLabel(locale);
  if (label == null || String(label).trim() === '') {
    return <span style={{ color: '#9ca3af', fontWeight: 500 }}>{fb}</span>;
  }
  const t = String(label).trim();
  let color = '#0f172a';
  if (/^up$/i.test(t)) color = '#059669';
  else if (/^down$/i.test(t)) color = '#dc2626';
  else if (/^flat$/i.test(t)) color = '#64748b';
  return (
    <span style={{ color, fontWeight: 600 }} title={t}>
      {t}
    </span>
  );
}

function MarginPctCell({ marginPct, locale }: { marginPct: number | null; locale: string }) {
  const fb = missingLabel(locale);
  if (marginPct == null || !Number.isFinite(marginPct)) {
    return <span style={{ color: '#9ca3af', fontWeight: 500 }}>{fb}</span>;
  }
  const n = Math.round(marginPct * 10) / 10;
  return <span style={{ fontWeight: 600 }}>{`${n}%`}</span>;
}

function CellMoney({
  value,
  locale,
}: {
  value: number | null;
  locale: string;
}) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  }
  return <span>฿{formatCurrency(value, numLocale(locale))}</span>;
}

function CellPercent({
  value,
  locale,
  suffix = '%',
}: {
  value: number | null;
  locale: string;
  suffix?: string;
}) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  }
  return <span>{`${Math.round(value)}${suffix}`}</span>;
}

function CellInt({ value, locale }: { value: number | null; locale: string }) {
  const fb = missingLabel(locale);
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: '#9ca3af' }}>{fb}</span>;
  }
  return <span>{Math.round(value).toLocaleString(numLocale(locale))}</span>;
}

interface Props {
  /** From `company_latest_business_status_v2` only. */
  rows: CompanyLatestBusinessStatusV2Row[];
  locale?: string;
}

export function CompanyBusinessStatusTables({ rows, locale = 'th' }: Props) {
  const { accommodationRows, fnbRows } = useMemo(() => {
    const acc = rows.filter((r) => r.business_type === 'accommodation');
    const fnb = rows.filter((r) => r.business_type === 'fnb');
    const byHealth = (a: CompanyLatestBusinessStatusV2Row, b: CompanyLatestBusinessStatusV2Row) => {
      const ha = a.health_score ?? 999;
      const hb = b.health_score ?? 999;
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
  const emptyAcc = isTh ? 'ไม่มีข้อมูลที่พัก' : 'No accommodation rows.';
  const emptyFnb = isTh ? 'ไม่มีข้อมูล F&B' : 'No F&B rows.';

  return (
    <div>
      {subTitle(isTh ? 'ที่พัก' : 'Accommodation')}
      {accommodationRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{emptyAcc}</p>
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
                <tr key={`${r.branch_id}-accommodation`}>
                  <td style={stickyHealthTd}>
                    <HealthBadge score={r.health_score} />
                  </td>
                  <td style={stickyBranchTd}>
                    <BranchNameCell row={r} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellMoney value={r.revenue_thb} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellPercent value={r.occupancy_pct} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellMoney value={r.adr_thb} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellMoney value={r.revpar_thb} locale={locale} />
                  </td>
                  <td style={tdArrow}>
                    <ProfitabilityLabelCell label={r.profitability_label} locale={locale} />
                  </td>
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
                <tr key={`${r.branch_id}-fnb`}>
                  <td style={stickyHealthTd}>
                    <HealthBadge score={r.health_score} />
                  </td>
                  <td style={stickyBranchTd}>
                    <BranchNameCell row={r} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellMoney value={r.revenue_thb} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellInt value={r.customers} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellMoney value={r.avg_ticket_thb} locale={locale} />
                  </td>
                  <td style={tdNum}>
                    <CellMoney value={r.avg_cost_thb} locale={locale} />
                  </td>
                  <td style={tdArrow}>
                    <MarginPctCell marginPct={r.margin_pct} locale={locale} />
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
