'use client';

/**
 * BranchTodaySummary — Top Metrics only (premium, Stripe/Linear-style).
 * Accommodation: Occupancy | Rooms | Revenue | ADR | RevPAR | Profitability | Health.
 * F&B: Revenue | Customers | Avg Ticket | Avg Cost | Margin | Health.
 * Right-aligned data freshness chip: same status as Enter Data page (shared getDataFreshnessStatus).
 */

import { getHealthIcon } from '../../utils/today-summary-utils';
import { StatusChip, type StatusChipColor } from '../status-chip';
import type { ProfitabilityTrend } from '../../services/db/latest-metrics-service';

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

const profExplStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  fontWeight: 400,
  lineHeight: 1.25,
  maxWidth: 260,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const trendUp: React.CSSProperties = { color: '#059669', fontWeight: 600, fontSize: '17px' };
const trendFlat: React.CSSProperties = { color: '#9ca3af', fontWeight: 600, fontSize: '17px' };
const trendDown: React.CSSProperties = { color: '#dc2626', fontWeight: 600, fontSize: '17px' };

function profitTrendValueStyle(t: ProfitabilityTrend | null): React.CSSProperties {
  if (t === 'up') return trendUp;
  if (t === 'flat') return trendFlat;
  if (t === 'down') return trendDown;
  return valueStyle;
}

function ProfitTrendMetric({
  label,
  trend,
  explanation,
  insufficientText,
  segmentStyle,
}: {
  label: string;
  trend: ProfitabilityTrend | null;
  explanation: string;
  insufficientText: string;
  segmentStyle: React.CSSProperties;
}) {
  const hasTrend = trend != null;
  const arrow = trend === 'up' ? '↑' : trend === 'flat' ? '→' : trend === 'down' ? '↓' : '—';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span style={segmentStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={hasTrend ? profitTrendValueStyle(trend) : valueStyle}>{arrow}</span>
      </span>
      {hasTrend && explanation.trim() ? <span style={profExplStyle}>{explanation.trim()}</span> : null}
      {!hasTrend ? <span style={profExplStyle}>{insufficientText}</span> : null}
    </span>
  );
}

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
  /** Latest accommodation_profitability_signal row (branch Today). */
  accommodationProfitability?: { trend: ProfitabilityTrend | null; explanation: string } | null;
  /** Latest fnb_profitability_signal row (branch Today). */
  fnbProfitability?: {
    avgDailyCost: number | null;
    marginTrend: ProfitabilityTrend | null;
    marginExplanation: string;
  } | null;
  collectingLabel?: string;
  /** Freshness from getDataFreshnessStatus. When non-null, chip is always shown (same status as Enter Data page). */
  freshness?: { label: string; color: StatusChipColor } | null;
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
  accommodationProfitability = null,
  fnbProfitability = null,
  collectingLabel = 'Collecting data...',
  freshness = null,
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
  const labelProfitability = isTh ? 'กำไร' : 'Profitability';
  const labelAvgCost = isTh ? 'ต้นทุนเฉลี่ย' : 'Avg Cost';
  const labelMargin = isTh ? 'มาร์จิ้น' : 'Margin';
  const insufficientData = isTh ? 'ข้อมูลไม่เพียงพอ' : 'Insufficient data';

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: `0 ${itemGap}px`,
    fontSize: '17px',
  };

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 16,
    flexWrap: 'wrap',
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
        <div style={wrapperStyle}>
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
            <ProfitTrendMetric
              label={labelProfitability}
              trend={accommodationProfitability?.trend ?? null}
              explanation={accommodationProfitability?.explanation ?? ''}
              insufficientText={insufficientData}
              segmentStyle={segmentStyle}
            />
            <span style={sepStyle}>{sep}</span>
            <span style={segmentStyle}>
              <span style={labelStyle}>{labelHealth}</span>
              <span style={healthColor(a.healthScore)}>{health} {healthIcon}</span>
            </span>
          </div>
          {freshness && (
            <StatusChip label={freshness.label} color={freshness.color} />
          )}
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
    const avgCost = fnbProfitability?.avgDailyCost;
    const avgCostStr =
      avgCost != null && Number.isFinite(avgCost) ? formatRevenue(avgCost) : '—';
    return (
      <div style={{ padding: 0 }}>
        <div style={wrapperStyle}>
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
              <span style={labelStyle}>{labelAvgCost}</span>
              <span style={valueStyle}>{avgCostStr}</span>
            </span>
            <span style={sepStyle}>{sep}</span>
            <ProfitTrendMetric
              label={labelMargin}
              trend={fnbProfitability?.marginTrend ?? null}
              explanation={fnbProfitability?.marginExplanation ?? ''}
              insufficientText={insufficientData}
              segmentStyle={segmentStyle}
            />
            <span style={sepStyle}>{sep}</span>
            <span style={segmentStyle}>
              <span style={labelStyle}>{labelHealth}</span>
              <span style={healthColor(f.healthScore)}>{health} {healthIcon}</span>
            </span>
          </div>
          {freshness && (
            <StatusChip label={freshness.label} color={freshness.color} />
          )}
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
