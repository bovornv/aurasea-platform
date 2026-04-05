'use client';

/**
 * Forward Demand — Rooms on Books chart
 *
 * Shows forward booking pace for the next 14 days versus historical day-of-week averages.
 * Uses no external charting library — pure SVG.
 */

import { useMemo } from 'react';
import type { DailyMetric } from '../../models/daily-metrics';

const PAD_LEFT = 44;
const PAD_RIGHT = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const HEIGHT = CHART_HEIGHT + PAD_TOP + PAD_BOTTOM;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;

// Day-of-week index 0=Sun..6=Sat → ISO Mon=0..Sun=6
const DOW_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_LABELS_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function isoDateAddDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekIso(isoDate: string): number {
  // Returns 0=Mon..6=Sun
  const d = new Date(`${isoDate}T12:00:00`).getDay(); // 0=Sun..6=Sat
  return d === 0 ? 6 : d - 1;
}

function formatShortDate(isoDate: string, locale: 'th' | 'en'): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDate();
  const monthEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const monthTh = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][d.getMonth()];
  return locale === 'th' ? `${day} ${monthTh}` : `${day} ${monthEn}`;
}

export interface ForwardDemandChartProps {
  /** Most recent daily metric (provides today's rooms_sold, rooms_on_books_7/14) */
  latestMetric: DailyMetric | null;
  /** Historical metrics for DOW baseline (ideally 90 days) */
  historicalMetrics: DailyMetric[];
  /** Total rooms available (for capacity line) */
  roomsAvailable: number;
  locale?: 'th' | 'en';
  height?: number;
}

export function ForwardDemandChart({
  latestMetric,
  historicalMetrics,
  roomsAvailable,
  locale = 'en',
  height = HEIGHT,
}: ForwardDemandChartProps) {
  const th = locale === 'th';

  // Build the 15-point forward demand series (day 0 = today, days 1-14 = future)
  const { forwardValues, baselineValues, dates, paceStatus, hasBaseline } = useMemo(() => {
    const today = latestMetric?.date ?? new Date().toISOString().slice(0, 10);
    const roomsSoldToday = latestMetric?.roomsSold ?? 0;
    const rob7 = latestMetric?.roomsOnBooks7 ?? 0;
    const rob14 = latestMetric?.roomsOnBooks14 ?? 0;

    // Forward line: linear interpolation between day0=roomsSold, day7=rob7, day14=rob14
    const fwdValues: number[] = [];
    const dateSeries: string[] = [];
    for (let d = 0; d <= 14; d++) {
      dateSeries.push(isoDateAddDays(today, d));
      if (d === 0) fwdValues.push(roomsSoldToday);
      else if (d <= 7) {
        const t = d / 7;
        fwdValues.push(roomsSoldToday + t * (rob7 - roomsSoldToday));
      } else {
        const t = (d - 7) / 7;
        fwdValues.push(rob7 + t * (rob14 - rob7));
      }
    }

    // Baseline: average rooms_sold by day-of-week from historicalMetrics
    const dowTotals = Array(7).fill(0);
    const dowCounts = Array(7).fill(0);
    for (const m of historicalMetrics) {
      if (m.roomsSold != null && m.roomsSold > 0) {
        const dow = dayOfWeekIso(m.date);
        dowTotals[dow] += m.roomsSold;
        dowCounts[dow]++;
      }
    }
    const hasEnoughHistory = historicalMetrics.filter(m => m.roomsSold != null && m.roomsSold > 0).length >= 30;
    const dowAvg = dowTotals.map((total, i) => (dowCounts[i] > 0 ? total / dowCounts[i] : null));

    const baseValues: (number | null)[] = dateSeries.map((date) => {
      const dow = dayOfWeekIso(date);
      return dowAvg[dow];
    });

    // Pace status: compare forward average vs baseline average for days 1-14
    let paceStatus: 'ahead' | 'behind' | 'insufficient' = 'insufficient';
    if (hasEnoughHistory) {
      const fwdSum = fwdValues.slice(1).reduce((s, v) => s + v, 0);
      const baseSum = baseValues.slice(1).reduce((s: number, v) => s + (v ?? 0), 0);
      const baseCount = baseValues.slice(1).filter((v) => v != null).length;
      if (baseCount > 0 && baseSum > 0) {
        const pct = (fwdSum - baseSum) / baseSum;
        paceStatus = pct >= -0.05 ? 'ahead' : 'behind';
      }
    }

    return {
      forwardValues: fwdValues,
      baselineValues: baseValues,
      dates: dateSeries,
      paceStatus,
      hasBaseline: hasEnoughHistory,
    };
  }, [latestMetric, historicalMetrics]);

  const chartH = height - PAD_TOP - PAD_BOTTOM;

  // Compute Y scale — include all values + capacity
  const { yMin, yMax, toY, toX } = useMemo(() => {
    const allVals = [
      ...forwardValues,
      ...baselineValues.filter((v): v is number => v != null),
      roomsAvailable,
    ];
    const dataMax = Math.max(...allVals, 1);
    const yMin = 0;
    const yMax = Math.ceil(dataMax * 1.1);
    const range = yMax - yMin || 1;
    const toY = (v: number) => PAD_TOP + chartH - ((v - yMin) / range) * chartH;
    const toX = (i: number) => PAD_LEFT + (i / 14) * PLOT_W;
    return { yMin, yMax, toY, toX };
  }, [forwardValues, baselineValues, roomsAvailable, chartH]);

  // Build SVG polyline point strings
  const fwdPoints = forwardValues.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  const basePoints = useMemo(() => {
    const pts = baselineValues
      .map((v, i) => (v != null ? `${toX(i)},${toY(v)}` : null))
      .filter(Boolean);
    return pts.join(' ');
  }, [baselineValues, toX, toY]);

  // Capacity line Y
  const capacityY = toY(roomsAvailable);

  // Build fill segments between forward and baseline
  const fillSegments = useMemo(() => {
    if (!hasBaseline) return [];
    const segs: Array<{ points: string; fill: string }> = [];
    for (let i = 0; i < 14; i++) {
      const bv0 = baselineValues[i];
      const bv1 = baselineValues[i + 1];
      if (bv0 == null || bv1 == null) continue;
      const fv0 = forwardValues[i]!;
      const fv1 = forwardValues[i + 1]!;
      const x0 = toX(i);
      const x1 = toX(i + 1);
      const above = (fv0 + fv1) >= (bv0 + bv1);
      const polygon = [
        `${x0},${toY(fv0)}`,
        `${x1},${toY(fv1)}`,
        `${x1},${toY(bv1)}`,
        `${x0},${toY(bv0)}`,
      ].join(' ');
      segs.push({ points: polygon, fill: above ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)' });
    }
    return segs;
  }, [hasBaseline, forwardValues, baselineValues, toX, toY]);

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const count = 4;
    const ticks: Array<{ v: number; y: number }> = [];
    for (let i = 0; i <= count; i++) {
      const v = Math.round(yMin + ((yMax - yMin) * i) / count);
      ticks.push({ v, y: PAD_TOP + chartH - (i / count) * chartH });
    }
    return ticks;
  }, [yMin, yMax, chartH]);

  // X-axis ticks: today, day7, day14
  const xTicks = [0, 7, 14].map((i) => ({
    i,
    x: toX(i),
    label: i === 0
      ? (th ? 'วันนี้' : 'Today')
      : `+${i}d`,
  }));

  // Pace text
  const paceText = useMemo(() => {
    if (!hasBaseline) {
      return {
        text: th
          ? 'ข้อมูลน้อยกว่า 30 วัน — ยังไม่มีเส้นฐาน'
          : 'Less than 30 days of history — no baseline yet',
        color: '#9ca3af',
      };
    }
    if (paceStatus === 'ahead') {
      return {
        text: th ? 'การจองเป็นไปตามแผน ✓' : 'Booking pace is on track ✓',
        color: '#059669',
      };
    }
    return {
      text: th ? 'การจองต่ำกว่าค่าเฉลี่ยตามวันในสัปดาห์' : 'Booking pace is behind historical average',
      color: '#d97706',
    };
  }, [hasBaseline, paceStatus, th]);

  if (!latestMetric) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        {th ? 'ไม่มีข้อมูล' : 'No data'}
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
        {/* Axes */}
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PAD_LEFT} y1={PAD_TOP + chartH} x2={PAD_LEFT + PLOT_W} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />

        {/* Y-axis ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={t.y} x2={PAD_LEFT - 4} y2={t.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PAD_LEFT - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {t.v}
            </text>
          </g>
        ))}

        {/* X-axis ticks */}
        {xTicks.map((t) => (
          <g key={t.i}>
            <line x1={t.x} y1={PAD_TOP + chartH} x2={t.x} y2={PAD_TOP + chartH + 4} stroke="#e5e7eb" strokeWidth="1" />
            <text x={t.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {t.label}
            </text>
          </g>
        ))}

        {/* Fill segments between forward and baseline */}
        {fillSegments.map((seg, i) => (
          <polygon key={i} points={seg.points} fill={seg.fill} />
        ))}

        {/* Baseline (dashed grey) */}
        {hasBaseline && basePoints && (
          <polyline
            points={basePoints}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1.5"
            strokeDasharray="5,4"
          />
        )}

        {/* Capacity line (dashed, dark) */}
        {roomsAvailable > 0 && (
          <>
            <line
              x1={PAD_LEFT}
              y1={capacityY}
              x2={PAD_LEFT + PLOT_W}
              y2={capacityY}
              stroke="#374151"
              strokeWidth="1"
              strokeDasharray="6,4"
            />
            <text x={PAD_LEFT + PLOT_W + 2} y={capacityY + 4} fontSize="9" fill="#374151">
              {th ? 'เต็ม' : 'Full'}
            </text>
          </>
        )}

        {/* Forward demand line (solid blue) */}
        <polyline
          points={fwdPoints}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
        />

        {/* Dots at known data points */}
        {[0, 7, 14].map((i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(forwardValues[i]!)}
            r="3.5"
            fill="#2563eb"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {/* Pace status */}
      <div style={{ marginTop: 8, fontSize: 12, color: paceText.color, fontWeight: 500 }}>
        {paceText.text}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#2563eb" strokeWidth="2" /></svg>
          <span>{th ? 'ห้องที่จองแล้ว' : 'Rooms on books'}</span>
        </div>
        {hasBaseline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="5,4" /></svg>
            <span>{th ? 'ค่าเฉลี่ยตามวันในสัปดาห์ (90 วัน)' : 'DOW avg (90 days)'}</span>
          </div>
        )}
        {roomsAvailable > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#374151" strokeWidth="1" strokeDasharray="6,4" /></svg>
            <span>{th ? 'ความจุสูงสุด' : 'Full capacity'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
