/**
 * FnbBreakevenMiniChart — compact 7-day customers vs breakeven line chart.
 * Self-contained: fetches its own data from fnb_daily_metrics + fnb_purchase_log.
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

const COLOR_ACTUAL = '#2563eb';
const COLOR_BREAKEVEN = '#ef4444';
const SIGNAL_COLORS = { green: '#16a34a', amber: '#d97706', red: '#ef4444', info: '#6b7280' };

interface DayPoint {
  date: string;
  actual: number;
  breakeven: number | null;
}

function getMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - offset);
  return monday.toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export interface FnbBreakevenMiniChartProps {
  branchId: string;
  locale?: 'en' | 'th';
}

export function FnbBreakevenMiniChart({ branchId, locale = 'en' }: FnbBreakevenMiniChartProps) {
  const th = locale === 'th';
  const [points, setPoints] = useState<DayPoint[] | null>(null);
  const [monthlyFixedCost, setMonthlyFixedCost] = useState<number | null>(null);
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
    const from13 = daysAgoIso(13);

    Promise.all([
      // Daily metrics for last 13 days (covers up to 2 calendar weeks for weekly aggregation)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('fnb_daily_metrics')
        .select('metric_date, total_customers, revenue')
        .eq('branch_id', branchId)
        .gte('metric_date', from13)
        .lte('metric_date', today)
        .order('metric_date', { ascending: true }),
      // Food & bev purchases for last 13 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('fnb_purchase_log')
        .select('purchase_date, amount')
        .eq('branch_id', branchId)
        .eq('purchase_type', 'food_beverage')
        .gte('purchase_date', from13)
        .lte('purchase_date', today),
      // Monthly fixed cost — most recent non-null value
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('fnb_daily_metrics')
        .select('monthly_fixed_cost')
        .eq('branch_id', branchId)
        .not('monthly_fixed_cost', 'is', null)
        .gt('monthly_fixed_cost', 0)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(
      ([
        { data: metricsRaw },
        { data: purchasesRaw },
        { data: fixedCostRaw },
      ]: [
        { data: { metric_date: string; total_customers: number | null; revenue: number | null }[] | null },
        { data: { purchase_date: string; amount: number }[] | null },
        { data: { monthly_fixed_cost: number | null } | null },
      ]) => {
        const metrics = metricsRaw ?? [];
        const purchases = purchasesRaw ?? [];
        const mfc = fixedCostRaw?.monthly_fixed_cost != null ? Number(fixedCostRaw.monthly_fixed_cost) : null;
        setMonthlyFixedCost(mfc);

        // Build metric lookup by date
        const metricByDate = new Map<string, { customers: number; revenue: number }>();
        for (const m of metrics) {
          metricByDate.set(m.metric_date, {
            customers: m.total_customers != null ? Number(m.total_customers) : 0,
            revenue: m.revenue != null ? Number(m.revenue) : 0,
          });
        }

        // Build weekly aggregations for breakeven computation
        const weekFoodMap = new Map<string, number>();   // weekStart → food purchases total
        const weekRevenueMap = new Map<string, number>(); // weekStart → revenue total

        for (const p of purchases) {
          const ws = getMondayOf(p.purchase_date);
          weekFoodMap.set(ws, (weekFoodMap.get(ws) ?? 0) + Number(p.amount));
        }
        for (const m of metrics) {
          const ws = getMondayOf(m.metric_date);
          const rev = m.revenue != null ? Number(m.revenue) : 0;
          weekRevenueMap.set(ws, (weekRevenueMap.get(ws) ?? 0) + rev);
        }

        // Build 7-day chart points (today-6 through today)
        const result: DayPoint[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = daysAgoIso(i);
          const dayData = metricByDate.get(date);
          const actual = dayData?.customers ?? 0;
          const revenue = dayData?.revenue ?? 0;

          let breakeven: number | null = null;

          if (mfc != null && mfc > 0) {
            const ws = getMondayOf(date);
            const weekFood = weekFoodMap.get(ws) ?? 0;
            const weekRev = weekRevenueMap.get(ws) ?? 0;

            // Guard 1: need at least 5 customers
            if (actual >= 5 && weekFood > 0 && weekRev > 0) {
              // Revenue-weighted daily food cost estimate
              const dailyFoodEst = (revenue / weekRev) * weekFood;
              const grossProfit = revenue - dailyFoodEst;

              // Guard 2: gross profit must be positive
              if (grossProfit > 0) {
                const gpPerCust = grossProfit / actual;

                // Guard 3: GP per customer must be >= ฿10
                if (gpPerCust >= 10) {
                  const dailyFixed = mfc / daysInMonth(date);
                  const bk = Math.ceil(dailyFixed / gpPerCust);

                  // Guard 4: breakeven must be <= 500
                  if (bk <= 500) {
                    breakeven = bk;
                  }
                }
              }
            }
          }

          result.push({ date, actual, breakeven });
        }

        setPoints(result);
        setLoading(false);
      }
    ).catch(() => setLoading(false));
  }, [branchId]);

  const { toX, toY } = useMemo(() => {
    if (!points?.length) return { toX: () => PAD_LEFT, toY: () => PAD_TOP };
    const allActual = points.map((p) => p.actual);
    const allBk = points.map((p) => p.breakeven ?? 0);
    const dataMax = Math.max(...allActual, ...allBk, 1);
    const yMax = dataMax * 1.4;
    const n = points.length;
    const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
    const toX = (i: number) => PAD_LEFT + (i / Math.max(1, n - 1)) * plotW;
    const toY = (v: number) => PAD_TOP + CHART_H - (v / yMax) * CHART_H;
    return { toX, toY };
  }, [points]);

  const actualPts = useMemo(
    () => points?.map((p, i) => `${toX(i)},${toY(p.actual)}`).join(' ') ?? '',
    [points, toX, toY]
  );

  const bkPts = useMemo(() => {
    if (!points) return '';
    return points
      .filter((p) => p.breakeven != null)
      .map((p, _, arr) => {
        const i = points.indexOf(p);
        return `${toX(i)},${toY(p.breakeven!)}`;
      })
      .join(' ');
  }, [points, toX, toY]);

  const fillSegments = useMemo(() => {
    if (!points || points.length < 2) return [];
    return points.slice(0, -1).flatMap((p0, i) => {
      const p1 = points[i + 1]!;
      if (p0.breakeven == null || p1.breakeven == null) return [];
      const above = p0.actual + p1.actual >= p0.breakeven + p1.breakeven;
      return [{
        pts: `${toX(i)},${toY(p0.actual)} ${toX(i + 1)},${toY(p1.actual)} ${toX(i + 1)},${toY(p1.breakeven)} ${toX(i)},${toY(p0.breakeven)}`,
        fill: above ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      }];
    });
  }, [points, toX, toY]);

  const todayPt = points?.[points.length - 1] ?? null;

  const insight = useMemo(() => {
    if (!todayPt) return null;
    if (todayPt.breakeven == null && monthlyFixedCost == null) {
      return {
        signal: 'info' as const,
        text: th
          ? 'ป้อนต้นทุนคงที่รายเดือนในการตั้งค่าเพื่อดูจุดคุ้มทุน'
          : 'Enter monthly fixed costs in Settings to see breakeven',
      };
    }
    if (todayPt.breakeven == null) {
      return {
        signal: 'info' as const,
        text: th
          ? 'ข้อมูลไม่เพียงพอสำหรับจุดคุ้มทุนวันนี้ — บันทึกการซื้ออาหาร'
          : "Insufficient data for today's breakeven — log food purchases",
      };
    }
    if (todayPt.actual >= todayPt.breakeven) {
      const surplus = todayPt.actual - todayPt.breakeven;
      return {
        signal: 'green' as const,
        text: th
          ? `เกินจุดคุ้มทุน — เกินกว่าที่ต้องการ ${surplus} คนวันนี้`
          : `Above breakeven — ${surplus} customers beyond what you need today`,
      };
    }
    const gap = todayPt.breakeven - todayPt.actual;
    return {
      signal: 'red' as const,
      text: th
        ? `ต้องการลูกค้าอีก ${gap} คนเพื่อถึงจุดคุ้มทุนวันนี้`
        : `Need ${gap} more customers to break even today`,
    };
  }, [todayPt, monthlyFixedCost, th]);

  const hasAnyData = points ? points.some((p) => p.actual > 0) : false;

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
        {th
          ? 'จำนวนลูกค้า (จริง vs จุดคุ้มทุน: 7 วัน)'
          : 'No. of customers (Actual vs Breakeven: 7 days)'}
      </p>

      {!hasAnyData ? (
        <div style={{ height: SVG_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
          {th ? 'ยังไม่มีข้อมูล — บันทึกข้อมูลวันนี้' : 'No data yet — log today\'s metrics'}
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

          {/* Fill segments (above=green, below=red) */}
          {fillSegments.map((s, i) => (
            <polygon key={i} points={s.pts} fill={s.fill} />
          ))}

          {/* Breakeven dashed line */}
          {bkPts && (
            <polyline points={bkPts} fill="none" stroke={COLOR_BREAKEVEN} strokeWidth="1.5" strokeDasharray="4 2" />
          )}

          {/* Actual customers line */}
          <polyline points={actualPts} fill="none" stroke={COLOR_ACTUAL} strokeWidth="2" />

          {/* Dots on actual line */}
          {points?.map((p, i) => (
            <circle key={i} cx={toX(i)} cy={toY(p.actual)} r="3" fill={COLOR_ACTUAL} />
          ))}

          {/* X-axis date labels */}
          {points?.map((p, i) => (
            <text key={i} x={toX(i)} y={SVG_H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
              {formatShortDate(p.date)}
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
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke={COLOR_ACTUAL} strokeWidth="2" />
          </svg>
          {th ? 'จริง' : 'Actual'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke={COLOR_BREAKEVEN} strokeWidth="1.5" strokeDasharray="4 2" />
          </svg>
          {th ? 'จุดคุ้มทุน' : 'Breakeven'}
        </span>
      </div>
    </div>
  );
}
