'use client';

/**
 * BranchTodaySummary — Top Metrics only (premium, Stripe/Linear-style).
 * Single row: Revenue | ADR | RevPAR | Health (accommodation) or Revenue | Customers | Avg Ticket | Health (F&B).
 * No learning/progress bar; system status lives in a separate strip below.
 */

import { getHealthIcon } from '../../utils/today-summary-utils';

const sep = ' | ';
const sepStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '16px', fontWeight: 400, margin: '0 8px' };
const valueStyle: React.CSSProperties = { fontWeight: 600, color: '#111827', fontSize: '17px' };
const labelStyle: React.CSSProperties = { fontSize: '14px', color: '#6b7280', fontWeight: 500, marginRight: '4px' };
const deltaPos: React.CSSProperties = { color: '#059669', fontWeight: 500, fontSize: '16px' };
const deltaNeg: React.CSSProperties = { color: '#dc2626', fontWeight: 500, fontSize: '16px' };
const healthGreen: React.CSSProperties = { color: '#059669', fontWeight: 600, fontSize: '17px' };
const healthYellow: React.CSSProperties = { color: '#ca8a04', fontWeight: 600, fontSize: '17px' };
const healthRed: React.CSSProperties = { color: '#dc2626', fontWeight: 600, fontSize: '17px' };
const itemGap = 20;

function healthColor(score: number | null | undefined): React.CSSProperties {
  if (score == null || Number.isNaN(score)) return valueStyle;
  const n = Number(score);
  if (n >= 80) return healthGreen;
  if (n >= 60) return healthYellow;
  return healthRed;
}

export interface BranchTodaySummaryAccommodation {
  occupancyRate: number | null;
  occupancyDeltaPct: number | null;
  roomsSold: number | null;
  totalRooms: number | null;
  revenue: number | null;
  revenueDeltaPct: number | null;
  adr: number | null;
  revpar: number | null;
  healthScore: number | null;
}

export interface BranchTodaySummaryFnb {
  revenue: number | null;
  revenueDeltaPct: number | null;
  customers: number | null;
  customersDeltaPct: number | null;
  avgTicket: number | null;
  healthScore: number | null;
}

export interface BranchTodaySummaryProps {
  branchType: 'accommodation' | 'fnb';
  locale: 'en' | 'th';
  /** Metric date (YYYY-MM-DD) or lastUpdated ISO string for "Last updated: Mar 16" in title */
  lastUpdatedDate?: string | null;
  accommodation?: BranchTodaySummaryAccommodation | null;
  fnb?: BranchTodaySummaryFnb | null;
  collectingLabel?: string;
}

function formatRevenue(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `฿${Math.round(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function BranchTodaySummary({
  branchType,
  locale: loc,
  lastUpdatedDate,
  accommodation,
  fnb,
  collectingLabel = 'Collecting data...',
}: BranchTodaySummaryProps) {
  const isTh = loc === 'th';
  const vsYesterday = isTh ? 'เทียบเมื่อวาน' : 'vs yesterday';
  const vsLastWeek = isTh ? 'เทียบสัปดาห์ก่อน' : 'vs last week';
  const labelOccupancy = isTh ? 'อัตราการเข้าพัก' : 'Occupancy';
  const labelRooms = isTh ? 'ห้อง' : 'Rooms';
  const labelRevenue = isTh ? 'รายได้' : 'Revenue';
  const labelHealth = isTh ? 'สุขภาพ' : 'Health';
  const labelCustomers = isTh ? 'ลูกค้า' : 'Customers';
  const labelAvgTicket = isTh ? 'ค่าเฉลี่ยต่อบิล' : 'Avg Ticket';

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: `0 ${itemGap}px`,
    fontSize: '17px',
  };

  const segmentStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'baseline',
  };

  if (branchType === 'accommodation' && accommodation) {
    const a = accommodation;
    const occ = a.occupancyRate != null ? Math.round(a.occupancyRate) : null;
    const occDelta = a.occupancyDeltaPct;
    const roomsStr =
      a.roomsSold != null && a.totalRooms != null
        ? `${a.roomsSold}/${a.totalRooms}`
        : a.roomsSold != null
          ? String(a.roomsSold)
          : '—';
    const revStr = a.revenue != null ? formatRevenue(a.revenue) : collectingLabel;
    const revDelta = a.revenueDeltaPct;
    const adrStr = a.adr != null ? formatRevenue(a.adr) : '—';
    const revparStr = a.revpar != null ? formatRevenue(a.revpar) : '—';
    const health = a.healthScore != null ? Math.round(a.healthScore) : '—';
    const healthIcon = getHealthIcon(a.healthScore);

    return (
      <div style={{ padding: 0 }}>
        <div style={rowStyle}>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelOccupancy}</span>
            <span style={valueStyle}>{occ != null ? `${occ}%` : '—'}</span>
            {occDelta != null && Number.isFinite(occDelta) && (
              <span style={occDelta >= 0 ? deltaPos : deltaNeg}>
                {' '}({occDelta >= 0 ? '+' : ''}{occDelta.toFixed(0)}% {vsLastWeek})
              </span>
            )}
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelRooms}</span>
            <span style={valueStyle}>{roomsStr}</span>
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelRevenue}</span>
            <span style={valueStyle}>{revStr}</span>
            {revDelta != null && Number.isFinite(revDelta) && (
              <span style={revDelta >= 0 ? deltaPos : deltaNeg}>
                {' '}({revDelta >= 0 ? '+' : ''}{revDelta.toFixed(0)}% {vsYesterday})
              </span>
            )}
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>ADR</span>
            <span style={valueStyle}>{adrStr}</span>
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>RevPAR</span>
            <span style={valueStyle}>{revparStr}</span>
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelHealth}</span>
            <span style={healthColor(a.healthScore)}>{health} {healthIcon}</span>
          </span>
        </div>
      </div>
    );
  }

  if (branchType === 'fnb' && fnb) {
    const f = fnb;
    const revStr = f.revenue != null ? formatRevenue(f.revenue) : collectingLabel;
    const cust = f.customers != null ? f.customers : '—';
    const avgStr = f.avgTicket != null ? formatRevenue(f.avgTicket) : '—';
    const health = f.healthScore != null ? Math.round(f.healthScore) : '—';
    const healthIcon = getHealthIcon(f.healthScore);
    return (
      <div style={{ padding: 0 }}>
        <div style={rowStyle}>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelRevenue}</span>
            <span style={valueStyle}>{revStr}</span>
            {f.revenueDeltaPct != null && Number.isFinite(f.revenueDeltaPct) && (
              <span style={f.revenueDeltaPct >= 0 ? deltaPos : deltaNeg}>
                {' '}({f.revenueDeltaPct >= 0 ? '+' : ''}{f.revenueDeltaPct.toFixed(0)}% {vsYesterday})
              </span>
            )}
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelCustomers}</span>
            <span style={valueStyle}>{cust}</span>
            {f.customersDeltaPct != null && Number.isFinite(f.customersDeltaPct) && (
              <span style={f.customersDeltaPct >= 0 ? deltaPos : deltaNeg}>
                {' '}({f.customersDeltaPct >= 0 ? '+' : ''}{f.customersDeltaPct.toFixed(0)}% {vsYesterday})
              </span>
            )}
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelAvgTicket}</span>
            <span style={valueStyle}>{avgStr}</span>
          </span>
          <span style={sepStyle}>{sep}</span>
          <span style={segmentStyle}>
            <span style={labelStyle}>{labelHealth}</span>
            <span style={healthColor(f.healthScore)}>{health} {healthIcon}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 0 }}>
      <div style={{ fontSize: '16px', color: '#6b7280', fontWeight: 500 }}>{collectingLabel}</div>
    </div>
  );
}
