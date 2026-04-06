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
import { formatShortDate } from '../../utils/trends-headline';

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

export interface BreakevenPoint {
  date: string;
  actualRevpar: number;
  breakevenRevpar: number | null;
}

export function computeBreakevenSeries(
  dailyMetrics: DailyMetric[],
  roomsAvailable: number
): {
  points: BreakevenPoint[];
  hasBreakeven: boolean;
  costDataMissing: boolean;
  sortedSlice: DailyMetric[];
} {
  if (!dailyMetrics || dailyMetrics.length === 0) {
    return { points: [], hasBreakeven: false, costDataMissing: false, sortedSlice: [] };
  }

  const sorted = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  if (sorted.length === 0) {
    return { points: [], hasBreakeven: false, costDataMissing: false, sortedSlice: [] };
  }

  const costDataMissing = sorted.every(
    (m) =>
      m.monthlyFixedCost == null && (m.variableCostPerRoom == null || m.variableCostPerRoom === 0)
  );

  // Pre-scan to find the most recent non-null monthly_fixed_cost in the window.
  // This lets rows BEFORE the first entry backward-fill from the nearest known value,
  // which is the correct UX: if cost was entered once this month, all days use it.
  let lastMfc: number | null = null;
  for (const m of sorted) {
    if (m.monthlyFixedCost != null && m.monthlyFixedCost > 0) lastMfc = m.monthlyFixedCost;
  }

  const result: BreakevenPoint[] = [];
  let runningMfc = lastMfc;    // pre-init with most-recent known value (backward+forward fill)
  let runningVarCost = 0;      // pure forward-fill from 0; rows before first entry have no variable component

  for (const m of sorted) {
    if (m.monthlyFixedCost != null && m.monthlyFixedCost > 0) runningMfc = m.monthlyFixedCost;
    if (m.variableCostPerRoom != null && m.variableCostPerRoom > 0) runningVarCost = m.variableCostPerRoom;

    const rooms = roomsAvailable > 0 ? roomsAvailable : (m.roomsAvailable ?? 0);
    const revpar = rooms > 0 ? m.revenue / rooms : 0;

    let breakevenRevpar: number | null = null;
    if (runningMfc != null && runningMfc > 0 && rooms > 0) {
      const d = new Date(`${m.date}T12:00:00`);
      const dim = daysInMonth(d.getFullYear(), d.getMonth());
      const dailyFixed = runningMfc / dim;
      const dailyVariable = runningVarCost * (m.roomsSold ?? 0);
      const totalDailyCost = dailyFixed + dailyVariable;
      breakevenRevpar = totalDailyCost / rooms;
    }

    result.push({ date: m.date, actualRevpar: revpar, breakevenRevpar });
  }

  const anyBreakeven = result.some((p) => p.breakevenRevpar != null);
  return { points: result, hasBreakeven: anyBreakeven, costDataMissing, sortedSlice: sorted };
}

/** Problem / Recommendation for TrendChartCard — same inputs as the chart, no extra fetch. */
export function computeBreakevenProblemRecommendation(
  dailyMetrics: DailyMetric[],
  roomsAvailable: number,
  locale: 'en' | 'th'
): { problem: string; recommendation: string } | null {
  const { points, hasBreakeven, costDataMissing, sortedSlice } = computeBreakevenSeries(
    dailyMetrics,
    roomsAvailable
  );
  const th = locale === 'th';

  const fmt = (x: number) => `฿${Math.round(x).toLocaleString(th ? 'th-TH' : 'en-US')}`;

  if (costDataMissing) {
    return {
      problem: th
        ? 'คำนวณจุดคุ้มทุนไม่ได้ — กรุณากรอกต้นทุนคงที่ที่การเงินขั้นสูง'
        : 'Breakeven cannot be calculated — enter fixed costs in Advanced Finance',
      recommendation: th
        ? 'ไปที่ กรอกข้อมูล → การเงินขั้นสูง และกรอกต้นทุนคงที่รายเดือน'
        : 'Go to Enter Data → Advanced Finance and enter monthly fixed costs',
    };
  }

  if (points.length < 7 || !hasBreakeven) return null;

  const last = points[points.length - 1]!;
  const last3 = points.slice(-3);
  const consecutiveLast3 =
    last3.length === 3 &&
    last3.every((p) => p.breakevenRevpar != null && p.actualRevpar < p.breakevenRevpar!);

  const belowCount = points.filter(
    (p) => p.breakevenRevpar != null && p.actualRevpar < p.breakevenRevpar!
  ).length;

  const nPeriod = points.length;

  const lastMetric = sortedSlice[sortedSlice.length - 1];
  const roomsSold = lastMetric?.roomsSold ?? 0;
  const roomsAvail =
    roomsAvailable > 0 ? roomsAvailable : (lastMetric?.roomsAvailable ?? 0);

  if (consecutiveLast3 && last.breakevenRevpar != null) {
    return {
      problem: th
        ? `RevPAR ต่ำกว่าจุดคุ้มทุน 3 วันติดต่อกัน (${fmt(last.actualRevpar)} เทียบกับ ${fmt(last.breakevenRevpar)} จุดคุ้มทุน)`
        : `RevPAR has been below breakeven for 3 consecutive days (${fmt(last.actualRevpar)} vs ${fmt(last.breakevenRevpar)} breakeven)`,
      recommendation: th
        ? `ตรวจสอบราคาหรือลดต้นทุนผันแปรด่วน — ${belowCount} จาก ${nPeriod} วันต่ำกว่าจุดคุ้มทุนในช่วงนี้`
        : `Review pricing urgently or reduce variable costs — ${belowCount} of ${nPeriod} days were below breakeven this period`,
    };
  }

  if (last.breakevenRevpar != null && last.actualRevpar < last.breakevenRevpar) {
    const diff = last.breakevenRevpar - last.actualRevpar;
    let recLine: string;
    if (roomsSold > 0 && roomsAvail > 0) {
      const raw = ((last.breakevenRevpar - last.actualRevpar) * roomsAvail) / roomsSold;
      const rounded = Math.round(raw / 10) * 10;
      recLine = th
        ? `การเพิ่มราคาเฉลี่ย ${fmt(rounded)} ต่อห้องจะช่วยชดเชยกรณีที่ขาดวันนี้`
        : `A rate increase of ${fmt(rounded)} per room would recover today's shortfall`;
    } else {
      recLine = th
        ? 'เพิ่มการขายห้องหรือราคาเพื่อชดเชยกับจุดคุ้มทุน'
        : 'Increase occupancy or ADR to close the gap against breakeven';
    }
    return {
      problem: th
        ? `RevPAR วันนี้ (${fmt(last.actualRevpar)}) ต่ำกว่าจุดคุ้มทุน (${fmt(last.breakevenRevpar)}) ขาด ${fmt(diff)}`
        : `Today's RevPAR (${fmt(last.actualRevpar)}) is below breakeven (${fmt(last.breakevenRevpar)}) by ${fmt(diff)}`,
      recommendation: recLine,
    };
  }

  if (last.breakevenRevpar != null && last.actualRevpar >= last.breakevenRevpar) {
    return {
      problem: th
        ? 'RevPAR อยู่เหนือจุดคุ้มทุน — ควบคุมต้นทุนเพื่อรักษาระยะขอบกำไร'
        : 'RevPAR is above breakeven — monitor cost discipline to protect the margin',
      recommendation: th
        ? `${belowCount} จาก ${nPeriod} วันต่ำกว่าจุดคุ้มทุนในช่วงนี้ — รักษานโยบายราคาปัจจุบัน`
        : `${belowCount} of ${nPeriod} days were below breakeven this period — maintain current pricing discipline`,
    };
  }

  return null;
}

export interface BreakevenRevParChartProps {
  dailyMetrics: DailyMetric[];
  roomsAvailable: number;
  locale?: 'th' | 'en';
  height?: number;
}

export function BreakevenRevParChart({
  dailyMetrics,
  roomsAvailable,
  locale = 'en',
  height = HEIGHT,
}: BreakevenRevParChartProps) {
  const th = locale === 'th';

  const { points, hasBreakeven } = useMemo(
    () => computeBreakevenSeries(dailyMetrics, roomsAvailable),
    [dailyMetrics, roomsAvailable]
  );

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

  // X-axis ticks — same date style as DecisionTrendChart (formatShortDate from trends-headline)
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
      <div
        style={{
          padding: '20px 16px',
          borderRadius: 8,
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
          {th ? 'ไม่มีข้อมูลเส้นจุดคุ้มทุน' : 'Breakeven line unavailable'}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
          {th
            ? 'กรอกต้นทุนคงที่รายเดือนที่ กรอกข้อมูล → การเงินขั้นสูง เพื่อดู RevPAR จุดคุ้มทุน'
            : 'Enter your monthly fixed costs in Enter Data → Advanced Finance to see your breakeven RevPAR.'}
        </p>
        <a
          href="../enter-data"
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 500,
            color: '#2563eb',
            textDecoration: 'none',
            padding: '5px 12px',
            border: '1px solid #bfdbfe',
            borderRadius: 6,
            background: '#eff6ff',
          }}
        >
          {th ? 'ไปที่ กรอกข้อมูล' : 'Go to Enter Data'}
        </a>
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

        {/* Left Y-axis unit — matches DecisionTrendChart / AdrOpportunityBandChart (fontSize 11, #9ca3af) */}
        <text x={PAD_LEFT - 2} y={PAD_TOP - 2} textAnchor="end" fontSize="11" fill="#9ca3af">
          (฿)
        </text>

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
