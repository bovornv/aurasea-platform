'use client';

import { useMemo, type CSSProperties } from 'react';
import type { NormalizedBusinessRow } from '../../services/db/company-today-data-service';
import { formatCurrency } from '../../utils/formatting';

function healthColor(score: number | null): string {
  if (score == null || isNaN(score)) return '#6b7280';
  if (score <= 60) return '#b91c1c';
  if (score <= 80) return '#ca8a04';
  return '#15803d';
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};
const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
  color: '#64748b',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#0f172a',
};

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
  /** From `branch_business_status` (normalized). */
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

  return (
    <div>
      {subTitle(isTh ? 'ที่พัก' : 'Accommodation')}
      {accommodationRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          {isTh
            ? 'ไม่มีแถว branch_type = accommodation ใน branch_business_status'
            : 'No accommodation branches in branch_business_status.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Health</th>
                <th style={thStyle}>{isTh ? 'สาขา' : 'Branch'}</th>
                <th style={thStyle}>Occupancy (%)</th>
                <th style={thStyle}>Revenue (฿)</th>
                <th style={thStyle}>ADR (฿)</th>
                <th style={thStyle}>Rooms</th>
                <th style={thStyle}>RevPAR (฿)</th>
              </tr>
            </thead>
            <tbody>
              {accommodationRows.map((r) => (
                <tr key={`${r.branchId}-${r.branchType}`}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: healthColor(r.healthScore) }}>
                    {r.healthScore != null ? Math.round(r.healthScore) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <BranchNameCell row={r} locale={locale} />
                  </td>
                  <td style={tdStyle}>{Math.round(r.occupancyPct)}%</td>
                  <td style={tdStyle}>฿{formatCurrency(r.revenueThb)}</td>
                  <td style={tdStyle}>฿{formatCurrency(r.adrThb)}</td>
                  <td style={tdStyle}>
                    {r.roomsTotal > 0 ? `${r.roomsSold}/${r.roomsTotal}` : '—'}
                  </td>
                  <td style={tdStyle}>฿{formatCurrency(r.revparThb)}</td>
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
            ? 'ไม่มีแถว branch_type = fnb ใน branch_business_status'
            : 'No F&B branches in branch_business_status.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Health</th>
                <th style={thStyle}>{isTh ? 'สาขา' : 'Branch'}</th>
                <th style={thStyle}>Revenue (฿)</th>
                <th style={thStyle}>Customers</th>
                <th style={thStyle}>Avg ticket (฿)</th>
              </tr>
            </thead>
            <tbody>
              {fnbRows.map((r) => (
                <tr key={`${r.branchId}-${r.branchType}`}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: healthColor(r.healthScore) }}>
                    {r.healthScore != null ? Math.round(r.healthScore) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <BranchNameCell row={r} locale={locale} />
                  </td>
                  <td style={tdStyle}>฿{formatCurrency(r.revenueThb)}</td>
                  <td style={tdStyle}>{formatCurrency(r.customers, 'en-US')}</td>
                  <td style={tdStyle}>฿{formatCurrency(r.avgTicketThb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
