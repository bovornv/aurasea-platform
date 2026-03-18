/**
 * Headline metric and "vs last week" for Trends chart cards.
 * Uses last 7 days avg vs previous 7 days avg when ≥14 points; otherwise null.
 */
export function headlineDelta(
  values: number[],
  _dates?: string[]
): { current: number; pctVsLastWeek: number | null } {
  if (!values || values.length < 2) return { current: 0, pctVsLastWeek: null };
  const current = values[values.length - 1] ?? 0;
  if (values.length < 14) return { current, pctVsLastWeek: null };
  const last7 = values.slice(-7);
  const prev7 = values.slice(-14, -7);
  const avgLast7 = last7.reduce((a, b) => a + b, 0) / last7.length;
  const avgPrev7 = prev7.reduce((a, b) => a + b, 0) / prev7.length;
  if (avgPrev7 === 0) return { current, pctVsLastWeek: null };
  const pctVsLastWeek = ((avgLast7 - avgPrev7) / avgPrev7) * 100;
  return { current, pctVsLastWeek };
}

/** Format headline: "36% ↓ (−12% vs last week)" or "฿18,371 ↑ (+5% vs last week)" or "1,234 ↓ (−12% vs last week)". */
export function formatHeadline(
  current: number,
  pctVsLastWeek: number | null,
  kind: 'percent' | 'currency' | 'number'
): string {
  const arrow = pctVsLastWeek == null ? '' : pctVsLastWeek >= 0 ? '↑' : '↓';
  const valueStr =
    kind === 'percent' ? `${Math.round(current)}%`
    : kind === 'currency' ? `฿${Math.round(current).toLocaleString()}`
    : String(Math.round(current).toLocaleString());
  if (pctVsLastWeek == null) return valueStr;
  const sign = pctVsLastWeek >= 0 ? '+' : '';
  return `${valueStr} ${arrow} (${sign}${Math.round(pctVsLastWeek)}% vs last week)`;
}

/** 0 = Sun, 6 = Sat. Uses noon to avoid timezone date-boundary issues. */
export function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay();
}

/** Short date for x-axis: e.g. "Mar 1", "Mar 10". Uses noon for consistent day. */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isWeekend(dateStr: string): boolean {
  const dow = getDayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

/** Rolling 7-day average for baseline. Returns same length; first 6 values are null. */
export function rolling7Avg(values: number[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < 6) {
      out.push(null);
      continue;
    }
    const slice = values.slice(i - 6, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / 7);
  }
  return out;
}
