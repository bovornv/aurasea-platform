/**
 * Helpers for Today page compact summary line.
 * - formatPercent: display percentage (e.g. 12.5 -> "12.5%")
 * - calculateDelta: percent change between current and previous (for green/red delta)
 * - getHealthIcon: icon by health score (>=85 ✅, 70-84 ⚠, <70 🔴)
 */

export function formatPercent(value: number, decimals: number = 1): string {
  return `${Number(value).toFixed(decimals)}%`;
}

export function calculateDelta(
  current: number,
  previous: number
): { pct: number; positive: boolean } | null {
  if (previous == null || previous === 0 || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  const pct = ((current - previous) / previous) * 100;
  return { pct, positive: pct >= 0 };
}

export function getHealthIcon(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—';
  const n = Number(score);
  if (n >= 85) return '✅';
  if (n >= 70) return '⚠';
  return '🔴';
}

/** Add days to YYYY-MM-DD string, return YYYY-MM-DD */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
