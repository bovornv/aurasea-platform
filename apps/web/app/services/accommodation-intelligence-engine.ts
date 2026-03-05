/**
 * Accommodation Intelligence Engine
 * 
 * PART 2: Simple Rule-Based AI
 * Detects early signals using simple rolling logic
 * 
 * Rules:
 * - Demand Drop Warning: 7-day avg rooms_sold < previous 7-day avg by 15%
 * - Revenue Decline: 14-day revenue trend downward > 10%
 * - Liquidity Risk: cash_balance / avg_daily_cost < 14 days
 * - Cost Escalation: 7-day avg cost > 14-day avg cost by 20%
 * - Data Gap Warning: no update in last 3 days
 */

import type { DailyMetric } from '../models/daily-metrics';
import { calculateDailyRevenue } from '../models/daily-metrics';

export type AlertType = 
  | 'demand_softening'
  | 'revenue_downtrend'
  | 'low_cash_runway'
  | 'cost_spike'
  | 'missing_monitoring_data';

export interface AccommodationAlert {
  id: string;
  type: AlertType;
  severity: 'critical' | 'warning' | 'informational';
  message: string;
  recommendation: string;
  timestamp: Date;
  confidence: number; // 0-1
}

/**
 * Calculate 7-day average of rooms sold
 */
function calculate7DayAvgRoomsSold(metrics: DailyMetric[], endDate: Date): number | null {
  const sevenDaysAgo = new Date(endDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= sevenDaysAgo && metricDate <= endDate;
  });
  
  if (relevantMetrics.length === 0) return null;
  
  const totalRooms = relevantMetrics.reduce((sum, m) => sum + (m.roomsSold ?? 0), 0);
  return totalRooms / relevantMetrics.length;
}

/**
 * Calculate 7-day average of costs
 */
function calculate7DayAvgCost(metrics: DailyMetric[], endDate: Date): number | null {
  const sevenDaysAgo = new Date(endDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= sevenDaysAgo && metricDate <= endDate;
  });
  
  if (relevantMetrics.length === 0) return null;
  
  // Use canonical 'cost' field from unified daily_metrics
  const totalCost = relevantMetrics.reduce((sum, m) => sum + (m.cost || 0), 0);
  return totalCost / relevantMetrics.length;
}

/**
 * Calculate 14-day revenue trend
 * Returns percentage change (positive = increase, negative = decrease)
 */
function calculate14DayRevenueTrend(metrics: DailyMetric[], endDate: Date): number | null {
  const fourteenDaysAgo = new Date(endDate);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= fourteenDaysAgo && metricDate <= endDate;
  });
  
  if (relevantMetrics.length < 7) return null; // Need at least 7 days
  
  // Split into first 7 days and last 7 days
  const sorted = relevantMetrics.sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  const firstWeek = sorted.slice(0, Math.floor(sorted.length / 2));
  const lastWeek = sorted.slice(-Math.floor(sorted.length / 2));
  
  // Use canonical 'revenue' field from unified daily_metrics
  const firstWeekRevenue = firstWeek.reduce((sum, m) => 
    sum + (m.revenue || calculateDailyRevenue(m)), 0
  );
  const lastWeekRevenue = lastWeek.reduce((sum, m) => 
    sum + (m.revenue || calculateDailyRevenue(m)), 0
  );
  
  if (firstWeekRevenue === 0) return null;
  
  const percentChange = ((lastWeekRevenue - firstWeekRevenue) / firstWeekRevenue) * 100;
  return percentChange;
}

/**
 * Calculate average daily cost
 */
function calculateAvgDailyCost(metrics: DailyMetric[], days: number, endDate: Date): number | null {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);
  
  const relevantMetrics = metrics.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= startDate && metricDate <= endDate;
  });
  
  if (relevantMetrics.length === 0) return null;
  
  // Use canonical 'cost' field from unified daily_metrics
  const totalCost = relevantMetrics.reduce((sum, m) => sum + (m.cost || 0), 0);
  return totalCost / relevantMetrics.length;
}

/**
 * Get days since last update
 */
function getDaysSinceLastUpdate(metrics: DailyMetric[]): number | null {
  if (metrics.length === 0) return null;
  
  const latest = metrics.reduce((latest, m) => {
    const latestDate = new Date(latest.date);
    const mDate = new Date(m.date);
    return mDate > latestDate ? m : latest;
  });
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latestDate = new Date(latest.date);
  latestDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - latestDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Evaluate all alerts for accommodation monitoring
 */
export function evaluateAccommodationAlerts(
  metrics: DailyMetric[],
  branchId: string
): AccommodationAlert[] {
  const alerts: AccommodationAlert[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (metrics.length === 0) {
    // No data alert
    alerts.push({
      id: `missing_monitoring_data_${branchId}_${Date.now()}`,
      type: 'missing_monitoring_data',
      severity: 'warning',
      message: 'No monitoring data available. Please update daily metrics.',
      recommendation: 'Update daily metrics to improve accuracy.',
      timestamp: today,
      confidence: 0.5,
    });
    return alerts;
  }
  
  // Sort metrics by date (oldest first)
  const sortedMetrics = [...metrics].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // 1. Demand Softening Alert
  const current7DayAvg = calculate7DayAvgRoomsSold(sortedMetrics, today);
  if (current7DayAvg !== null) {
    const previous7DayEnd = new Date(today);
    previous7DayEnd.setDate(previous7DayEnd.getDate() - 7);
    const previous7DayAvg = calculate7DayAvgRoomsSold(sortedMetrics, previous7DayEnd);
    
    if (previous7DayAvg !== null && previous7DayAvg > 0) {
      const percentChange = ((current7DayAvg - previous7DayAvg) / previous7DayAvg) * 100;
      
      if (percentChange < -15) {
        alerts.push({
          id: `demand_softening_${branchId}_${Date.now()}`,
          type: 'demand_softening',
          severity: percentChange < -30 ? 'critical' : 'warning',
          message: `Demand softening detected: ${Math.abs(percentChange).toFixed(1)}% decrease in rooms sold (7-day avg).`,
          recommendation: 'Consider limited-time weekday promotions or OTA visibility boost.',
          timestamp: today,
          confidence: 0.8,
        });
      }
    }
  }
  
  // 2. Revenue Downtrend Alert
  const revenueTrend = calculate14DayRevenueTrend(sortedMetrics, today);
  if (revenueTrend !== null && revenueTrend < -10) {
    alerts.push({
      id: `revenue_downtrend_${branchId}_${Date.now()}`,
      type: 'revenue_downtrend',
      severity: revenueTrend < -20 ? 'critical' : 'warning',
      message: `Revenue downtrend detected: ${Math.abs(revenueTrend).toFixed(1)}% decrease over 14 days.`,
      recommendation: 'Check ADR positioning vs competitors.',
      timestamp: today,
      confidence: 0.75,
    });
  }
  
  // 3. Liquidity Risk Alert
  const latestMetric = sortedMetrics[sortedMetrics.length - 1];
  const avgDailyCost = calculateAvgDailyCost(sortedMetrics, 14, today);
  
  if (latestMetric && avgDailyCost !== null && avgDailyCost > 0) {
    const cashRunwayDays = (latestMetric.cashBalance ?? 0) / avgDailyCost;
    
    if (cashRunwayDays < 14) {
      alerts.push({
        id: `low_cash_runway_${branchId}_${Date.now()}`,
        type: 'low_cash_runway',
        severity: cashRunwayDays < 7 ? 'critical' : 'warning',
        message: `Low cash runway: ${cashRunwayDays.toFixed(1)} days remaining at current burn rate.`,
        recommendation: 'Delay capex and consider short-term occupancy campaign.',
        timestamp: today,
        confidence: 0.85,
      });
    }
  }
  
  // 4. Cost Escalation Alert
  const current7DayAvgCost = calculate7DayAvgCost(sortedMetrics, today);
  if (current7DayAvgCost !== null) {
    const previous7DayEnd = new Date(today);
    previous7DayEnd.setDate(previous7DayEnd.getDate() - 7);
    const previous7DayAvgCost = calculate7DayAvgCost(sortedMetrics, previous7DayEnd);
    
    if (previous7DayAvgCost !== null && previous7DayAvgCost > 0) {
      const percentChange = ((current7DayAvgCost - previous7DayAvgCost) / previous7DayAvgCost) * 100;
      
      if (percentChange > 20) {
        alerts.push({
          id: `cost_spike_${branchId}_${Date.now()}`,
          type: 'cost_spike',
          severity: percentChange > 40 ? 'critical' : 'warning',
          message: `Cost spike detected: ${percentChange.toFixed(1)}% increase in operating costs (7-day avg).`,
          recommendation: 'Review variable expenses or staff scheduling.',
          timestamp: today,
          confidence: 0.8,
        });
      }
    }
  }
  
  // 5. Missing Monitoring Data Alert
  const daysSinceUpdate = getDaysSinceLastUpdate(sortedMetrics);
  if (daysSinceUpdate !== null && daysSinceUpdate > 3) {
    alerts.push({
      id: `missing_monitoring_data_${branchId}_${Date.now()}`,
      type: 'missing_monitoring_data',
      severity: daysSinceUpdate > 7 ? 'warning' : 'informational',
      message: `Missing monitoring data: No update in last ${daysSinceUpdate} days.`,
      recommendation: 'Update daily metrics to improve accuracy.',
      timestamp: today,
      confidence: 0.9,
    });
  }
  
  return alerts;
}
