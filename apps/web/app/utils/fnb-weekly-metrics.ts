/**
 * F&B Weekly Cost Metrics — pure computation utility.
 *
 * Inputs:
 *   - purchases: FnbPurchaseRow[] for current week (Mon to today)
 *   - dailyMetrics: DailyMetric[] for last 30 days
 *   - monthlyFixedCost: number | null
 *
 * Outputs: FnbWeeklyMetrics — all nullable when data is unavailable.
 */

import type { FnbPurchaseRow } from '../services/db/fnb-purchase-service';
import type { DailyMetric } from '../models/daily-metrics';

export type FoodCostStatus = 'good' | 'watch' | 'warning' | 'critical';

export interface FnbWeeklyMetrics {
  /** ฿ total food & beverage purchases Mon–today */
  weeklyFoodPurchases: number | null;
  /** ฿ total non-food supply purchases Mon–today */
  weeklyNonFoodPurchases: number | null;
  /** ฿ total revenue Mon–today from fnb_daily_metrics */
  weeklyRevenue: number | null;
  /** food_cost_pct = weeklyFoodPurchases / weeklyRevenue * 100 */
  foodCostPct: number | null;
  /** number of days from Monday to today inclusive (1=Mon, 7=Sun) */
  daysElapsedThisWeek: number;
  /** avg daily food cost = weeklyFoodPurchases / daysElapsed */
  dailyFoodCostEstimate: number | null;
  /** (today.revenue - dailyFoodCostEstimate) / today.customers */
  todayGrossProfitPerCustomer: number | null;
  /** monthlyFixedCost / daysInCurrentMonth */
  dailyFixedCost: number | null;
  /** ceil(dailyFixedCost / todayGrossProfitPerCustomer) */
  breakevenCustomers: number | null;
  /** today's total_customers */
  todayCustomers: number | null;
  /** todayCustomers >= breakevenCustomers */
  aboveBreakeven: boolean | null;
  /** categorised food cost status */
  foodCostStatus: FoodCostStatus | null;
}

/** Get ISO weekday: Mon=0 ... Sun=6 */
function isoWeekday(date: Date): number {
  const d = date.getDay(); // 0=Sun..6=Sat
  return d === 0 ? 6 : d - 1;
}

/** Monday of current week as YYYY-MM-DD */
function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const dow = isoWeekday(now); // 0=Mon..6=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  return monday.toISOString().slice(0, 10);
}

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function foodCostStatus(pct: number | null): FoodCostStatus | null {
  if (pct == null) return null;
  if (pct > 45) return 'critical';
  if (pct > 35) return 'warning';
  if (pct >= 28) return 'watch';
  return 'good';
}

export function computeFnbWeeklyMetrics(
  purchases: FnbPurchaseRow[],
  dailyMetrics: DailyMetric[],
  monthlyFixedCost: number | null
): FnbWeeklyMetrics {
  const monday = getMondayOfCurrentWeek();
  const today = getTodayIso();

  // Days elapsed this week (Mon=1 ... today)
  const mondayDate = new Date(`${monday}T12:00:00`);
  const todayDate = new Date(`${today}T12:00:00`);
  const msPerDay = 86400000;
  const daysElapsedThisWeek = Math.round((todayDate.getTime() - mondayDate.getTime()) / msPerDay) + 1;

  // Weekly purchase totals (Mon–today only)
  const weekPurchases = purchases.filter(
    (p) => p.purchase_date >= monday && p.purchase_date <= today
  );
  const weeklyFoodPurchases =
    weekPurchases.length > 0
      ? weekPurchases
          .filter((p) => p.purchase_type === 'food_beverage')
          .reduce((s, p) => s + p.amount, 0)
      : null;
  const weeklyNonFoodPurchases =
    weekPurchases.length > 0
      ? weekPurchases
          .filter((p) => p.purchase_type === 'non_food_supplies')
          .reduce((s, p) => s + p.amount, 0)
      : null;

  // Weekly revenue (Mon–today) from dailyMetrics
  const weekMetrics = dailyMetrics.filter(
    (m) => m.date >= monday && m.date <= today
  );
  const weeklyRevenue =
    weekMetrics.length > 0
      ? weekMetrics.reduce((s, m) => s + (m.revenue ?? 0), 0)
      : null;

  // Food cost %
  const foodCostPct =
    weeklyFoodPurchases != null && weeklyFoodPurchases > 0 && weeklyRevenue != null && weeklyRevenue > 0
      ? Math.round((weeklyFoodPurchases / weeklyRevenue) * 1000) / 10
      : null;

  // Daily food cost estimate
  const dailyFoodCostEstimate =
    weeklyFoodPurchases != null && weeklyFoodPurchases > 0
      ? weeklyFoodPurchases / daysElapsedThisWeek
      : null;

  // Today's metrics row
  const sortedMetrics = [...dailyMetrics].sort((a, b) => b.date.localeCompare(a.date));
  const todayMetric = sortedMetrics[0] ?? null;
  const todayCustomers = todayMetric?.customers ?? null;
  const todayRevenue = todayMetric?.revenue ?? null;

  // Today gross profit per customer
  let todayGrossProfitPerCustomer: number | null = null;
  if (
    dailyFoodCostEstimate != null &&
    todayRevenue != null &&
    todayCustomers != null &&
    todayCustomers > 0
  ) {
    todayGrossProfitPerCustomer = (todayRevenue - dailyFoodCostEstimate) / todayCustomers;
  }

  // Daily fixed cost
  const dailyFixedCost =
    monthlyFixedCost != null && monthlyFixedCost > 0
      ? monthlyFixedCost / daysInCurrentMonth()
      : null;

  // Breakeven customers
  let breakevenCustomers: number | null = null;
  if (
    dailyFixedCost != null &&
    todayGrossProfitPerCustomer != null &&
    todayGrossProfitPerCustomer > 0
  ) {
    breakevenCustomers = Math.ceil(dailyFixedCost / todayGrossProfitPerCustomer);
  }

  // Above breakeven
  const aboveBreakeven =
    breakevenCustomers != null && todayCustomers != null
      ? todayCustomers >= breakevenCustomers
      : null;

  return {
    weeklyFoodPurchases,
    weeklyNonFoodPurchases,
    weeklyRevenue,
    foodCostPct,
    daysElapsedThisWeek,
    dailyFoodCostEstimate,
    todayGrossProfitPerCustomer,
    dailyFixedCost,
    breakevenCustomers,
    todayCustomers,
    aboveBreakeven,
    foodCostStatus: foodCostStatus(foodCostPct),
  };
}
