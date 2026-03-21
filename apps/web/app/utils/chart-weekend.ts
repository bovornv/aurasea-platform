/**
 * Shared weekend styling and helpers for time-series / chart UI.
 * YYYY-MM-DD strings use local noon so getDay() matches calendar day in local TZ.
 */

export interface ChartWeekendStyle {
  backgroundColor: string;
  borderColor: string;
}

export function getWeekendStyle(): ChartWeekendStyle {
  return {
    backgroundColor: 'rgba(0, 0, 0, 0.13)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  };
}

/** SVG rect stroke width (user units); thin on mobile */
export const CHART_WEEKEND_BAND_STROKE_WIDTH = 0.85;

/**
 * 0 = Sun … 6 = Sat (same as Date#getDay).
 * For `YYYY-MM-DD` only, parses at noon to avoid UTC midnight shifting the calendar day.
 */
export function getChartDayOfWeek(date: string | Date | number): number {
  const d =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00`).getDay()
      : new Date(date).getDay();
  return d;
}

export function isWeekend(date: string | Date | number): boolean {
  const d = getChartDayOfWeek(date);
  return d === 0 || d === 6;
}

/** Sat→Sun consecutive daily points → one band [x1,x2) in plot coordinates */
export function computeTimeSeriesWeekendBands(
  valuesLength: number,
  dates: readonly (string | Date | number)[],
  plotLeft: number,
  plotWidth: number
): { x1: number; x2: number }[] {
  const n = valuesLength;
  if (n < 2 || !dates.length) return [];
  const count = Math.min(dates.length, n);
  if (count < 2) return [];
  const bands: { x1: number; x2: number }[] = [];
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < count - 1; i++) {
    const day0 = getChartDayOfWeek(dates[i]!);
    const day1 = getChartDayOfWeek(dates[i + 1]!);
    if (day0 === 6 && day1 === 0) {
      bands.push({
        x1: plotLeft + (i / denom) * plotWidth,
        x2: plotLeft + ((i + 1) / denom) * plotWidth,
      });
    }
  }
  return bands;
}
