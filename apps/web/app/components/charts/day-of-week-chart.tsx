/**
 * DayOfWeekChart — bar chart Mon–Sun with optional weekend highlight.
 * values and dates must align; aggregates by day of week (0=Sun..6=Sat) then displays Mon first.
 */
'use client';

import { useMemo } from 'react';
import { getDayOfWeek } from '../../utils/trends-headline';
import { getWeekendStyle } from '../../utils/chart-weekend';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AXIS_COLOR = '#eee';
const BAR_COLOR = '#6366f1';
const PAD_LEFT = 32;
const PAD_RIGHT = 16;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;
const DEFAULT_HEIGHT = 160;

interface DayOfWeekChartProps {
  values: number[];
  dates: string[];
  /** Highlight Sat/Sun bars */
  highlightWeekend?: boolean;
  formatValue?: (v: number) => string;
  emptyMessage?: string;
  height?: number;
}

/** Map JS getDay(): 0=Sun, 1=Mon, ... 6=Sat → index 0=Mon, 1=Tue, ... 6=Sun */
function toMonFirst(dow: number): number {
  return dow === 0 ? 6 : dow - 1;
}

export function DayOfWeekChart({
  values,
  dates,
  highlightWeekend = true,
  formatValue = (v) => String(Math.round(v)),
  emptyMessage = 'No data',
  height = DEFAULT_HEIGHT,
}: DayOfWeekChartProps) {
  const bars = useMemo(() => {
    if (!values.length || !dates.length || values.length !== dates.length) return null;
    const sums: number[] = new Array(7).fill(0);
    const counts: number[] = new Array(7).fill(0);
    values.forEach((v, i) => {
      const dow = getDayOfWeek(dates[i]!);
      const idx = toMonFirst(dow);
      sums[idx] += v;
      counts[idx] += 1;
    });
    return sums.map((s, i) => ({ avg: counts[i] ? s / counts[i] : 0, isWeekend: i >= 5 }));
  }, [values, dates]);

  const maxVal = useMemo(() => (bars ? Math.max(...bars.map((b) => b.avg), 1) : 1), [bars]);
  const weekendStyle = useMemo(() => getWeekendStyle(), []);
  const chartWidth = 400;
  const chartHeight = height - PAD_TOP - PAD_BOTTOM;
  const barW = (chartWidth - PAD_LEFT - PAD_RIGHT) / 7;
  const gap = barW * 0.2;
  const tickCount = 4;
  const yTicks = useMemo(() => {
    const out: { v: number; y: number }[] = [];
    for (let i = 0; i <= tickCount; i++) {
      const v = (maxVal * (tickCount - i)) / tickCount;
      const y = height - PAD_BOTTOM - (chartHeight * (tickCount - i)) / tickCount;
      out.push({ v, y });
    }
    return out;
  }, [maxVal, chartHeight]);

  if (!bars || bars.every((b) => b.avg === 0)) {
    return (
      <div style={{ height: '100%', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', minHeight: 220 }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMidYMid meet">
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={height - PAD_BOTTOM} stroke={AXIS_COLOR} strokeWidth="1" />
        <line x1={PAD_LEFT} y1={height - PAD_BOTTOM} x2={chartWidth - PAD_RIGHT} y2={height - PAD_BOTTOM} stroke={AXIS_COLOR} strokeWidth="1" />
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={t.y} x2={PAD_LEFT - 4} y2={t.y} stroke={AXIS_COLOR} strokeWidth="1" />
            <text x={PAD_LEFT - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {formatValue(t.v)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = PAD_LEFT + i * barW + gap / 2;
          const h = maxVal > 0 ? (b.avg / maxVal) * chartHeight : 0;
          const y = height - PAD_BOTTOM - h;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW - gap}
                height={h}
                fill={highlightWeekend && b.isWeekend ? weekendStyle.backgroundColor : BAR_COLOR}
                stroke={highlightWeekend && b.isWeekend ? weekendStyle.borderColor : 'none'}
                strokeWidth={highlightWeekend && b.isWeekend ? 0.85 : 0}
                opacity={highlightWeekend && b.isWeekend ? 1 : 0.7}
              />
              <text x={x + (barW - gap) / 2} y={height - PAD_BOTTOM + 14} textAnchor="middle" fontSize="10" fill="#6b7280">
                {DAY_LABELS[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
