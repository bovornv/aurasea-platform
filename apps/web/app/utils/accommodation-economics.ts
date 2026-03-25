/**
 * Accommodation unit economics — uses real columns only:
 * `additional_cost_today`, `monthly_fixed_cost` (no legacy `cost` / staff_cost).
 *
 * Blended daily cost: (SUM(additional_cost_today over trailing 30 calendar days) + monthly_fixed_cost) / 30
 * Profitability: profit = revenue - daily_cost, profit_margin = profit / daily_cost (null if daily_cost <= 0)
 */
import type { DailyMetric } from '../models/daily-metrics';
import { calculateDailyRevenue } from '../models/daily-metrics';

export function sumAdditionalCostToday(metrics: DailyMetric[]): number {
  return metrics.reduce((sum, m) => sum + (m.additionalCostToday ?? 0), 0);
}

/** Prefer newest row (sorted descending by date) with a positive monthly_fixed_cost. */
export function latestMonthlyFixedCostThb(sortedDesc: DailyMetric[], paramFallback?: number): number {
  for (const m of sortedDesc) {
    if (m.monthlyFixedCost != null) {
      const v = Number(m.monthlyFixedCost);
      if (!Number.isNaN(v) && v >= 0) return v;
    }
  }
  if (paramFallback != null && !Number.isNaN(Number(paramFallback)) && Number(paramFallback) >= 0) {
    return Number(paramFallback);
  }
  return 0;
}

export function accommodationBlendedDailyCostThb(additionalCost30dSum: number, monthlyFixedCostThb: number): number {
  return (additionalCost30dSum + monthlyFixedCostThb) / 30;
}

export function accommodationProfitAndMargin(
  revenue: number,
  blendedDailyCost: number
): { profit: number; profitMargin: number | null } {
  const profit = revenue - blendedDailyCost;
  const profitMargin = blendedDailyCost > 0 ? profit / blendedDailyCost : null;
  return { profit, profitMargin };
}

/** True if metrics look like accommodation (rooms), not F&B-only. */
export function inferAccommodationDailyMetrics(sortedDesc: DailyMetric[]): boolean {
  return sortedDesc.some(
    (m) =>
      (m.roomsAvailable != null && m.roomsAvailable > 0) ||
      (m.roomsSold != null && m.roomsSold > 0)
  );
}

/** Point-in-time: occupancy 0–1, ADR, RevPAR from one day (revenue + rooms). */
/**
 * `accommodation_today_metrics_ui.occupancy` may be 0–1 ratio or 0–100 percent.
 */
export function occupancyPercentFromMetric(occupancy: number | null | undefined): number | null {
  if (occupancy == null || Number.isNaN(Number(occupancy))) return null;
  const n = Number(occupancy);
  if (n < 0) return null;
  if (n === 0) return 0;
  if (n <= 1) return n * 100;
  return n;
}

export function accommodationPointKpis(metric: DailyMetric): {
  occupancyRate: number | null;
  adr: number | null;
  revpar: number | null;
} {
  const revenue = metric.revenue || calculateDailyRevenue(metric);
  const sold = metric.roomsSold ?? 0;
  const avail = metric.roomsAvailable ?? 0;
  const occupancyRate =
    avail > 0 && sold >= 0 ? Math.min(1, sold / avail) : null;
  const adr = sold > 0 ? revenue / sold : null;
  const revpar = avail > 0 ? revenue / avail : null;
  return { occupancyRate, adr, revpar };
}
