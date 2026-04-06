/**
 * FnbFoodCostMiniChart — compact 4-week food cost % bar chart.
 * Self-contained: fetches its own data from fnb_purchase_log + fnb_daily_metrics.
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { formatShortDate } from '../../utils/trends-headline';

const PAD_LEFT = 32;
const PAD_RIGHT = 10;
const PAD_TOP = 8;
const PAD_BOTTOM = 22;
const CHART_W = 500;
const CHART_H = 112;
const SVG_H = CHART_H + PAD_TOP + PAD_BOTTOM;

const SIGNAL_COLORS = { green: '#16a34a', amber: '#d97706', red: '#ef4444', info: '#6b7280' };

interface WeekPoint {
  weekStart: string;
  foodCostPct: number | null;
  isCurrentWeek: boolean;
  daysWithData: number;
}

function getMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - offset);
  return monday.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function barColor(pct: number): string {
  if (pct <= 28) return '#16a34a';
  if (pct <= 35) return '#4ade80';
  if (pct <= 45) return '#d97706';
  return '#ef4444';
}

export interface FnbFoodCostMiniChartProps {
  branchId: string;
  locale?: 'en' | 'th';
}

export function FnbFoodCostMiniChart({ branchId, locale = 'en' }: FnbFoodCostMiniChartProps) {
  const th = locale === 'th';
  const [weeks, setWeeks] = useState<WeekPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId || !isSupabaseAvailable()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    // Need 4 complete weeks + current partial week = ~35 days back
    const from35 = daysAgoIso(34);

    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('fnb_daily_metrics')
        .select('metric_date, revenue')
        .eq('branch_id', branchId)
        .gte('metric_date', from35)
        .lte('metric_date', today)
        .order('metric_date', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('fnb_purchase_log')
        .select('purchase_date, amount')
        .eq('branch_id', branchId)
        .eq('purchase_type', 'food_beverage')
        .gte('purchase_date', from35)
        .lte('purchase_date', today),
    ]).then(
      ([
        { data: metricsRaw },
        { data: purchasesRaw },
      ]: [
        { data: { metric_date: string; revenue: number | null }[] | null },
        { data: { purchase_date: string; amount: number }[] | null },
      ]) => {
        const metrics = metricsRaw ?? [];
        const purchases = purchasesRaw ?? [];

        // Build per-date revenue map
        const revenueByDate = new Map<string, number>();
        for (const m of metrics) {
          revenueByDate.set(m.metric_date, m.revenue != null ? Number(m.revenue) : 0);
        }

        // Build per-weekStart food purchase totals
        const foodByWeek = new Map<string, number>();
        for (const p of purchases) {
          const ws = getMondayOf(p.purchase_date);
          foodByWeek.set(ws, (foodByWeek.get(ws) ?? 0) + Number(p.amount));
        }

        // Build per-weekStart revenue totals + days with data
        const revenueByWeek = new Map<string, number>();
        const daysWithDataByWeek = new Map<string, number>();
        for (const m of metrics) {
          const ws = getMondayOf(m.metric_date);
          const rev = m.revenue != null ? Number(m.revenue) : 0;
          revenueByWeek.set(ws, (revenueByWeek.get(ws) ?? 0) + rev);
          if (rev > 0) {
            daysWithDataByWeek.set(ws, (daysWithDataByWeek.get(ws) ?? 0) + 1);
          }
        }

        // Determine the 5 week starts (4 past complete + 1 current)
        const currentMonday = getMondayOf(today);
        const weekStarts: string[] = [];
        for (let w = 4; w >= 0; w--) {
          const d = new Date(`${currentMonday}T12:00:00`);
          d.setDate(d.getDate() - w * 7);
          weekStarts.push(d.toISOString().slice(0, 10));
        }

        const result: WeekPoint[] = weekStarts.map((ws) => {
          const food = foodByWeek.get(ws) ?? 0;
          const rev = revenueByWeek.get(ws) ?? 0;
          const daysWithData = daysWithDataByWeek.get(ws) ?? 0;
          const isCurrentWeek = ws === currentMonday;

          // For past weeks, require at least 3 days of data; for current partial week, require ≥1 day
          const minDays = isCurrentWeek ? 1 : 3;
          let foodCostPct: number | null = null;
          if (food > 0 && rev > 0 && daysWithData >= minDays) {
            foodCostPct = Math.round((food / rev) * 1000) / 10;
            // Cap at 200% to avoid extreme outliers distorting the chart
            if (foodCostPct > 200) foodCostPct = null;
          }

          return { weekStart: ws, foodCostPct, isCurrentWeek, daysWithData };
        });

        setWeeks(result);
        setLoading(false);
      }
    ).catch(() => setLoading(false));
  }, [branchId]);

  const { barW, toX, toY, yMax } = useMemo(() => {
    if (!weeks?.length) return { barW: 0, toX: () => PAD_LEFT, toY: () => PAD_TOP + CHART_H, yMax: 100 };
    const allPcts = weeks.map((w) => w.foodCostPct ?? 0);
    const dataMax = Math.max(...allPcts, 50); // minimum axis max = 50%
    const yMaxVal = Math.ceil(dataMax * 1.2 / 10) * 10;
    const n = weeks.length;
    const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
    const gap = plotW * 0.12 / Math.max(1, n - 1);
    const bW = (plotW - gap * (n - 1)) / n;
    const toXFn = (i: number) => PAD_LEFT + i * (bW + gap);
    const toYFn = (v: number) => PAD_TOP + CHART_H - (v / yMaxVal) * CHART_H;
    return { barW: bW, toX: toXFn, toY: toYFn, yMax: yMaxVal };
  }, [weeks]);

  // Reference band 28–35%
  const bandY1 = toY(35);
  const bandY2 = toY(28);

  const insight = useMemo(() => {
    if (!weeks) return null;
    // Find current week and most recent past week with data
    const currentWeek = weeks.find((w) => w.isCurrentWeek);
    const pastWeeks = weeks.filter((w) => !w.isCurrentWeek && w.foodCostPct != null);
    const latestPast = pastWeeks[pastWeeks.length - 1];

    if (!currentWeek && !latestPast) {
      return {
        signal: 'info' as const,
        text: th
          ? 'บันทึกการซื้ออาหารและรายได้เพื่อติดตามต้นทุนอาหาร'
          : 'Log food purchases and revenue to track food cost %',
      };
    }

    const pct = currentWeek?.foodCostPct ?? latestPast?.foodCostPct ?? null;
    if (pct == null) {
      return {
        signal: 'info' as const,
        text: th
          ? 'บันทึกการซื้ออาหารเพื่อดูต้นทุนอาหาร %'
          : 'Log food purchases to see food cost %',
      };
    }

    if (pct <= 28) {
      return {
        signal: 'green' as const,
        text: th
          ? `ต้นทุนอาหารต่ำมาก ${pct.toFixed(1)}% — ต่ำกว่าเป้า 28%`
          : `Food cost very low at ${pct.toFixed(1)}% — below the 28% target`,
      };
    }
    if (pct <= 35) {
      return {
        signal: 'green' as const,
        text: th
          ? `ต้นทุนอาหารอยู่ในเป้า ${pct.toFixed(1)}% (เป้า 28–35%)`
          : `Food cost on target at ${pct.toFixed(1)}% (target 28–35%)`,
      };
    }
    if (pct <= 45) {
      return {
        signal: 'amber' as const,
        text: th
          ? `ต้นทุนอาหารสูงกว่าเป้า ${pct.toFixed(1)}% — ตรวจสอบของเสียและส่วนผสม`
          : `Food cost above target at ${pct.toFixed(1)}% — review waste and portions`,
      };
    }
    return {
      signal: 'red' as const,
      text: th
        ? `ต้นทุนอาหารสูงมาก ${pct.toFixed(1)}% — ต้องลดการสูญเสียและต้นทุนวัตถุดิบทันที`
        : `Food cost critical at ${pct.toFixed(1)}% — reduce waste and ingredient costs now`,
    };
  }, [weeks, th]);

  const hasAnyData = weeks ? weeks.some((w) => w.foodCostPct != null) : false;

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {th ? 'กำลังโหลด...' : 'Loading...'}
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 6px 0' }}>
        {th ? 'ต้นทุนอาหาร % (4 สัปดาห์)' : 'Food Cost % (4 weeks)'}
      </p>

      {!hasAnyData ? (
        <div style={{ height: SVG_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
          {th ? 'ยังไม่มีข้อมูล — บันทึกการซื้ออาหาร' : 'No data yet — log food purchases'}
        </div>
      ) : (
        <svg
          width="100%"
          height={SVG_H}
          viewBox={`0 0 ${CHART_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Axes */}
          <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + CHART_H} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={PAD_LEFT} y1={PAD_TOP + CHART_H} x2={CHART_W - PAD_RIGHT} y2={PAD_TOP + CHART_H} stroke="#e5e7eb" strokeWidth="1" />

          {/* Reference band 28–35% */}
          <rect
            x={PAD_LEFT}
            y={bandY1}
            width={CHART_W - PAD_LEFT - PAD_RIGHT}
            height={Math.max(0, bandY2 - bandY1)}
            fill="rgba(16,185,129,0.07)"
          />
          {/* Reference band top/bottom lines */}
          <line x1={PAD_LEFT} y1={bandY1} x2={CHART_W - PAD_RIGHT} y2={bandY1} stroke="#10b981" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.5" />
          <line x1={PAD_LEFT} y1={bandY2} x2={CHART_W - PAD_RIGHT} y2={bandY2} stroke="#10b981" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.5" />

          {/* Y-axis label: 35% */}
          <text x={PAD_LEFT - 3} y={bandY1 + 3} textAnchor="end" fontSize="8" fill="#9ca3af">35%</text>
          <text x={PAD_LEFT - 3} y={bandY2 + 3} textAnchor="end" fontSize="8" fill="#9ca3af">28%</text>

          {/* Bars */}
          {weeks?.map((w, i) => {
            if (w.foodCostPct == null) return null;
            const x = toX(i);
            const y = toY(w.foodCostPct);
            const h = Math.max(2, PAD_TOP + CHART_H - y);
            const fill = barColor(w.foodCostPct);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={fill}
                  opacity={w.isCurrentWeek ? 0.6 : 1}
                  rx="2"
                />
                {/* Value label above bar */}
                <text x={x + barW / 2} y={Math.max(PAD_TOP + 8, y - 2)} textAnchor="middle" fontSize="8.5" fill={fill} fontWeight="600">
                  {w.foodCostPct.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* X-axis week labels */}
          {weeks?.map((w, i) => (
            <text key={i} x={toX(i) + barW / 2} y={SVG_H - 4} textAnchor="middle" fontSize="9" fill={w.isCurrentWeek ? '#374151' : '#9ca3af'} fontWeight={w.isCurrentWeek ? '600' : '400'}>
              {w.isCurrentWeek
                ? (th ? 'สัปดาห์นี้' : 'This wk')
                : formatShortDate(w.weekStart)}
            </text>
          ))}
        </svg>
      )}

      {insight && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: SIGNAL_COLORS[insight.signal],
              flexShrink: 0,
              marginTop: 3,
            }}
          />
          <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.4 }}>{insight.text}</p>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#16a34a', display: 'inline-block' }} />
          {th ? '≤28%' : '≤28%'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#4ade80', display: 'inline-block' }} />
          {th ? '28–35%' : '28–35%'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#d97706', display: 'inline-block' }} />
          {th ? '35–45%' : '35–45%'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#ef4444', display: 'inline-block' }} />
          {th ? '>45%' : '>45%'}
        </span>
      </div>
    </div>
  );
}
