/**
 * Rolling Metrics Calculator
 * 
 * PART 3: Computes rolling 7-day, 30-day, and trend metrics from daily data.
 * All calculations are done dynamically - no stored aggregates.
 */

import type { DailyMetric } from '../models/daily-metrics';
import { calculateDailyRevenue } from '../models/daily-metrics';
import {
  accommodationBlendedDailyCostThb,
  inferAccommodationDailyMetrics,
  latestMonthlyFixedCostThb,
  sumAdditionalCostToday,
} from './accommodation-economics';

export interface RollingMetrics {
  // Revenue metrics
  revenue_7d: number;
  revenue_30d: number;
  revenue_today: number;
  
  // Cost metrics
  cost_7d: number;
  cost_30d: number;
  cost_today: number;
  
  // Accommodation metrics
  avg_occupancy_7d: number;
  avg_occupancy_30d: number;
  rooms_available: number; // From latest daily metric or branch config
  staff_count: number; // From latest daily metric or branch config (accommodation_daily_metrics.staff_count)
  
  // F&B metrics (if applicable)
  customers_7d?: number;
  avg_ticket_7d?: number;
  avg_top3_menu_pct_30d?: number; // Average % revenue from top 3 menu items (30-day rolling)
  fnb_staff?: number;
  
  // Trend metrics
  revenue_trend_direction: 'up' | 'down' | 'stable';
  margin_trend: 'improving' | 'declining' | 'stable';
  weekend_revenue_ratio: number; // Sat+Sun revenue / weekly revenue
  cash_runway_days: number;
  
  // Confidence metrics
  days_loaded: number;
  days_missing_7d: number;
  days_missing_30d: number;
  confidence_score: number; // 0-100
}

/**
 * Calculate rolling metrics from unified daily_metrics
 * Handles both accommodation and F&B data from single table
 */
export function calculateRollingMetrics(
  dailyRows: DailyMetric[],
  roomsAvailable?: number,
  accommodationStaff?: number,
  fnbStaff?: number
): RollingMetrics {
  // Sort by date descending (newest first)
  const sorted = [...dailyRows].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  if (sorted.length === 0) {
    return createEmptyRollingMetrics(roomsAvailable, accommodationStaff);
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Get today's metric (most recent)
  const todayMetric = sorted[0];
  const todayDate = new Date(todayMetric.date);
  todayDate.setHours(0, 0, 0, 0);
  
  // Filter to last 30 days
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const last30Days = sorted.filter(m => {
    const metricDate = new Date(m.date);
    metricDate.setHours(0, 0, 0, 0);
    return metricDate >= thirtyDaysAgo;
  });
  
  // Filter to last 7 days
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const last7Days = sorted.filter(m => {
    const metricDate = new Date(m.date);
    metricDate.setHours(0, 0, 0, 0);
    return metricDate >= sevenDaysAgo;
  });
  
  // Calculate revenue metrics (use canonical 'revenue' field)
  const revenue_today = todayMetric.revenue || calculateDailyRevenue(todayMetric);
  const revenue_7d = last7Days.reduce((sum, m) => sum + (m.revenue || calculateDailyRevenue(m)), 0);
  const revenue_30d = last30Days.reduce((sum, m) => sum + (m.revenue || calculateDailyRevenue(m)), 0);
  
  const isAccommodation = inferAccommodationDailyMetrics(sorted);
  const mfc = latestMonthlyFixedCostThb(sorted);
  const additional30 = sumAdditionalCostToday(last30Days);
  const blendedDaily = isAccommodation
    ? accommodationBlendedDailyCostThb(additional30, mfc)
    : 0;

  const fnbDayCost = (m: DailyMetric) => (m.cost ?? 0) + (m.additionalCostToday ?? 0);
  const cost_today = isAccommodation ? blendedDaily : fnbDayCost(todayMetric);
  const cost_7d = isAccommodation ? 7 * blendedDaily : last7Days.reduce((sum, m) => sum + fnbDayCost(m), 0);
  const cost_30d = isAccommodation ? 30 * blendedDaily : last30Days.reduce((sum, m) => sum + fnbDayCost(m), 0);

  // Calculate occupancy (if rooms_available is provided, use canonical 'roomsSold')
  const avg_occupancy_7d = roomsAvailable && roomsAvailable > 0
    ? (last7Days.reduce((sum, m) => sum + (m.roomsSold || 0), 0) / (last7Days.length * roomsAvailable)) * 100
    : 0;

  const avg_occupancy_30d = roomsAvailable && roomsAvailable > 0
    ? (last30Days.reduce((sum, m) => sum + (m.roomsSold || 0), 0) / (last30Days.length * roomsAvailable)) * 100
    : 0;

  // Calculate trends
  const revenue_trend_direction = calculateRevenueTrend(last7Days, last30Days);
  const margin_trend = isAccommodation
    ? calculateMarginTrendAccommodation(last7Days, last30Days, blendedDaily)
    : calculateMarginTrendFnb(last7Days, last30Days);
  
  // Calculate weekend revenue ratio (last 7 days)
  const weekend_revenue_ratio = calculateWeekendRevenueRatio(last7Days);
  
  // Calculate cash runway
  const cash_runway_days = calculateCashRunway(
    todayMetric.cashBalance ?? 0,
    cost_7d / 7,
    revenue_7d / 7
  );
  
  // Calculate confidence
  const days_loaded = last30Days.length;
  const days_missing_7d = Math.max(0, 7 - last7Days.length);
  const days_missing_30d = Math.max(0, 30 - last30Days.length);
  const confidence_score = calculateConfidenceScore(days_loaded, days_missing_7d, days_missing_30d);
  
  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[DAILY_ENGINE]', {
      daysLoaded: days_loaded,
      revenue7d: Math.round(revenue_7d),
      revenue30d: Math.round(revenue_30d),
      cost7d: Math.round(cost_7d),
      cost30d: Math.round(cost_30d),
      confidenceScore: confidence_score,
      cashRunwayDays: Math.round(cash_runway_days * 10) / 10,
    });
  }
  
  // Calculate F&B metrics from unified data (if present)
  const customers_7d = last7Days.reduce((sum, m) => sum + (m.customers || 0), 0);
  const avg_ticket_7d = customers_7d > 0 
    ? last7Days.reduce((sum, m) => sum + (m.avgTicket || 0), 0) / last7Days.length
    : undefined;
  
  // Calculate average Top 3 Menu % (30-day rolling average)
  // Compute percentage from revenue internally: top3_menu_revenue / total_revenue * 100
  const top3MenuPctValues = last30Days
    .map(m => {
      // If top3MenuRevenue exists, calculate percentage from revenue
      if (m.top3MenuRevenue !== undefined && m.top3MenuRevenue !== null && m.revenue > 0) {
        return (m.top3MenuRevenue / m.revenue) * 100;
      }
      // Legacy: if top3MenuPct exists, use it (for backward compatibility during migration)
      if ((m as any).top3MenuPct !== undefined && (m as any).top3MenuPct !== null) {
        return (m as any).top3MenuPct;
      }
      return undefined;
    })
    .filter((pct): pct is number => pct !== undefined && pct !== null && !isNaN(pct) && pct >= 0 && pct <= 100);
  const avg_top3_menu_pct_30d = top3MenuPctValues.length > 0
    ? top3MenuPctValues.reduce((sum, pct) => sum + pct, 0) / top3MenuPctValues.length
    : undefined;
  
  // Get rooms_available and staff from latest metric or parameter
  const final_rooms_available = todayMetric.roomsAvailable || roomsAvailable || 0;
  const final_staff_count = todayMetric.accommodationStaff || accommodationStaff || 0;
  const final_fnb_staff = todayMetric.fnbStaff || fnbStaff || 0;
  
  return {
    revenue_7d,
    revenue_30d,
    revenue_today,
    cost_7d,
    cost_30d,
    cost_today,
    avg_occupancy_7d,
    avg_occupancy_30d,
    rooms_available: final_rooms_available,
    staff_count: final_staff_count,
    customers_7d: customers_7d > 0 ? customers_7d : undefined,
    avg_ticket_7d: avg_ticket_7d,
    avg_top3_menu_pct_30d: avg_top3_menu_pct_30d,
    fnb_staff: final_fnb_staff > 0 ? final_fnb_staff : undefined,
    revenue_trend_direction,
    margin_trend,
    weekend_revenue_ratio,
    cash_runway_days,
    days_loaded,
    days_missing_7d,
    days_missing_30d,
    confidence_score,
  };
}


/**
 * Calculate revenue trend direction
 */
function calculateRevenueTrend(
  last7Days: DailyMetric[],
  last30Days: DailyMetric[]
): 'up' | 'down' | 'stable' {
  if (last7Days.length < 7 || last30Days.length < 14) {
    return 'stable';
  }
  
  // Compare last 7 days vs previous 7 days (use canonical 'revenue' field)
  const last7Revenue = last7Days.slice(0, 7).reduce((sum, m) => 
    sum + (m.revenue || calculateDailyRevenue(m)), 0
  );
  
  const previous7Revenue = last30Days.slice(7, 14).reduce((sum, m) => 
    sum + (m.revenue || calculateDailyRevenue(m)), 0
  );
  
  const change = last7Revenue - previous7Revenue;
  const changePercent = previous7Revenue > 0 ? (change / previous7Revenue) * 100 : 0;
  
  if (changePercent > 5) return 'up';
  if (changePercent < -5) return 'down';
  return 'stable';
}

/** profit_margin vs cost: (avg_rev - d) / d */
function calculateMarginTrendAccommodation(
  last7Days: DailyMetric[],
  last30Days: DailyMetric[],
  blendedDaily: number
): 'improving' | 'declining' | 'stable' {
  if (last7Days.length < 7 || last30Days.length < 14 || !(blendedDaily > 0)) {
    return 'stable';
  }
  const avgRev = (days: DailyMetric[]) =>
    days.reduce((sum, m) => sum + (m.revenue || calculateDailyRevenue(m)), 0) / Math.max(1, days.length);
  const last7Avg = avgRev(last7Days.slice(0, 7));
  const prev7Avg = avgRev(last30Days.slice(7, 14));
  const m = (avg: number) => (avg - blendedDaily) / blendedDaily;
  const marginChange = m(last7Avg) - m(prev7Avg);
  if (marginChange > 0.02) return 'improving';
  if (marginChange < -0.02) return 'declining';
  return 'stable';
}

function calculateMarginTrendFnb(
  last7Days: DailyMetric[],
  last30Days: DailyMetric[]
): 'improving' | 'declining' | 'stable' {
  if (last7Days.length < 7 || last30Days.length < 14) {
    return 'stable';
  }

  const dayCost = (m: DailyMetric) => (m.cost ?? 0) + (m.additionalCostToday ?? 0);
  const last7Revenue = last7Days.slice(0, 7).reduce(
    (sum, m) => sum + (m.revenue || calculateDailyRevenue(m)),
    0
  );
  const last7Cost = last7Days.slice(0, 7).reduce((sum, m) => sum + dayCost(m), 0);
  const last7Margin = last7Revenue > 0 ? (last7Revenue - last7Cost) / last7Revenue : 0;

  const previous7Revenue = last30Days.slice(7, 14).reduce(
    (sum, m) => sum + (m.revenue || calculateDailyRevenue(m)),
    0
  );
  const previous7Cost = last30Days.slice(7, 14).reduce((sum, m) => sum + dayCost(m), 0);
  const previous7Margin = previous7Revenue > 0 ? (previous7Revenue - previous7Cost) / previous7Revenue : 0;

  const marginChange = last7Margin - previous7Margin;

  if (marginChange > 0.02) return 'improving';
  if (marginChange < -0.02) return 'declining';
  return 'stable';
}

/**
 * Calculate weekend revenue ratio
 */
function calculateWeekendRevenueRatio(last7Days: DailyMetric[]): number {
  if (last7Days.length === 0) return 0;
  
  let weekendRevenue = 0;
  let totalRevenue = 0;
  
  for (const metric of last7Days) {
    const date = new Date(metric.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    // Use canonical 'revenue' field, derive from metric_date weekday
    const revenue = metric.revenue || calculateDailyRevenue(metric);
    
    totalRevenue += revenue;
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendRevenue += revenue;
    }
  }
  
  return totalRevenue > 0 ? weekendRevenue / totalRevenue : 0;
}

/**
 * Calculate cash runway in days
 */
function calculateCashRunway(
  cashBalance: number,
  avgDailyBurnRate: number,
  avgDailyRevenue: number
): number {
  const netDailyBurn = avgDailyBurnRate - avgDailyRevenue;
  
  if (netDailyBurn <= 0) {
    return Infinity; // Positive cash flow
  }
  
  return cashBalance / netDailyBurn;
}

/**
 * Calculate confidence score based on data coverage
 */
function calculateConfidenceScore(
  daysLoaded: number,
  daysMissing7d: number,
  daysMissing30d: number
): number {
  let score = 100;
  
  // Penalize missing days in last 7
  score -= daysMissing7d * 10; // -10 points per missing day
  
  // Penalize missing days in last 30
  score -= daysMissing30d * 2; // -2 points per missing day
  
  // Ensure minimum score
  return Math.max(0, Math.min(100, score));
}

/**
 * Create empty rolling metrics
 */
function createEmptyRollingMetrics(
  roomsAvailable?: number,
  accommodationStaff?: number
): RollingMetrics {
  return {
    revenue_7d: 0,
    revenue_30d: 0,
    revenue_today: 0,
    cost_7d: 0,
    cost_30d: 0,
    cost_today: 0,
    avg_occupancy_7d: 0,
    avg_occupancy_30d: 0,
    rooms_available: roomsAvailable || 0,
    staff_count: accommodationStaff || 0,
    revenue_trend_direction: 'stable',
    margin_trend: 'stable',
    weekend_revenue_ratio: 0,
    cash_runway_days: 0,
    days_loaded: 0,
    days_missing_7d: 7,
    days_missing_30d: 30,
    confidence_score: 0,
  };
}
