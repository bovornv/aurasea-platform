'use client';

/**
 * Compact single-line operational summary for Today page.
 * Replaces the Business Health Score, Today's Revenue, Rooms, Early Signal, Confidence cards.
 * - Accommodation: Occupancy X% (delta vs last week) | Rooms X/total | Revenue ฿X (delta) | ADR ฿X | RevPAR ฿X | Health X {icon}
 * - F&B: Revenue ฿X (delta vs yesterday) | Customers X (delta) | Avg Ticket ฿X | Health X {icon}
 * No cards, borders, or shadows. Delta: positive = green, negative = red. Health last with icon.
 */

import { formatCurrency } from '../../utils/formatting';
import { getHealthIcon } from '../../utils/today-summary-utils';

const segmentGap = { marginRight: '0.75rem' };
const labelStyle: React.CSSProperties = { fontSize: '11px', color: '#6b7280', marginRight: '0.25rem' };
const valueStyle: React.CSSProperties = { fontWeight: 700, color: '#0a0a0a' };
const deltaPositive: React.CSSProperties = { color: '#059669', fontSize: '12px' };
const deltaNegative: React.CSSProperties = { color: '#dc2626', fontSize: '12px' };

export interface TodaySummaryAccommodation {
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

export interface TodaySummaryFnb {
  revenue: number | null;
  revenueDeltaPct: number | null;
  customers: number | null;
  customersDeltaPct: number | null;
  avgTicket: number | null;
  healthScore: number | null;
}

export interface TodaySummaryLineProps {
  branchType: 'accommodation' | 'fnb';
  locale: 'en' | 'th';
  accommodation?: TodaySummaryAccommodation | null;
  fnb?: TodaySummaryFnb | null;
  collectingLabel?: string;
}

export function TodaySummaryLine({
  branchType,
  locale: loc,
  accommodation,
  fnb,
  collectingLabel = 'Collecting data...',
}: TodaySummaryLineProps) {
  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem 0.75rem',
    fontSize: '13px',
    color: '#374151',
    padding: '0.5rem 0',
  };

  if (branchType === 'accommodation' && accommodation) {
    const a = accommodation;
    const occ = a.occupancyRate != null ? Math.round(a.occupancyRate) : null;
    const rooms = a.roomsSold != null && a.totalRooms != null ? `${a.roomsSold}/${a.totalRooms}` : (a.roomsSold != null ? String(a.roomsSold) : '—');
    const rev = a.revenue != null ? `฿${formatCurrency(a.revenue)}` : collectingLabel;
    const adr = a.adr != null ? `฿${formatCurrency(a.adr)}` : '—';
    const revpar = a.revpar != null ? `฿${formatCurrency(a.revpar)}` : '—';
    const health = a.healthScore != null ? Math.round(a.healthScore) : '—';
    const healthIcon = getHealthIcon(a.healthScore);
    const vsLabel = loc === 'th' ? 'เทียบสัปดาห์ก่อน' : 'vs last week';

    return (
      <div style={wrapStyle}>
        <span style={segmentGap}>
          <span style={labelStyle}>Occupancy</span>
          <span style={valueStyle}>{occ != null ? `${occ}%` : collectingLabel}</span>
          {a.occupancyDeltaPct != null && Number.isFinite(a.occupancyDeltaPct) && (
            <span style={a.occupancyDeltaPct >= 0 ? deltaPositive : deltaNegative}>
              {' '}({a.occupancyDeltaPct >= 0 ? '+' : ''}{a.occupancyDeltaPct.toFixed(1)}% {vsLabel})
            </span>
          )}
        </span>
        <span style={segmentGap}>
          <span style={labelStyle}>Rooms</span>
          <span style={valueStyle}>{rooms}</span>
        </span>
        <span style={segmentGap}>
          <span style={labelStyle}>Revenue</span>
          <span style={valueStyle}>{rev}</span>
          {a.revenueDeltaPct != null && Number.isFinite(a.revenueDeltaPct) && (
            <span style={a.revenueDeltaPct >= 0 ? deltaPositive : deltaNegative}>
              {' '}({a.revenueDeltaPct >= 0 ? '+' : ''}{a.revenueDeltaPct.toFixed(1)}% {vsLabel})
            </span>
          )}
        </span>
        <span style={segmentGap}>
          <span style={labelStyle}>ADR</span>
          <span style={valueStyle}>{adr}</span>
        </span>
        <span style={segmentGap}>
          <span style={labelStyle}>RevPAR</span>
          <span style={valueStyle}>{revpar}</span>
        </span>
        <span style={{ ...segmentGap, marginLeft: 'auto' }}>
          <span style={labelStyle}>Health</span>
          <span style={valueStyle}>{health} {healthIcon}</span>
        </span>
      </div>
    );
  }

  if (branchType === 'fnb' && fnb) {
    const f = fnb;
    const rev = f.revenue != null ? `฿${formatCurrency(f.revenue)}` : collectingLabel;
    const cust = f.customers != null ? f.customers : '—';
    const avg = f.avgTicket != null ? `฿${formatCurrency(f.avgTicket)}` : '—';
    const health = f.healthScore != null ? Math.round(f.healthScore) : '—';
    const healthIcon = getHealthIcon(f.healthScore);
    const vsLabel = loc === 'th' ? 'เทียบเมื่อวาน' : 'vs yesterday';

    return (
      <div style={wrapStyle}>
        <span style={segmentGap}>
          <span style={labelStyle}>Revenue</span>
          <span style={valueStyle}>{rev}</span>
          {f.revenueDeltaPct != null && Number.isFinite(f.revenueDeltaPct) && (
            <span style={f.revenueDeltaPct >= 0 ? deltaPositive : deltaNegative}>
              {' '}({f.revenueDeltaPct >= 0 ? '+' : ''}{f.revenueDeltaPct.toFixed(1)}% {vsLabel})
            </span>
          )}
        </span>
        <span style={segmentGap}>
          <span style={labelStyle}>Customers</span>
          <span style={valueStyle}>{cust}</span>
          {f.customersDeltaPct != null && Number.isFinite(f.customersDeltaPct) && (
            <span style={f.customersDeltaPct >= 0 ? deltaPositive : deltaNegative}>
              {' '}({f.customersDeltaPct >= 0 ? '+' : ''}{f.customersDeltaPct.toFixed(1)}% {vsLabel})
            </span>
          )}
        </span>
        <span style={segmentGap}>
          <span style={labelStyle}>Avg Ticket</span>
          <span style={valueStyle}>{avg}</span>
        </span>
        <span style={{ ...segmentGap, marginLeft: 'auto' }}>
          <span style={labelStyle}>Health</span>
          <span style={valueStyle}>{health} {healthIcon}</span>
        </span>
      </div>
    );
  }

  return <div style={wrapStyle}>{collectingLabel}</div>;
}
