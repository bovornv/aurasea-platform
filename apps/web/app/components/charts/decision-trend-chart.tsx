/**
 * DecisionTrendChart — single or dual-axis line chart with minimal axis,
 * weekend shading (Sat/Sun), optional dashed baseline (7d rolling avg), and insight tooltip.
 */
'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { rolling7Avg, formatShortDate } from '../../utils/trends-headline';
import {
  getWeekendStyle,
  computeTimeSeriesWeekendBands,
  CHART_WEEKEND_BAND_STROKE_WIDTH,
  isWeekend,
} from '../../utils/chart-weekend';

const AXIS_COLOR = '#eee';
const BASELINE_COLOR = '#9ca3af';
const PAD_LEFT = 40;
const PAD_RIGHT = 40;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;
const HEIGHT = 200;
const X_TICK_MAX = 7;

function seriesMean(arr: number[]): number {
  const ok = arr.filter((x) => Number.isFinite(x));
  if (!ok.length) return 0;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

function pctVsAvg(value: number, avg: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(avg) || avg === 0) return null;
  return ((value - avg) / avg) * 100;
}

function formatBaht(v: number, loc: 'en' | 'th'): string {
  return `฿${Math.round(v).toLocaleString(loc === 'th' ? 'th-TH' : 'en-US')}`;
}

function formatTooltipDate(dateStr: string, loc: 'en' | 'th'): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(loc === 'th' ? 'th-TH' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function showInsightSeries(
  series: number[] | undefined,
  values: number[],
  valuesRight: number[] | undefined
): series is number[] {
  if (!series || series.length !== values.length) return false;
  if (series === values || series === valuesRight) return false;
  return true;
}

function shortAxisLabel(full?: string): string {
  if (!full) return '';
  const p = full.indexOf('(');
  return p > 0 ? full.slice(0, p).trim() : full;
}

function isRevenueLabel(label?: string): boolean {
  if (!label) return false;
  return /revenue|รายได้|revpar|ต่อห้อง/i.test(label);
}

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
  /** Small label near left axis (11–12px muted). e.g. "Occupancy (%)" */
  leftLabel?: string;
  /** Small label near right axis. e.g. "ADR (฿)" */
  rightLabel?: string;
  emptyMessage?: string;
  /** Left (primary) series stroke width */
  strokeWidthLeft?: number;
  /** Right (secondary) series stroke width in dual-axis mode */
  strokeWidthRight?: number;
  /** Tooltip + copy */
  locale?: 'en' | 'th';
  /** Same length as values — shown in tooltip when not already the plotted left/right series */
  insightRevenue?: number[];
  insightCustomers?: number[];
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
  leftLabel,
  rightLabel,
  emptyMessage = 'No data',
  strokeWidthLeft = 2,
  strokeWidthRight = 2,
  locale = 'en',
  insightRevenue,
  insightCustomers,
}: DecisionTrendChartProps) {
  const hasData = values && values.length >= 2;
  const dualAxis = hasData && valuesRight && valuesRight.length === values.length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; anchorPx: number } | null>(null);

  const chartWidth = useMemo(() => 600, []);
  const chartHeight = height - PAD_TOP - PAD_BOTTOM;
  const plotLeft = PAD_LEFT;
  const plotRight = chartWidth - PAD_RIGHT;
  const plotW = plotRight - plotLeft;

  const avgLeft = useMemo(() => seriesMean(values), [values]);
  const avgRight = useMemo(() => (valuesRight ? seriesMean(valuesRight) : null), [valuesRight]);
  const avgInsightR = useMemo(
    () => (insightRevenue && insightRevenue.length === values.length ? seriesMean(insightRevenue) : null),
    [insightRevenue, values.length]
  );
  const avgInsightC = useMemo(
    () => (insightCustomers && insightCustomers.length === values.length ? seriesMean(insightCustomers) : null),
    [insightCustomers, values.length]
  );

  const showRevInsight = showInsightSeries(insightRevenue, values, valuesRight);
  const showCustInsight = showInsightSeries(insightCustomers, values, valuesRight);

  const labels = useMemo(
    () => ({
      weekend: locale === 'th' ? 'สุดสัปดาห์' : 'Weekend',
      revenue: locale === 'th' ? 'รายได้' : 'Revenue',
      customers: locale === 'th' ? 'ลูกค้า' : 'Customers',
      vsAvg: (pct: number) =>
        locale === 'th'
          ? `${pct >= 0 ? '+' : ''}${Math.round(pct)}% เทียบค่าเฉลี่ย`
          : `${pct >= 0 ? '+' : ''}${Math.round(pct)}% vs avg`,
    }),
    [locale]
  );

  const updateHoverFromClientX = useCallback(
    (clientX: number) => {
      const wrap = wrapRef.current;
      if (!wrap || !hasData) return;
      const rect = wrap.getBoundingClientRect();
      const w = rect.width;
      if (w <= 0) return;
      const xFrac = (clientX - rect.left) / w;
      const leftF = plotLeft / chartWidth;
      const rightF = plotRight / chartWidth;
      if (xFrac < leftF || xFrac > rightF) {
        setHover(null);
        return;
      }
      const n = values.length;
      const t = (xFrac - leftF) / (rightF - leftF);
      const idx = Math.round(t * (n - 1));
      const index = Math.max(0, Math.min(n - 1, idx));
      const anchorPx = clientX - rect.left;
      setHover({ index, anchorPx });
    },
    [hasData, values.length, plotLeft, plotRight, chartWidth]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      updateHoverFromClientX(e.clientX);
    },
    [updateHoverFromClientX]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) updateHoverFromClientX(t.clientX);
    },
    [updateHoverFromClientX]
  );

  const clearHover = useCallback(() => setHover(null), []);

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

  const weekendStyle = useMemo(() => getWeekendStyle(), []);
  const weekendBands = useMemo(
    () => computeTimeSeriesWeekendBands(values.length, dates, plotLeft, plotW),
    [dates, values.length, plotLeft, plotW]
  );

  const xAxisTicks = useMemo(() => {
    if (!hasData || !dates.length || dates.length !== values.length) return [];
    const n = values.length;
    const count = Math.min(X_TICK_MAX, Math.max(1, n));
    const indices: number[] = [];
    if (count === 1) {
      indices.push(0);
    } else {
      for (let k = 0; k < count; k++) {
        indices.push(Math.round((k * (n - 1)) / (count - 1)));
      }
    }
    return indices.map((idx) => ({
      idx,
      x: plotLeft + (idx / Math.max(1, n - 1)) * plotW,
      label: formatShortDate(dates[idx]!),
    }));
  }, [hasData, dates, values.length, plotLeft, plotW]);

  const crosshairX =
    hover != null && hasData
      ? plotLeft + (hover.index / Math.max(1, values.length - 1)) * plotW
      : null;

  const tooltipBody = useMemo(() => {
    if (hover == null || !hasData) return null;
    const i = hover.index;
    const dateStr = dates[i];
    const vL = values[i] ?? 0;
    const vR = valuesRight?.[i];
    const pctL = pctVsAvg(vL, avgLeft);
    const pctR = vR != null && avgRight != null ? pctVsAvg(vR, avgRight) : null;
    const revI = showRevInsight ? insightRevenue![i] : null;
    const custI = showCustInsight ? insightCustomers![i] : null;
    const pctRevI = revI != null && avgInsightR != null ? pctVsAvg(revI, avgInsightR) : null;
    const pctCustI = custI != null && avgInsightC != null ? pctVsAvg(custI, avgInsightC) : null;
    const weekend = dateStr ? isWeekend(dateStr) : false;

    const vsStyle = (pct: number | null) => {
      if (pct == null) return { color: '#9ca3af' as const };
      if (pct > 0.5) return { color: '#059669' as const };
      if (pct < -0.5) return { color: '#dc2626' as const };
      return { color: '#6b7280' as const };
    };

    const Row = ({
      name,
      valueStr,
      pct,
    }: {
      name: string;
      valueStr: string;
      pct: number | null;
    }) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{name}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', textAlign: 'right' }}>{valueStr}</span>
        </div>
        {pct != null ? (
          <div style={{ fontSize: 10, ...vsStyle(pct), textAlign: 'right' }}>{labels.vsAvg(pct)}</div>
        ) : null}
      </div>
    );

    return (
      <div
        style={{
          pointerEvents: 'none',
          minWidth: 168,
          maxWidth: 280,
          padding: '10px 12px',
          borderRadius: 8,
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
            {dateStr ? formatTooltipDate(dateStr, locale) : '—'}
          </span>
          {weekend ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#4b5563',
                backgroundColor: '#f3f4f6',
                padding: '2px 6px',
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              {labels.weekend}
            </span>
          ) : null}
        </div>
        <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0 2px' }} />
        <Row
          name={shortAxisLabel(leftLabel) || '—'}
          valueStr={isRevenueLabel(leftLabel) ? formatBaht(vL, locale) : formatLeft(vL)}
          pct={pctL}
        />
        {dualAxis && vR != null && rightLabel ? (
          <Row
            name={shortAxisLabel(rightLabel)}
            valueStr={isRevenueLabel(rightLabel) ? formatBaht(vR, locale) : formatRight(vR)}
            pct={pctR}
          />
        ) : null}
        {showRevInsight && revI != null ? (
          <Row name={labels.revenue} valueStr={formatBaht(revI, locale)} pct={pctRevI} />
        ) : null}
        {showCustInsight && custI != null ? (
          <Row name={labels.customers} valueStr={Math.round(custI).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US')} pct={pctCustI} />
        ) : null}
      </div>
    );
  }, [
    hover,
    hasData,
    dates,
    values,
    valuesRight,
    dualAxis,
    avgLeft,
    avgRight,
    avgInsightR,
    avgInsightC,
    showRevInsight,
    showCustInsight,
    insightRevenue,
    insightCustomers,
    formatLeft,
    formatRight,
    leftLabel,
    rightLabel,
    locale,
    labels,
  ]);

  if (!hasData) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', height, width: '100%', overflow: 'visible' }}
      onMouseLeave={clearHover}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
        {weekendBands?.map((b, i) => (
          <rect
            key={i}
            x={b.x1}
            y={PAD_TOP}
            width={Math.max(0, b.x2 - b.x1)}
            height={chartHeight}
            fill={weekendStyle.backgroundColor}
            stroke={weekendStyle.borderColor}
            strokeWidth={CHART_WEEKEND_BAND_STROKE_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1={plotLeft} y1={PAD_TOP} x2={plotLeft} y2={PAD_TOP + chartHeight} stroke={AXIS_COLOR} strokeWidth="1" />
        <line x1={plotLeft} y1={PAD_TOP + chartHeight} x2={plotRight} y2={PAD_TOP + chartHeight} stroke={AXIS_COLOR} strokeWidth="1" />
        {xAxisTicks.map((t, i) => (
          <g key={i}>
            <line x1={t.x} y1={PAD_TOP + chartHeight} x2={t.x} y2={PAD_TOP + chartHeight + 4} stroke={AXIS_COLOR} strokeWidth="1" />
            <text x={t.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {t.label}
            </text>
          </g>
        ))}
        {leftLabel ? (
          <text x={plotLeft - 2} y={PAD_TOP - 2} textAnchor="end" fontSize="11" fill="#9ca3af">
            {leftLabel}
          </text>
        ) : null}
        {ticksL.map((t, i) => (
          <g key={i}>
            <line x1={plotLeft} y1={t.y} x2={plotLeft - 4} y2={t.y} stroke={AXIS_COLOR} strokeWidth="1" />
            <text x={plotLeft - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {formatLeft(t.v)}
            </text>
          </g>
        ))}
        {dualAxis && ticksR.length > 0 && (
          <>
            {rightLabel ? (
              <text x={plotRight + 2} y={PAD_TOP - 2} textAnchor="start" fontSize="11" fill="#9ca3af">
                {rightLabel}
              </text>
            ) : null}
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
        {baselinePoints && (
          <polyline points={baselinePoints} fill="none" stroke={BASELINE_COLOR} strokeWidth="1" strokeDasharray="4,4" />
        )}
        <polyline points={pointsL} fill="none" stroke={color} strokeWidth={strokeWidthLeft} />
        {dualAxis && pointsR && (
          <polyline points={pointsR} fill="none" stroke={colorRight} strokeWidth={strokeWidthRight} />
        )}
        {crosshairX != null && (
          <line
            x1={crosshairX}
            x2={crosshairX}
            y1={PAD_TOP}
            y2={PAD_TOP + chartHeight}
            stroke="#d1d5db"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        <rect
          x={plotLeft}
          y={PAD_TOP}
          width={plotW}
          height={chartHeight}
          fill="transparent"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onMouseMove={onMouseMove}
          onTouchStart={onTouchMove}
          onTouchMove={onTouchMove}
          onTouchEnd={clearHover}
        />
      </svg>
      {hover != null && tooltipBody ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(
              Math.max(hover.anchorPx, 56),
              (wrapRef.current?.getBoundingClientRect().width ?? 0) - 56
            ),
            top: 4,
            transform: 'translateX(-50%)',
            zIndex: 20,
          }}
        >
          {tooltipBody}
        </div>
      ) : null}
    </div>
  );
}
