/**
 * DecisionTrendChart — single or dual-axis line chart with minimal axis,
 * weekend shading (Sat/Sun), and optional dashed baseline (7d rolling avg).
 */
'use client';

import { useMemo } from 'react';
import { rolling7Avg, getDayOfWeek } from '../../utils/trends-headline';

const AXIS_COLOR = '#eee';
const BASELINE_COLOR = '#9ca3af';
const WEEKEND_OPACITY = 0.06;
const PAD_LEFT = 40;
const PAD_RIGHT = 40;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const HEIGHT = 200;

interface DecisionTrendChartProps {
  /** Primary series (left axis) */
  values: number[];
  /** Optional second series (right axis). If provided, dual-axis. */
  valuesRight?: number[];
  /** Date strings YYYY-MM-DD for weekend shading; length must match values */
  dates?: string[];
  color?: string;
  colorRight?: string;
  /** Show dashed 7-day rolling average baseline */
  showBaseline?: boolean;
  height?: number;
  /** Format left axis tick (e.g. % or ฿) */
  formatLeft?: (v: number) => string;
  /** Format right axis tick */
  formatRight?: (v: number) => string;
  emptyMessage?: string;
}

export function DecisionTrendChart({
  values,
  valuesRight,
  dates = [],
  color = '#6366f1',
  colorRight = '#7c3aed',
  showBaseline = true,
  height = HEIGHT,
  formatLeft = (v) => String(Math.round(v)),
  formatRight = (v) => String(Math.round(v)),
  emptyMessage = 'No data',
}: DecisionTrendChartProps) {
  const hasData = values && values.length >= 2;
  const dualAxis = hasData && valuesRight && valuesRight.length === values.length;

  const chartWidth = useMemo(() => 600, []);
  const chartHeight = height - PAD_TOP - PAD_BOTTOM;
  const plotLeft = PAD_LEFT;
  const plotRight = chartWidth - PAD_RIGHT;
  const plotW = plotRight - plotLeft;

  const { min: minL, max: maxL, points: pointsL, ticks: ticksL } = useMemo(() => {
    if (!hasData) return { min: 0, max: 1, points: '', ticks: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = plotLeft + (i / (values.length - 1)) * plotW;
      const y = PAD_TOP + chartHeight - ((v - min) / range) * chartHeight;
      return { x, y };
    });
    const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
    const tickCount = 4;
    const ticks: { v: number; y: number }[] = [];
    for (let i = 0; i <= tickCount; i++) {
      const v = min + (range * i) / tickCount;
      const y = PAD_TOP + chartHeight - (i / tickCount) * chartHeight;
      ticks.push({ v, y });
    }
    return { min: min, max: max, points: pointsStr, ticks };
  }, [values, hasData, chartHeight, plotLeft, plotW]);

  const { points: pointsR, ticks: ticksR } = useMemo(() => {
    if (!dualAxis || !valuesRight) return { points: '', ticks: [] as { v: number; y: number }[] };
    const min = Math.min(...valuesRight);
    const max = Math.max(...valuesRight);
    const range = max - min || 1;
    const pts = valuesRight.map((v, i) => {
      const x = plotLeft + (i / (valuesRight.length - 1)) * plotW;
      const y = PAD_TOP + chartHeight - ((v - min) / range) * chartHeight;
      return { x, y };
    });
    const tickCount = 4;
    const ticks: { v: number; y: number }[] = [];
    for (let i = 0; i <= tickCount; i++) {
      const v = min + (range * i) / tickCount;
      const y = PAD_TOP + chartHeight - (i / tickCount) * chartHeight;
      ticks.push({ v, y });
    }
    return { points: pts.map((p) => `${p.x},${p.y}`).join(' '), ticks };
  }, [dualAxis, valuesRight, chartHeight, plotLeft, plotW]);

  const baselinePoints = useMemo(() => {
    if (!showBaseline || !hasData) return null;
    const roll = rolling7Avg(values);
    const valid = roll.map((v, i) => (v != null ? { i, v } : null)).filter(Boolean) as { i: number; v: number }[];
    if (valid.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = valid.map(({ i, v }) => {
      const x = plotLeft + (i / (values.length - 1)) * plotW;
      const y = PAD_TOP + chartHeight - ((v - min) / range) * chartHeight;
      return `${x},${y}`;
    });
    return pts.join(' ');
  }, [showBaseline, values, hasData, chartHeight, plotLeft, plotW]);

  const weekendBands = useMemo(() => {
    if (!dates.length || dates.length !== values.length) return null;
    const bands: { x1: number; x2: number }[] = [];
    for (let i = 0; i < values.length - 1; i++) {
      const d = getDayOfWeek(dates[i]!);
      if (d === 0 || d === 6) {
        const x1 = plotLeft + (i / (values.length - 1)) * plotW;
        const x2 = plotLeft + ((i + 1) / (values.length - 1)) * plotW;
        bands.push({ x1, x2 });
      }
    }
    return bands;
  }, [dates, values.length, plotLeft, plotW]);

  if (!hasData) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ height, width: '100%', overflow: 'hidden' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
        {/* Weekend shading */}
        {weekendBands?.map((b, i) => (
          <rect key={i} x={b.x1} y={PAD_TOP} width={b.x2 - b.x1} height={chartHeight} fill="#6366f1" fillOpacity={WEEKEND_OPACITY} />
        ))}
        {/* Left axis line */}
        <line x1={plotLeft} y1={PAD_TOP} x2={plotLeft} y2={PAD_TOP + chartHeight} stroke={AXIS_COLOR} strokeWidth="1" />
        <line x1={plotLeft} y1={PAD_TOP + chartHeight} x2={plotRight} y2={PAD_TOP + chartHeight} stroke={AXIS_COLOR} strokeWidth="1" />
        {/* Left axis ticks */}
        {ticksL.map((t, i) => (
          <g key={i}>
            <line x1={plotLeft} y1={t.y} x2={plotLeft - 4} y2={t.y} stroke={AXIS_COLOR} strokeWidth="1" />
            <text x={plotLeft - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {formatLeft(t.v)}
            </text>
          </g>
        ))}
        {/* Right axis (if dual) */}
        {dualAxis && ticksR.length > 0 && (
          <>
            <line x1={plotRight} y1={PAD_TOP} x2={plotRight} y2={PAD_TOP + chartHeight} stroke={AXIS_COLOR} strokeWidth="1" />
            {ticksR.map((t, i) => (
              <g key={i}>
                <line x1={plotRight} y1={t.y} x2={plotRight + 4} y2={t.y} stroke={AXIS_COLOR} strokeWidth="1" />
                <text x={plotRight + 6} y={t.y + 4} textAnchor="start" fontSize="10" fill="#9ca3af">
                  {formatRight(t.v)}
                </text>
              </g>
            ))}
          </>
        )}
        {/* Dashed baseline */}
        {baselinePoints && (
          <polyline points={baselinePoints} fill="none" stroke={BASELINE_COLOR} strokeWidth="1" strokeDasharray="4,4" />
        )}
        {/* Primary line */}
        <polyline points={pointsL} fill="none" stroke={color} strokeWidth="2" />
        {/* Secondary line (dual axis) */}
        {dualAxis && pointsR && <polyline points={pointsR} fill="none" stroke={colorRight} strokeWidth="2" />}
      </svg>
    </div>
  );
}
