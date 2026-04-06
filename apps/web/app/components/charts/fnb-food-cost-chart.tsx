'use client';

/**
 * F&B Food Cost % by Week — last 8 complete weeks
 *
 * Stacked side-by-side bars per week:
 *   - Green bar:  Food & Bev %  = foodBevAmount / weeklyRevenue × 100
 *   - Amber bar:  Non-food %    = nonFoodAmount / weeklyRevenue × 100
 *
 * Reference band: 28–35% target zone (light amber fill).
 * Uses no external charting library — pure SVG.
 */

import { useMemo } from 'react';

const PAD_LEFT = 44;
const PAD_RIGHT = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const HEIGHT = CHART_HEIGHT + PAD_TOP + PAD_BOTTOM;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;

const Y_MAX = 60; // axis max %
const Y_TICKS = [0, 20, 40, 60];

const TARGET_LO = 28;
const TARGET_HI = 35;

const COLOR_FOOD = '#16a34a';   // green-600
const COLOR_SUPPLY = '#d97706'; // amber-600

function formatWeekLabel(mondayIso: string): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export interface FnbFoodCostChartProps {
  /** Weekly aggregated purchase data */
  weeklyData: Array<{
    weekStart: string;       // YYYY-MM-DD Monday
    foodBevAmount: number;
    nonFoodAmount: number;
    weeklyRevenue: number;
  }>;
  locale?: 'th' | 'en';
  emptyMessage?: string;
}

export function FnbFoodCostChart({
  weeklyData,
  locale = 'en',
  emptyMessage,
}: FnbFoodCostChartProps) {
  const th = locale === 'th';

  // Filter to weeks that have revenue, take last 8
  const validWeeks = useMemo(
    () => weeklyData.filter((w) => w.weeklyRevenue > 0).slice(-8),
    [weeklyData]
  );

  const hasData = validWeeks.length > 0;

  // Coordinate helpers
  const toY = (pct: number) =>
    PAD_TOP + CHART_HEIGHT - (Math.min(pct, Y_MAX) / Y_MAX) * CHART_HEIGHT;

  const n = validWeeks.length;
  // Each week group contains 2 bars; total slots = n * 2.5 gives natural padding
  const barWidth = n > 0 ? PLOT_W / (n * 2.5) : 0;
  const groupWidth = n > 0 ? PLOT_W / n : 0;

  // X centre of a given bar (weekIdx, barOffset 0=food, 1=supply)
  const toBarX = (weekIdx: number, barOffset: number) => {
    const groupCentre = PAD_LEFT + (weekIdx + 0.5) * groupWidth;
    // two bars side by side, centred in the group
    const totalBarWidth = barWidth * 2 + 2; // 2px gap between bars
    const barStart = groupCentre - totalBarWidth / 2;
    return barStart + barOffset * (barWidth + 2);
  };

  // Y-axis tick label
  const tickLabel = (v: number) => `${v}%`;

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

  return (
    <div style={{ width: '100%' }}>
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible' }}
      >
        {/* Target band 28–35% — drawn before bars */}
        <rect
          x={PAD_LEFT}
          y={toY(TARGET_HI)}
          width={PLOT_W}
          height={toY(TARGET_LO) - toY(TARGET_HI)}
          fill="#f59e0b"
          fillOpacity={0.15}
        />

        {/* Axes */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={PAD_TOP + CHART_HEIGHT}
          stroke="#e5e7eb"
          strokeWidth="1"
        />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + CHART_HEIGHT}
          x2={PAD_LEFT + PLOT_W}
          y2={PAD_TOP + CHART_HEIGHT}
          stroke="#e5e7eb"
          strokeWidth="1"
        />

        {/* Y-axis label */}
        <text x={PAD_LEFT - 2} y={PAD_TOP - 2} textAnchor="end" fontSize="11" fill="#9ca3af">
          (%)
        </text>

        {/* Y-axis ticks */}
        {Y_TICKS.map((v) => {
          const y = toY(v);
          return (
            <g key={v}>
              <line x1={PAD_LEFT} y1={y} x2={PAD_LEFT - 4} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                {tickLabel(v)}
              </text>
            </g>
          );
        })}

        {/* Horizontal grid lines at ticks */}
        {Y_TICKS.slice(1).map((v) => (
          <line
            key={`grid-${v}`}
            x1={PAD_LEFT}
            y1={toY(v)}
            x2={PAD_LEFT + PLOT_W}
            y2={toY(v)}
            stroke="#f3f4f6"
            strokeWidth="1"
          />
        ))}

        {/* Bars */}
        {validWeeks.map((week, wi) => {
          const foodPct = Math.min((week.foodBevAmount / week.weeklyRevenue) * 100, Y_MAX);
          const supplyPct = Math.min((week.nonFoodAmount / week.weeklyRevenue) * 100, Y_MAX);

          const foodBarH = (foodPct / Y_MAX) * CHART_HEIGHT;
          const supplyBarH = (supplyPct / Y_MAX) * CHART_HEIGHT;

          const xFood = toBarX(wi, 0);
          const xSupply = toBarX(wi, 1);
          const baseY = PAD_TOP + CHART_HEIGHT;

          return (
            <g key={week.weekStart}>
              {/* Food & Bev bar */}
              {foodPct > 0 && (
                <rect
                  x={xFood}
                  y={baseY - foodBarH}
                  width={barWidth}
                  height={foodBarH}
                  fill={COLOR_FOOD}
                  rx={1}
                />
              )}
              {/* Non-food / Supplies bar */}
              {supplyPct > 0 && (
                <rect
                  x={xSupply}
                  y={baseY - supplyBarH}
                  width={barWidth}
                  height={supplyBarH}
                  fill={COLOR_SUPPLY}
                  rx={1}
                />
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {validWeeks.map((week, wi) => {
          const groupCentre = PAD_LEFT + (wi + 0.5) * groupWidth;
          return (
            <g key={`xlabel-${week.weekStart}`}>
              <line
                x1={groupCentre}
                y1={PAD_TOP + CHART_HEIGHT}
                x2={groupCentre}
                y2={PAD_TOP + CHART_HEIGHT + 4}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={groupCentre}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#9ca3af"
              >
                {formatWeekLabel(week.weekStart)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="10" height="10">
            <circle cx="5" cy="5" r="5" fill={COLOR_FOOD} />
          </svg>
          <span>{th ? 'อาหาร/เครื่องดื่ม' : 'Food & Bev'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="10" height="10">
            <circle cx="5" cy="5" r="5" fill={COLOR_SUPPLY} />
          </svg>
          <span>{th ? 'วัสดุ' : 'Supplies'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400e' }}>
          <svg width="16" height="10">
            <rect x="0" y="2" width="16" height="6" fill="#f59e0b" fillOpacity={0.3} rx="1" />
          </svg>
          <span>{th ? 'เป้า 28–35%' : 'Target 28–35%'}</span>
        </div>
      </div>
    </div>
  );
}
