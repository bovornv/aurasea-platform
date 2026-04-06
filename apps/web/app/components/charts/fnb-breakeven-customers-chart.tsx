'use client';

/**
 * Actual Customers vs. Breakeven Customers — last 30 days
 *
 * Adapted from breakeven-revpar-chart.tsx.
 *   - Blue solid line:  actual customers
 *   - Red dashed line:  breakeven customers
 *   - Green fill (0.12 opacity): segments where actual >= breakeven
 *   - Red fill   (0.12 opacity): segments where actual < breakeven
 *   - Weekend bands: light-grey vertical bands for Sat–Sun
 *
 * Uses no external charting library — pure SVG.
 */

import { useMemo } from 'react';
import {
  computeTimeSeriesWeekendBands,
  getWeekendStyle,
  CHART_WEEKEND_BAND_STROKE_WIDTH,
} from '../../utils/chart-weekend';
import { formatShortDate } from '../../utils/trends-headline';

const PAD_LEFT = 44;
const PAD_RIGHT = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const HEIGHT = CHART_HEIGHT + PAD_TOP + PAD_BOTTOM;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;

const COLOR_ACTUAL = '#2563eb';    // blue-600
const COLOR_BREAKEVEN = '#ef4444'; // red-500

export interface FnbBreakevenCustomersChartProps {
  /** Array of daily data points */
  points: Array<{
    date: string;                      // YYYY-MM-DD
    actualCustomers: number;
    breakevenCustomers: number | null;
  }>;
  locale?: 'th' | 'en';
  emptyMessage?: string;
}

export function FnbBreakevenCustomersChart({
  points,
  locale = 'en',
  emptyMessage,
}: FnbBreakevenCustomersChartProps) {
  const th = locale === 'th';

  const hasBreakeven = points.some((p) => p.breakevenCustomers != null);
  const hasData = points.length > 0;

  const chartH = CHART_HEIGHT;

  // Y scale: 0 → nice ceiling above max customer value
  const { yMax, toY, toX } = useMemo(() => {
    if (points.length === 0) return { yMax: 1, toY: () => PAD_TOP, toX: () => PAD_LEFT };

    const allVals = [
      ...points.map((p) => p.actualCustomers),
      ...points.map((p) => p.breakevenCustomers ?? 0),
    ].filter((v) => isFinite(v));

    const dataMax = Math.max(...allVals, 1);
    // Round up to a nice number (next multiple of a clean step)
    const rawMax = dataMax * 1.1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const niceFactor = rawMax / magnitude <= 2 ? 2 : rawMax / magnitude <= 5 ? 5 : 10;
    const yMax = Math.ceil(rawMax / (magnitude * niceFactor / 5)) * (magnitude * niceFactor / 5);

    const n = points.length;
    const toY = (v: number) => PAD_TOP + chartH - (v / yMax) * chartH;
    const toX = (i: number) => PAD_LEFT + (i / Math.max(1, n - 1)) * PLOT_W;
    return { yMax, toY, toX };
  }, [points, chartH]);

  // Polyline point strings
  const actualPointStr = points.map((p, i) => `${toX(i)},${toY(p.actualCustomers)}`).join(' ');

  const breakevenPointStr = points
    .map((p, i) => (p.breakevenCustomers != null ? `${toX(i)},${toY(p.breakevenCustomers)}` : null))
    .filter(Boolean)
    .join(' ');

  // Fill segments between the two lines
  const fillSegments = useMemo(() => {
    if (!hasBreakeven || points.length < 2) return [];
    const segs: Array<{ points: string; fill: string }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i]!;
      const p1 = points[i + 1]!;
      if (p0.breakevenCustomers == null || p1.breakevenCustomers == null) continue;
      const x0 = toX(i);
      const x1 = toX(i + 1);
      const above =
        p0.actualCustomers + p1.actualCustomers >=
        p0.breakevenCustomers + p1.breakevenCustomers;
      const polygon = [
        `${x0},${toY(p0.actualCustomers)}`,
        `${x1},${toY(p1.actualCustomers)}`,
        `${x1},${toY(p1.breakevenCustomers)}`,
        `${x0},${toY(p0.breakevenCustomers)}`,
      ].join(' ');
      segs.push({
        points: polygon,
        fill: above ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      });
    }
    return segs;
  }, [hasBreakeven, points, toX, toY]);

  // Weekend bands
  const dates = points.map((p) => p.date);
  const weekendStyle = getWeekendStyle();
  const weekendBands = computeTimeSeriesWeekendBands(points.length, dates, PAD_LEFT, PLOT_W);

  // Y-axis ticks — 4 evenly spaced
  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => ({
      v: Math.round((yMax * i) / count),
      y: PAD_TOP + chartH - (i / count) * chartH,
    }));
  }, [yMax, chartH]);

  // X-axis ticks — every ~5 days
  const xTicks = useMemo(() => {
    if (points.length < 2) return [];
    const n = points.length;
    const step = Math.max(1, Math.round(n / 6));
    const indices: number[] = [];
    for (let k = 0; k < n; k += step) indices.push(k);
    if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    return [...new Set(indices)].map((idx) => ({
      idx,
      x: toX(idx),
      label: formatShortDate(points[idx]!.date),
    }));
  }, [points, toX]);

  // Below-chart stats
  const { belowCount, consecutiveLast3, todayDeficit } = useMemo(() => {
    if (!hasBreakeven || points.length === 0) {
      return { belowCount: 0, consecutiveLast3: false, todayDeficit: null };
    }
    const belowCount = points.filter(
      (p) => p.breakevenCustomers != null && p.actualCustomers < p.breakevenCustomers
    ).length;
    const last3 = points.slice(-3);
    const consecutiveLast3 =
      last3.length === 3 &&
      last3.every(
        (p) => p.breakevenCustomers != null && p.actualCustomers < p.breakevenCustomers
      );
    const last = points[points.length - 1];
    const todayDeficit =
      last && last.breakevenCustomers != null && last.actualCustomers < last.breakevenCustomers
        ? last.breakevenCustomers - last.actualCustomers
        : null;
    return { belowCount, consecutiveLast3, todayDeficit };
  }, [hasBreakeven, points]);

  // Empty / insufficient data states
  if (!hasData) {
    return (
      <div
        style={{
          height: HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: 13,
        }}
      >
        {emptyMessage ?? (th ? 'ไม่มีข้อมูล' : 'No data')}
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
            ? 'กรอกต้นทุนคงที่รายเดือนที่ กรอกข้อมูล → การเงินขั้นสูง เพื่อดูจำนวนลูกค้าจุดคุ้มทุน'
            : 'Enter your monthly fixed costs in Enter Data → Advanced Finance to see your breakeven customer count.'}
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
        height={HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${HEIGHT}`}
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
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={PAD_TOP + chartH}
          stroke="#e5e7eb"
          strokeWidth="1"
        />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + chartH}
          x2={PAD_LEFT + PLOT_W}
          y2={PAD_TOP + chartH}
          stroke="#e5e7eb"
          strokeWidth="1"
        />

        {/* Y-axis unit label */}
        <text x={PAD_LEFT - 2} y={PAD_TOP - 2} textAnchor="end" fontSize="11" fill="#9ca3af">
          (pax)
        </text>

        {/* Y-axis ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              y1={t.y}
              x2={PAD_LEFT - 4}
              y2={t.y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text x={PAD_LEFT - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {t.v >= 1000 ? `${Math.round(t.v / 1000)}k` : t.v}
            </text>
          </g>
        ))}

        {/* X-axis ticks */}
        {xTicks.map((t) => (
          <g key={t.idx}>
            <line
              x1={t.x}
              y1={PAD_TOP + chartH}
              x2={t.x}
              y2={PAD_TOP + chartH + 4}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text
              x={t.x}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#9ca3af"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Fill segments between lines */}
        {fillSegments.map((seg, i) => (
          <polygon key={i} points={seg.points} fill={seg.fill} />
        ))}

        {/* Breakeven line (red dashed) */}
        {breakevenPointStr && (
          <polyline
            points={breakevenPointStr}
            fill="none"
            stroke={COLOR_BREAKEVEN}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Actual customers line (blue solid) */}
        <polyline
          points={actualPointStr}
          fill="none"
          stroke={COLOR_ACTUAL}
          strokeWidth="2"
        />
      </svg>

      {/* Below-chart stats */}
      <div
        style={{ marginTop: 10, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {belowCount > 0 && (
          <span style={{ color: '#6b7280' }}>
            {th
              ? `${belowCount} วันจาก ${points.length} วันที่ลูกค้าต่ำกว่าจุดคุ้มทุน`
              : `${belowCount} of ${points.length} days below breakeven customers`}
          </span>
        )}
        {consecutiveLast3 && (
          <span style={{ color: '#d97706', fontWeight: 500 }}>
            {th
              ? '⚠ ลูกค้าต่ำกว่าจุดคุ้มทุน 3 วันติดต่อกัน'
              : '⚠ Customers below breakeven for 3 consecutive days'}
          </span>
        )}
        {todayDeficit != null && (
          <span style={{ color: '#ef4444' }}>
            {th
              ? `ขาด ${Math.round(todayDeficit).toLocaleString()} คนวันนี้เทียบกับจุดคุ้มทุน`
              : `Today: ${Math.round(todayDeficit).toLocaleString()} customers short of breakeven`}
          </span>
        )}
        {belowCount === 0 && (
          <span style={{ color: '#16a34a' }}>
            {th
              ? 'ลูกค้าอยู่เหนือจุดคุ้มทุนตลอด 30 วัน ✓'
              : 'Customers above breakeven for all days ✓'}
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8">
            <line x1="0" y1="4" x2="24" y2="4" stroke={COLOR_ACTUAL} strokeWidth="2" />
          </svg>
          <span>{th ? 'ลูกค้าจริง' : 'Actual Customers'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8">
            <line
              x1="0"
              y1="4"
              x2="24"
              y2="4"
              stroke={COLOR_BREAKEVEN}
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </svg>
          <span>{th ? 'จุดคุ้มทุน' : 'Breakeven'}</span>
        </div>
      </div>
    </div>
  );
}
