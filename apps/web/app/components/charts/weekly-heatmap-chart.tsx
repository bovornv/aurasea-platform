'use client';

/**
 * Weekly Performance Heatmap
 *
 * Grid: rows = last 8 complete weeks, columns = Mon–Sun
 * Cell color scale: white → deep primary blue (occupancy %) / green (RevPAR)
 * Toggle: occupancy % ↔ RevPAR (฿)
 * Below chart: strongest / weakest day summary
 *
 * Uses no external charting library — pure CSS grid.
 */

import { useState, useMemo } from 'react';
import type { DailyMetric } from '../../models/daily-metrics';

const DOW_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_LABELS_TH = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

/** 0=Mon..6=Sun */
function isoWeekday(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00`).getDay(); // 0=Sun..6=Sat
  return d === 0 ? 6 : d - 1;
}

/** Get Monday of the ISO week containing this date */
function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const dow = isoWeekday(isoDate); // 0=Mon..6=Sun
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(mondayIso: string, locale: 'th' | 'en'): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  const day = d.getDate();
  const monthEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const monthTh = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][d.getMonth()];
  return locale === 'th' ? `${day} ${monthTh}` : `${day} ${monthEn}`;
}

function lerp(t: number, r0: number, g0: number, b0: number, r1: number, g1: number, b1: number): string {
  const r = Math.round(r0 + t * (r1 - r0));
  const g = Math.round(g0 + t * (g1 - g0));
  const b = Math.round(b0 + t * (b1 - b0));
  return `rgb(${r},${g},${b})`;
}

// white → deep primary blue (#1d4ed8)
function occupancyColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct));
  return lerp(t, 255, 255, 255, 29, 78, 216);
}

// white → deep green (#15803d)
function revparColor(normalized: number): string {
  const t = Math.max(0, Math.min(1, normalized));
  return lerp(t, 255, 255, 255, 21, 128, 61);
}

type Mode = 'occupancy' | 'revpar';

interface CellData {
  occupancy: number | null; // 0-1
  revpar: number | null;
  isoDate: string;
}

export interface WeeklyHeatmapChartProps {
  dailyMetrics: DailyMetric[];
  roomsAvailable: number;
  locale?: 'th' | 'en';
}

export function WeeklyHeatmapChart({
  dailyMetrics,
  roomsAvailable,
  locale = 'en',
}: WeeklyHeatmapChartProps) {
  const [mode, setMode] = useState<Mode>('occupancy');
  const th = locale === 'th';

  // Build grid: last 8 complete weeks (Mon-Sun)
  const { grid, weeks, maxRevpar } = useMemo(() => {
    if (!dailyMetrics || dailyMetrics.length === 0) {
      return { grid: [], weeks: [], maxRevpar: 1 };
    }

    // Index metrics by date
    const byDate = new Map<string, DailyMetric>();
    for (const m of dailyMetrics) {
      byDate.set(m.date, m);
    }

    // Find today's Monday, then go back to get complete weeks
    const today = new Date().toISOString().slice(0, 10);
    const thisMonday = mondayOf(today);

    // Last 8 complete weeks = weeks starting from thisMonday - 8*7 days
    const weeks: string[] = []; // monday ISO dates
    for (let w = 8; w >= 1; w--) {
      const mon = new Date(`${thisMonday}T12:00:00`);
      mon.setDate(mon.getDate() - w * 7);
      weeks.push(mon.toISOString().slice(0, 10));
    }

    // Build grid[weekIdx][dowIdx] = CellData
    const grid: CellData[][] = weeks.map((monday) => {
      return Array.from({ length: 7 }, (_, dow) => {
        const date = addDays(monday, dow);
        const m = byDate.get(date);
        if (!m) return { occupancy: null, revpar: null, isoDate: date };
        const rooms = roomsAvailable > 0 ? roomsAvailable : (m.roomsAvailable ?? 0);
        const occ = rooms > 0 && m.roomsSold != null ? m.roomsSold / rooms : null;
        const revpar = rooms > 0 ? m.revenue / rooms : null;
        return { occupancy: occ, revpar, isoDate: date };
      });
    });

    const maxRevpar = Math.max(
      1,
      ...grid.flatMap((row) => row.map((c) => c.revpar ?? 0))
    );

    return { grid, weeks, maxRevpar };
  }, [dailyMetrics, roomsAvailable]);

  // DOW averages for summary (occupancy + revpar)
  const dowStats = useMemo(() => {
    if (grid.length === 0) return null;
    const dowOcc = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
    const dowRev = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
    for (const row of grid) {
      for (let d = 0; d < 7; d++) {
        const c = row[d];
        if (c?.occupancy != null) {
          dowOcc[d]!.sum += c.occupancy;
          dowOcc[d]!.count++;
        }
        if (c?.revpar != null) {
          dowRev[d]!.sum += c.revpar;
          dowRev[d]!.count++;
        }
      }
    }
    const occAvgs = dowOcc.map((s) => (s.count > 0 ? s.sum / s.count : null));
    const revAvgs = dowRev.map((s) => (s.count > 0 ? s.sum / s.count : null));

    function extremes(avgs: (number | null)[]) {
      let maxIdx = -1, minIdx = -1;
      let maxVal = -Infinity, minVal = Infinity;
      for (let d = 0; d < 7; d++) {
        const v = avgs[d];
        if (v == null) continue;
        if (v > maxVal) { maxVal = v; maxIdx = d; }
        if (v < minVal) { minVal = v; minIdx = d; }
      }
      return { maxIdx, minIdx, maxVal, minVal };
    }

    return {
      occ: { ...extremes(occAvgs) },
      rev: { ...extremes(revAvgs) },
    };
  }, [grid]);

  if (grid.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        {th ? 'ไม่มีข้อมูล' : 'No data'}
      </div>
    );
  }

  const dowLabels = th ? DOW_LABELS_TH : DOW_LABELS_EN;
  const CELL_MIN_W = 42;

  return (
    <div style={{ width: '100%' }}>
      {/* Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setMode('occupancy')}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid',
            borderColor: mode === 'occupancy' ? '#2563eb' : '#d1d5db',
            backgroundColor: mode === 'occupancy' ? '#eff6ff' : '#fff',
            color: mode === 'occupancy' ? '#2563eb' : '#374151',
            fontSize: 12,
            fontWeight: mode === 'occupancy' ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {th ? 'อัตราการเข้าพัก %' : 'Occupancy %'}
        </button>
        <button
          onClick={() => setMode('revpar')}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid',
            borderColor: mode === 'revpar' ? '#15803d' : '#d1d5db',
            backgroundColor: mode === 'revpar' ? '#f0fdf4' : '#fff',
            color: mode === 'revpar' ? '#15803d' : '#374151',
            fontSize: 12,
            fontWeight: mode === 'revpar' ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {th ? 'RevPAR (฿)' : 'RevPAR (฿)'}
        </button>
      </div>

      {/* Grid — horizontally scrollable on mobile */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(7, minmax(${CELL_MIN_W}px, 1fr))`,
            gap: 2,
            minWidth: 80 + 7 * CELL_MIN_W + 2 * 7,
          }}
        >
          {/* Header row */}
          <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }} />
          {dowLabels.map((label, d) => (
            <div
              key={d}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: d >= 5 ? '#374151' : '#6b7280', // weekend slightly darker
                textAlign: 'center',
                paddingBottom: 4,
              }}
            >
              {label}
            </div>
          ))}

          {/* Data rows */}
          {grid.map((row, weekIdx) => (
            <>
              {/* Week label */}
              <div
                key={`week-${weekIdx}`}
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  paddingRight: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatWeekLabel(weeks[weekIdx]!, locale)}
              </div>
              {/* Day cells */}
              {row.map((cell, d) => {
                const isNoData = mode === 'occupancy' ? cell.occupancy == null : cell.revpar == null;
                const bg = isNoData
                  ? '#f3f4f6'
                  : mode === 'occupancy'
                    ? occupancyColor(cell.occupancy!)
                    : revparColor(cell.revpar! / maxRevpar);

                const textVal = isNoData
                  ? '—'
                  : mode === 'occupancy'
                    ? `${Math.round(cell.occupancy! * 100)}%`
                    : `฿${Math.round(cell.revpar!).toLocaleString()}`;

                // Determine text color for contrast (dark bg needs white text)
                const intensity =
                  isNoData ? 0 : mode === 'occupancy' ? cell.occupancy! : cell.revpar! / maxRevpar;
                const textColor = intensity > 0.55 ? '#fff' : '#374151';
                const noDataTextColor = '#9ca3af';

                return (
                  <div
                    key={`cell-${weekIdx}-${d}`}
                    style={{
                      backgroundColor: bg,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 36,
                      fontSize: 11,
                      fontWeight: isNoData ? 400 : 500,
                      color: isNoData ? noDataTextColor : textColor,
                      padding: '4px 2px',
                    }}
                  >
                    {textVal}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Summary */}
      {dowStats && (() => {
        const s = mode === 'occupancy' ? dowStats.occ : dowStats.rev;
        if (s.maxIdx < 0 || s.minIdx < 0) return null;
        const fmtMax = mode === 'occupancy'
          ? `${Math.round(s.maxVal * 100)}%${th ? ' เฉลี่ย' : ' avg'}`
          : `฿${Math.round(s.maxVal).toLocaleString()} RevPAR`;
        const fmtMin = mode === 'occupancy'
          ? `${Math.round(s.minVal * 100)}%${th ? ' เฉลี่ย' : ' avg'}`
          : `฿${Math.round(s.minVal).toLocaleString()} RevPAR`;
        return (
          <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span>
              <span style={{ color: '#059669', fontWeight: 500 }}>
                {th ? 'วันที่ดีที่สุด' : 'Strongest day'}:
              </span>{' '}
              {dowLabels[s.maxIdx]} ({fmtMax})
            </span>
            <span>
              <span style={{ color: '#dc2626', fontWeight: 500 }}>
                {th ? 'วันที่อ่อนแอที่สุด' : 'Weakest day'}:
              </span>{' '}
              {dowLabels[s.minIdx]} ({fmtMin})
            </span>
          </div>
        );
      })()}
    </div>
  );
}
