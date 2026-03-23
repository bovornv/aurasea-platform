'use client';

import type { CompanyTrendsSummaryRow } from '../../services/db/company-trends-summary-service';
import type { CSSProperties } from 'react';

const DRIVER_TH: Record<string, string> = {
  'Accommodation (rooms) revenue led vs last week.': 'รายได้ห้องพักนำเมื่อเทียบสัปดาห์ก่อน',
  'F&B revenue led vs last week.': 'รายได้ F&B นำเมื่อเทียบสัปดาห์ก่อน',
  'Broad-based revenue growth vs last week.': 'รายได้โตกว้างทั้งที่พักและ F&B เมื่อเทียบสัปดาห์ก่อน',
  'Revenue softer vs last week across tracked branches.': 'รายได้อ่อนลงเมื่อเทียบสัปดาห์ก่อน (ตามสาขาที่มีข้อมูล)',
};

const TREND_TH: Record<string, string> = {
  'Weekend stronger than weekdays': 'สุดสัปดาห์แรงกว่าวันธรรมดา',
  'Weekdays stronger than weekends': 'วันธรรมดาแรงกว่าสุดสัปดาห์',
};

export function CompanyBusinessTrendSummary({
  row,
  loading,
  locale,
}: {
  row: CompanyTrendsSummaryRow | null;
  loading: boolean;
  locale: string;
}) {
  const th = locale === 'th';

  const labelStyle: CSSProperties = {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 500,
    margin: 0,
    lineHeight: 1.4,
  };
  const bodyStyle: CSSProperties = {
    fontSize: 13,
    color: '#374151',
    fontWeight: 500,
    margin: 0,
    lineHeight: 1.45,
  };

  if (loading) {
    return (
      <p style={{ ...labelStyle, margin: 0 }}>
        {th ? 'กำลังโหลดแนวโน้ม…' : 'Loading trends…'}
      </p>
    );
  }

  if (!row?.is_ready) {
    return (
      <p style={{ ...bodyStyle, color: '#6b7280' }}>
        {th ? 'ยังไม่มีข้อมูลเพียงพอสำหรับแนวโน้ม' : 'Not enough data to show trends yet'}
      </p>
    );
  }

  const pct = row.revenue_pct_vs_prior_week;
  const heroColor = pct == null ? '#64748b' : pct >= 0 ? '#15803d' : '#b91c1c';
  const arrow = pct == null ? '' : pct >= 0 ? '↑' : '↓';
  const heroText =
    pct != null
      ? th
        ? `รายได้ ${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% เทียบสัปดาห์ก่อน`
        : `Revenue ${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs last week`
      : th
        ? 'กำลังติดตามสัปดาห์ล่าสุด — เปรียบเทียบสัปดาห์ต่อสัปดาห์เมื่อมีประวัติเพียงพอ'
        : 'Tracking last week — week-over-week compares after more history';

  const driversEn = row.drivers_text?.trim() || '';
  const driversDisplay = driversEn && th ? (DRIVER_TH[driversEn] ?? driversEn) : driversEn;

  const occ =
    row.occupancy_pct != null ? `${row.occupancy_pct.toFixed(1)}%` : th ? '—' : '—';
  const cust =
    row.customers_total != null
      ? Math.round(row.customers_total).toLocaleString(th ? 'th-TH' : 'en-US')
      : th ? '—' : '—';

  const mixSegment =
    row.mix_rooms_pct != null && row.mix_fnb_pct != null
      ? th
        ? `สัดส่วน ห้อง ${row.mix_rooms_pct}% · F&B ${row.mix_fnb_pct}%`
        : `Mix Rooms ${row.mix_rooms_pct}% • F&B ${row.mix_fnb_pct}%`
      : null;

  const snapshotLine = th
    ? `เข้าพัก: ${occ} | ลูกค้า: ${cust}${mixSegment ? ` | ${mixSegment}` : ''}`
    : `Occupancy: ${occ} | Customers: ${cust}${mixSegment ? ` | ${mixSegment}` : ''}`;

  const trendEn = row.trend_line?.trim() || '';
  const trendDisplay = trendEn && th ? (TREND_TH[trendEn] ?? trendEn) : trendEn;
  const trendLabel = th ? 'แนวโน้ม:' : 'Trend:';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.25,
          color: heroColor,
          letterSpacing: '-0.02em',
        }}
      >
        {heroText}
      </p>

      {driversDisplay ? (
        <p style={{ ...bodyStyle, color: '#334155' }}>
          <span style={{ color: '#64748b', fontWeight: 600 }}>{th ? 'สาเหตุหลัก: ' : 'Driven by: '}</span>
          {driversDisplay}
        </p>
      ) : null}

      <p style={{ ...bodyStyle, color: '#1e293b' }}>{snapshotLine}</p>

      {trendDisplay ? (
        <p style={{ ...labelStyle, color: '#475569' }}>
          <span style={{ fontWeight: 600 }}>{trendLabel}</span> {trendDisplay}
        </p>
      ) : null}
    </div>
  );
}
