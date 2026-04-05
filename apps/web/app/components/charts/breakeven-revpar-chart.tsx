'use client';

/**
 * RevPAR vs. Breakeven RevPAR — last 30 days
 *
 * Breakeven formula:
 *   daily_fixed_cost = monthly_fixed_cost / days_in_month
 *   daily_variable_cost = variable_cost_per_room × rooms_sold
 *   total_daily_cost = daily_fixed_cost + daily_variable_cost
 *   breakeven_revpar = total_daily_cost / rooms_available
 *
 * Uses no external charting library — pure SVG.
 */

import { useMemo } from 'react';
import type { DailyMetric } from '../../models/daily-metrics';
import { computeTimeSeriesWeekendBands, getWeekendStyle, CHART_WEEKEND_BAND_STROKE_WIDTH } from '../../utils/chart-weekend';

const PAD_LEFT = 44;
const PAD_RIGHT = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const HEIGHT = CHART_HEIGHT + PAD_TOP + PAD_BOTTOM;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export interface BreakevenRevParChartProps {
  dailyMetrics: DailyMetric[];
  roomsAvailable: number;
  locale?: 'th' | 'en';
  height?: number;
}

interface ComputedPoint {
  date: string;
  actualRevpar: number;
  breakevenRevpar: number | null;
}

export function BreakevenRevParChart({
  dailyMetrics,
  roomsAvailable,
  locale = 'en',
  height = HEIGHT,
}: BreakevenRevParChartProps) {
  const th = locale === 'th';

  const { points, hasBreakeven } = useMemo((): { points: ComputedPoint[]; hasBreakeven: boolean } => {
    if (!dailyMetrics || dailyMetrics.length === 0) return { points: [], hasBreakeven: false };

    // Sort oldest-first, take last 30 days
    const sorted = [...dailyMetrics]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    if (sorted.length === 0) return { points: [], hasBreakeven: false };

    // Forward-fill monthly_fixed_cost
    let lastMfc: number | null = null;
    // First pass: collect last known MFC
    for (const m of sorted) {
      if (m.monthlyFixedCost != null && m.monthlyFixedCost > 0) lastMfc = m.monthlyFixedCost;
    }

    // For variable_cost_per_room: use last-7-nonzero average if null/0
    const nonZeroVarCosts = sorted
      .filter((m) => m.variableCostPerRoom != null && m.variableCostPerRoom > 0)
      .map((m) => m.variableCostPerRoom as number);
    const last7NonZeroVar = nonZeroVarCosts.slice(-7);
    const fallbackVarCost =
      last7NonZeroVar.length > 0
        ? last7NonZeroVar.reduce((s, v) => s + v, 0) / last7NonZeroVar.length
        : 0;

    const result: ComputedPoint[] = [];
    let runningMfc = lastMfc;

    for (const m of sorted) {
      if (m.monthlyFixedCost != null && m.monthlyFixedCost > 0) runningMfc = m.monthlyFixedCost;

      const rooms = roomsAvailable > 0 ? roomsAvailable : (m.roomsAvailable ?? 0);
      const revpar = rooms > 0 ? m.revenue / rooms : 0;

      let breakevenRevpar: number | null = null;
      if (runningMfc != null && runningMfc > 0 && rooms > 0) {
        const d = new Date(`${m.date}T12:00:00`);
        const dim = daysInMonth(d.getFullYear(), d.getMonth());
        const dailyFixed = runningMfc / dim;
        const varCost = m.variableCostPerRoom != null && m.variableCostPerRoom > 0
          ? m.variableCostPerRoom
          : fallbackVarCost;
        const dailyVariable = varCost * (m.roomsSold ?? 0);
        const totalDailyCost = dailyFixed + dailyVariable;
        breakevenRevpar = totalDailyCost / rooms;
      }

      result.push({ date: m.date, actualRevpar: revpar, breakevenRevpar });
    }

    const anyBreakeven = result.some((p) => p.breakevenRevpar != null);
    return { points: result, hasBreakeven: anyBreakeven };
  }, [dailyMetrics, roomsAvailable]);

  const chartH = height - PAD_TOP - PAD_BOTTOM;

  const { yMin, yMax, toY, toX } = useMemo(() => {
    if (points.length === 0) return { yMin: 0, yMax: 1, toY: () => PAD_TOP, toX: () => PAD_LEFT };
    const allVals = [
      ...points.map((p) => p.actualRevpar),
      ...points.map((p) => p.breakevenRevpar ?? 0),
    ].filter((v) => isFinite(v));
    const dataMax = Math.max(...allVals, 1);
    const yMin = 0;
    const yMax = Math.ceil(dataMax * 1.1);
    const range = yMax - yMin || 1;
    const n = points.length;
    const toY = (v: number) => PAD_TOP + chartH - ((v - yMin) / range) * chartH;
    const toX = (i: number) => PAD_LEFT + (i / Math.max(1, n - 1)) * PLOT_W;
    return { yMin, yMax, toY, toX };
  }, [points, chartH]);

  const actualPoints = points.map((p, i) => `${toX(i)},${toY(p.actualRevpar)}`).join(' ');

  const breakevenPoints = points
    .map((p, i) => (p.breakevenRevpar != null ? `${toX(i)},${toY(p.breakevenRevpar)}` : null))
    .filter(Boolean)
    .join(' ');

  // Fill segments: red when actual < breakeven, green when actual >= breakeven
  const fillSegments = useMemo(() => {
    if (!hasBreakeven || points.length < 2) return [];
    const segs: Array<{ points: string; fill: string }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i]!;
      const p1 = points[i + 1]!;
      if (p0.breakevenRevpar == null || p1.breakevenRevpar == null) continue;
      const x0 = toX(i);
      const x1 = toX(i + 1);
      const above = (p0.actualRevpar + p1.actualRevpar) >= (p0.breakevenRevpar + p1.breakevenRevpar);
      const polygon = [
        `${x0},${toY(p0.actualRevpar)}`,
        `${x1},${toY(p1.actualRevpar)}`,
        `${x1},${toY(p1.breakevenRevpar)}`,
        `${x0},${toY(p0.breakevenRevpar)}`,
      ].join(' ');
      segs.push({
        points: polygon,
        fill: above ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.15)',
      });
    }
    return segs;
  }, [hasBreakeven, points, toX, toY]);

  // Weekend bands
  const dates = points.map((p) => p.date);
  const weekendStyle = getWeekendStyle();
  const weekendBands = computeTimeSeriesWeekendBands(points.length, dates, PAD_LEFT, PLOT_W);

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => ({
      v: Math.round(yMin + ((yMax - yMin) * i) / count),
      y: PAD_TOP + chartH - (i / count) * chartH,
    }));
  }, [yMin, yMax, chartH]);

  // X-axis ticks
  const xTicks = useMemo(() => {
    if (points.length < 2) return [];
    const n = points.length;
    const maxTicks = 6;
    const indices: number[] = [];
    for (let k = 0; k < maxTicks; k++) {
      indices.push(Math.round((k * (n - 1)) / (maxTicks - 1)));
    }
    return [...new Set(indices)].map((idx) => ({
      idx,
      x: toX(idx),
      label: formatShortDate(points[idx]!.date),
    }));
  }, [points, toX]);

  // Below-chart stats
  const { belowCount, consecutiveLast3, todayDeficit } = useMemo(() => {
    if (!hasBreakeven || points.length === 0) return { belowCount: 0, consecutiveLast3: false, todayDeficit: null };
    const belowCount = points.filter((p) => p.breakevenRevpar != null && p.actualRevpar < p.breakevenRevpar).length;
    const last3 = points.slice(-3);
    const consecutiveLast3 = last3.length === 3 && last3.every((p) => p.breakevenRevpar != null && p.actualRevpar < p.breakevenRevpar);
    const last = points[points.length - 1];
    const todayDeficit =
      last && last.breakevenRevpar != null && last.actualRevpar < last.breakevenRevpar
        ? last.breakevenRevpar - last.actualRevpar
        : null;
    return { belowCount, consecutiveLast3, todayDeficit };
  }, [hasBreakeven, points]);

  if (points.length < 7) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {th ? 'ต้องการข้อมูลอย่างน้อย 7 วัน' : 'Need at least 7 days of data'}
      </div>
    );
  }

  if (!hasBreakeven) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        {th
          ? 'กรุณากรอกต้นทุนคงที่รายเดือนและต้นทุนผันแปรต่อห้องเพื่อดูกราฟนี้'
          : 'Enter monthly fixed cost and variable cost per room to see this chart'}
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
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PAD_LEFT} y1={PAD_TOP + chartH} x2={PAD_LEFT + PLOT_W} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />

        {/* Y-axis ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={t.y} x2={PAD_LEFT - 4} y2={t.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PAD_LEFT - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
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

        {/* Fill segments */}
        {fillSegments.map((seg, i) => (
          <polygon key={i} points={seg.points} fill={seg.fill} />
        ))}

        {/* Breakeven line (red dashed) */}
        {breakevenPoints && (
          <polyline
            points={breakevenPoints}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="6,4"
          />
        )}

        {/* Actual RevPAR line (green solid) */}
        <polyline
          points={actualPoints}
          fill="none"
          stroke="#16a34a"
          strokeWidth="2"
        />
      </svg>

      {/* Below-chart stats */}
      <div style={{ marginTop: 10, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {belowCount > 0 && (
          <span style={{ color: '#6b7280' }}>
            {th
              ? `${belowCount} วันจาก 30 วันที่ RevPAR ต่ำกว่าจุดคุ้มทุน`
              : `${belowCount} of ${points.length} days below breakeven RevPAR`}
          </span>
        )}
        {consecutiveLast3 && (
          <span style={{ color: '#d97706', fontWeight: 500 }}>
            {th
              ? '⚠ RevPAR ต่ำกว่าจุดคุ้มทุน 3 วันติดต่อกัน'
              : '⚠ RevPAR below breakeven for 3 consecutive days'}
          </span>
        )}
        {todayDeficit != null && (
          <span style={{ color: '#ef4444' }}>
            {th
              ? `ขาดทุน ฿${Math.round(todayDeficit).toLocaleString()} ต่อห้องวันนี้เทียบกับจุดคุ้มทุน`
              : `Today: ฿${Math.round(todayDeficit).toLocaleString()} below breakeven per available room`}
          </span>
        )}
        {belowCount === 0 && (
          <span style={{ color: '#16a34a' }}>
            {th ? 'RevPAR อยู่เหนือจุดคุ้มทุนตลอด 30 วัน ✓' : 'RevPAR above breakeven for all 30 days ✓'}
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#16a34a" strokeWidth="2" /></svg>
          <span>{th ? 'RevPAR จริง' : 'Actual RevPAR'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6,4" /></svg>
          <span>{th ? 'RevPAR จุดคุ้มทุน' : 'Breakeven RevPAR'}</span>
        </div>
      </div>
    </div>
  );
}
