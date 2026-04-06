'use client';

/**
 * ADR Opportunity Band Chart
 *
 * Same visual as RevPAR+ADR (DecisionTrendChart), but with an additional
 * soft purple/lavender shaded band on the ADR axis showing the typical ADR
 * range (median–90th percentile) for each day's occupancy bucket (5%-wide).
 *
 * Requires 60+ days of history; otherwise shows a grey note.
 * Uses no external charting library — pure SVG.
 */

import { useMemo } from 'react';
import { computeTimeSeriesWeekendBands, getWeekendStyle, CHART_WEEKEND_BAND_STROKE_WIDTH } from '../../utils/chart-weekend';
import { formatShortDate } from '../../utils/trends-headline';

const PAD_LEFT = 44;
const PAD_RIGHT = 44;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const HEIGHT = CHART_HEIGHT + PAD_TOP + PAD_BOTTOM;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = CHART_WIDTH - PAD_RIGHT;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
}

function median(sorted: number[]): number {
  return percentile(sorted, 50);
}

/** Signal key for the ADR band one-line insight. */
export type AdrBandSignalKey = 'adrBandNoData' | 'adrAboveBand' | 'adrBelowBand' | 'adrInBand';

/**
 * Computes the ADR band signal key for the Trends page one-line insight system.
 * Returns a signal severity + translation key so the caller can render dot+text.
 */
export function computeAdrBandSignalKey(
  adrValues: number[],
  occupancyValues: number[],
  dates: string[]
): { key: AdrBandSignalKey; signal: 'green' | 'amber' | 'info' } {
  const has60Days = dates.length >= 60 && adrValues.length >= 60;
  if (!has60Days || adrValues.length !== occupancyValues.length || adrValues.length < 60) {
    return { key: 'adrBandNoData', signal: 'info' };
  }

  const n = adrValues.length;
  const lastAdr = adrValues[n - 1]!;
  const lastOcc = occupancyValues[n - 1]!;
  const lastOccNorm = lastOcc > 1 ? lastOcc / 100 : lastOcc;

  // Use same bucket logic as the chart (±2.5% occupancy around the last day's occ)
  const bucketLow = Math.floor(lastOccNorm / 0.05) * 0.05;
  const bucketHigh = bucketLow + 0.05;

  const peers = adrValues
    .filter((v, i) => {
      if (i === n - 1) return false; // exclude today from its own benchmark
      const occ = occupancyValues[i]! > 1 ? occupancyValues[i]! / 100 : occupancyValues[i]!;
      return occ >= bucketLow && occ < bucketHigh && v > 0;
    })
    .sort((a, b) => a - b);

  if (peers.length < 5) {
    return { key: 'adrInBand', signal: 'info' };
  }

  const lo = percentile(peers, 50); // median
  const hi = percentile(peers, 90); // 90th percentile

  if (lastAdr > hi) return { key: 'adrAboveBand', signal: 'green' };
  if (lastAdr < lo) return { key: 'adrBelowBand', signal: 'amber' };
  return { key: 'adrInBand', signal: 'info' };
}

export interface AdrOpportunityBandChartProps {
  revparValues: number[];
  adrValues: number[];
  occupancyValues: number[]; // 0-100 or 0-1 scale
  dates: string[];
  locale?: 'th' | 'en';
  height?: number;
  emptyMessage?: string;
  problem?: string;
  recommendation?: string;
}

export function AdrOpportunityBandChart({
  revparValues,
  adrValues,
  occupancyValues,
  dates,
  locale = 'en',
  height = HEIGHT,
  emptyMessage,
}: AdrOpportunityBandChartProps) {
  const th = locale === 'th';
  const hasData = revparValues.length >= 2 && adrValues.length >= 2;
  const has60Days = dates.length >= 60 && adrValues.length >= 60;

  const chartH = height - PAD_TOP - PAD_BOTTOM;

  // Normalize occupancy to 0-1 range
  const occNorm = useMemo(
    () => occupancyValues.map((v) => (v > 1 ? v / 100 : v)),
    [occupancyValues]
  );

  // Compute ADR band per day (occupancy bucket ±2.5%)
  const { bandLower, bandUpper } = useMemo(() => {
    if (!has60Days || adrValues.length !== occupancyValues.length) {
      return { bandLower: [] as number[], bandUpper: [] as number[] };
    }
    const lower: number[] = [];
    const upper: number[] = [];
    for (let i = 0; i < adrValues.length; i++) {
      const occ = occNorm[i] ?? 0;
      const bucket = Math.floor(occ / 0.05) * 0.05;
      const bucketLow = bucket;
      const bucketHigh = bucket + 0.05;
      // Collect ADR from all other days in this bucket
      const peers = adrValues.filter((_, j) => {
        if (j === i) return false;
        const o = occNorm[j] ?? 0;
        return o >= bucketLow && o < bucketHigh && adrValues[j]! > 0;
      }).sort((a, b) => a - b);
      if (peers.length >= 3) {
        lower.push(median(peers));
        upper.push(percentile(peers, 90));
      } else {
        lower.push(0);
        upper.push(0);
      }
    }
    return { bandLower: lower, bandUpper: upper };
  }, [has60Days, adrValues, occupancyValues, occNorm]);

  const hasBand = bandLower.length === adrValues.length && bandLower.some((v) => v > 0);

  // Y scales — left: revpar, right: adr
  const { leftScale, rightScale } = useMemo(() => {
    if (!hasData) return { leftScale: { min: 0, max: 1, toY: () => PAD_TOP }, rightScale: { min: 0, max: 1, toY: () => PAD_TOP } };

    const lMin = 0;
    const lMax = Math.ceil(Math.max(...revparValues, 1) * 1.1);
    const lRange = lMax - lMin || 1;
    const leftToY = (v: number) => PAD_TOP + chartH - ((v - lMin) / lRange) * chartH;

    const adrMax = Math.max(...adrValues, ...bandUpper.filter((v) => v > 0), 1);
    const rMin = 0;
    const rMax = Math.ceil(adrMax * 1.1);
    const rRange = rMax - rMin || 1;
    const rightToY = (v: number) => PAD_TOP + chartH - ((v - rMin) / rRange) * chartH;

    return {
      leftScale: { min: lMin, max: lMax, toY: leftToY },
      rightScale: { min: rMin, max: rMax, toY: rightToY },
    };
  }, [hasData, revparValues, adrValues, bandUpper, chartH]);

  const n = revparValues.length;
  const toX = (i: number) => PLOT_LEFT + (i / Math.max(1, n - 1)) * PLOT_W;

  const leftPoints = revparValues.map((v, i) => `${toX(i)},${leftScale.toY(v)}`).join(' ');
  const rightPoints = adrValues.map((v, i) => `${toX(i)},${rightScale.toY(v)}`).join(' ');

  // Band polygon (upper edge left-to-right, lower edge right-to-left)
  const bandPolygon = useMemo(() => {
    if (!hasBand) return null;
    const upper = bandUpper.map((v, i) => `${toX(i)},${rightScale.toY(v > 0 ? v : adrValues[i]!)}`);
    const lower = [...bandLower].map((v, i) => `${toX(i)},${rightScale.toY(v > 0 ? v : adrValues[i]!)}`).reverse();
    return [...upper, ...lower].join(' ');
  }, [hasBand, bandUpper, bandLower, adrValues, rightScale, toX]);

  // Y-axis ticks
  const leftTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => ({
      v: Math.round(leftScale.min + ((leftScale.max - leftScale.min) * i) / count),
      y: PAD_TOP + chartH - (i / count) * chartH,
    }));
  }, [leftScale, chartH]);

  const rightTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => ({
      v: Math.round(rightScale.min + ((rightScale.max - rightScale.min) * i) / count),
      y: PAD_TOP + chartH - (i / count) * chartH,
    }));
  }, [rightScale, chartH]);

  // X-axis ticks
  const xTicks = useMemo(() => {
    if (n < 2) return [];
    const maxTicks = 6;
    const indices: number[] = [];
    for (let k = 0; k < maxTicks; k++) indices.push(Math.round((k * (n - 1)) / (maxTicks - 1)));
    return [...new Set(indices)].map((idx) => ({
      idx,
      x: toX(idx),
      label: dates[idx] ? formatShortDate(dates[idx]!) : '',
    }));
  }, [n, dates, toX]);

  const weekendStyle = getWeekendStyle();
  const weekendBands = computeTimeSeriesWeekendBands(n, dates, PLOT_LEFT, PLOT_W);

  // Band insight text for last point
  const bandInsight = useMemo(() => {
    if (!hasBand || !has60Days) return null;
    const last = adrValues.length - 1;
    const lastAdr = adrValues[last];
    const lastLow = bandLower[last];
    const lastHigh = bandUpper[last];
    const lastOcc = Math.round((occNorm[last] ?? 0) * 100);
    if (!lastAdr || !lastLow || !lastHigh) return null;
    if (lastAdr < lastLow) {
      return {
        text: th
          ? `ADR ต่ำกว่าช่วงปกติ ฿${Math.round(lastLow - lastAdr).toLocaleString()} ที่อัตราเข้าพัก ${lastOcc}%`
          : `ADR is ฿${Math.round(lastLow - lastAdr).toLocaleString()} below typical rate at ${lastOcc}% occ.`,
        color: '#d97706',
      };
    }
    if (lastAdr > lastHigh) {
      return {
        text: th
          ? `ADR อยู่เหนือช่วงทั่วไปที่อัตราเข้าพัก ${lastOcc}%`
          : `ADR is above typical range at ${lastOcc}% occupancy`,
        color: '#059669',
      };
    }
    return {
      text: th
        ? `ADR อยู่ในช่วงที่เหมาะสม (อัตราเข้าพัก ${lastOcc}%)`
        : `ADR is well-calibrated (occupancy ${lastOcc}%)`,
      color: '#16a34a',
    };
  }, [hasBand, has60Days, adrValues, bandLower, bandUpper, occNorm, th]);

  if (!hasData) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {emptyMessage ?? (th ? 'ไม่มีข้อมูล' : 'No data')}
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible' }}
      >
        {/* Weekend bands */}
        {weekendBands.map((b, i) => (
          <rect
            key={i}
            x={b.x1}
            y={PAD_TOP}
            width={Math.max(0, b.x2 - b.x1)}
            height={chartH}
            fill={weekendStyle.backgroundColor}
            stroke={weekendStyle.borderColor}
            strokeWidth={CHART_WEEKEND_BAND_STROKE_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Axes */}
        <line x1={PLOT_LEFT} y1={PAD_TOP} x2={PLOT_LEFT} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PLOT_LEFT} y1={PAD_TOP + chartH} x2={PLOT_RIGHT} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PLOT_RIGHT} y1={PAD_TOP} x2={PLOT_RIGHT} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />

        {/* Left Y ticks (RevPAR) */}
        <text x={PLOT_LEFT - 2} y={PAD_TOP - 2} textAnchor="end" fontSize="11" fill="#9ca3af">
          {th ? 'RevPAR (฿)' : 'RevPAR (฿)'}
        </text>
        {leftTicks.map((t, i) => (
          <g key={i}>
            <line x1={PLOT_LEFT} y1={t.y} x2={PLOT_LEFT - 4} y2={t.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PLOT_LEFT - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {t.v >= 1000 ? `${Math.round(t.v / 1000)}k` : t.v}
            </text>
          </g>
        ))}

        {/* Right Y ticks (ADR) */}
        <text x={PLOT_RIGHT + 2} y={PAD_TOP - 2} textAnchor="start" fontSize="11" fill="#9ca3af">
          {th ? 'ADR (฿)' : 'ADR (฿)'}
        </text>
        {rightTicks.map((t, i) => (
          <g key={i}>
            <line x1={PLOT_RIGHT} y1={t.y} x2={PLOT_RIGHT + 4} y2={t.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PLOT_RIGHT + 6} y={t.y + 4} textAnchor="start" fontSize="10" fill="#9ca3af">
              {t.v >= 1000 ? `${Math.round(t.v / 1000)}k` : t.v}
            </text>
          </g>
        ))}

        {/* X-axis ticks */}
        {xTicks.map((t) => (
          <g key={t.idx}>
            <line x1={t.x} y1={PAD_TOP + chartH} x2={t.x} y2={PAD_TOP + chartH + 4} stroke="#e5e7eb" strokeWidth="1" />
            <text x={t.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {t.label}
            </text>
          </g>
        ))}

        {/* ADR opportunity band (lavender fill) */}
        {hasBand && bandPolygon && (
          <polygon
            points={bandPolygon}
            fill="rgba(139,92,246,0.15)"
            stroke="none"
          />
        )}

        {/* RevPAR line (green) */}
        <polyline points={leftPoints} fill="none" stroke="#16a34a" strokeWidth="2" />

        {/* ADR line (purple) */}
        <polyline points={rightPoints} fill="none" stroke="#7c3aed" strokeWidth="2" />
      </svg>

      {/* Band insight */}
      {has60Days && bandInsight && (
        <div style={{ marginTop: 8, fontSize: 12, color: bandInsight.color, fontWeight: 500 }}>
          {bandInsight.text}
        </div>
      )}
      {!has60Days && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
          {th
            ? 'ต้องการข้อมูล 60 วันขึ้นไปเพื่อแสดงช่วงโอกาส ADR'
            : 'Need 60+ days of history to show ADR opportunity range'}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#16a34a" strokeWidth="2" /></svg>
          <span>{th ? 'รายได้ต่อห้อง' : 'RevPAR'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#7c3aed" strokeWidth="2" /></svg>
          <span>{th ? 'ราคาห้องเฉลี่ย' : 'ADR'}</span>
        </div>
        {hasBand && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
            <svg width="24" height="10">
              <rect x="0" y="2" width="24" height="6" fill="rgba(139,92,246,0.25)" rx="2" />
            </svg>
            <span>{th ? 'ช่วง ADR ที่เหมาะสม' : 'ADR opportunity range'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
