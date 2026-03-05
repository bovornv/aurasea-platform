/**
 * Daily Metrics to Signals Converter
 * 
 * FINAL PRODUCTION ARCHITECTURE - PART 2
 * 
 * Converts daily_metrics directly to OperationalSignal format
 * No weekly_metrics dependencies
 * No simulation dependencies
 */

import type { DailyMetric } from '../models/daily-metrics';
import type { OperationalSignal } from './operational-signals-service';

/**
 * Convert daily_metrics array to OperationalSignal array
 * Calculates rolling 7-day and 30-day windows from daily data
 */
export function convertDailyMetricsToSignals(
  dailyMetrics: DailyMetric[],
  branchId: string
): OperationalSignal[] {
  if (!dailyMetrics || dailyMetrics.length === 0) {
    return [];
  }
  
  // Sort by date (oldest first)
  const sorted = [...dailyMetrics].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Get branch setup for capacity/staff data
  let roomsAvailable: number | undefined;
  let accommodationStaff: number | undefined;
  let fnbStaff: number | undefined;
  
  try {
    const { businessGroupService } = require('./business-group-service');
    const businessGroup = businessGroupService.getBusinessGroup();
    const branch = businessGroup?.branches.find((b: any) => b.id === branchId);
    if (branch) {
      // Get setup data from branches table (FINAL PRODUCTION SCHEMA)
      roomsAvailable = (branch as any).rooms_available;
      accommodationStaff = (branch as any).accommodation_staff_count;
      fnbStaff = (branch as any).fnb_staff_count;
    }
  } catch (e) {
    // Ignore - will use defaults
  }
  
  const signals: OperationalSignal[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const metric = sorted[i];
    const signalDate = new Date(metric.date);
    signalDate.setHours(12, 0, 0, 0);
    
    // Calculate rolling windows up to this day
    const daysUpToNow = sorted.slice(0, i + 1);
    
    // 7-day window (last 7 days up to this point)
    const last7Days = daysUpToNow.slice(-7);
    const dayCost = (m: DailyMetric) => (m.cost ?? 0) + (m.additionalCostToday ?? 0);
    const revenue7Days = last7Days.reduce((sum, m) => sum + m.revenue, 0);
    const costs7Days = last7Days.reduce((sum, m) => sum + dayCost(m), 0);
    
    const last30Days = daysUpToNow.slice(-30);
    const revenue30Days = last30Days.reduce((sum, m) => sum + m.revenue, 0);
    const costs30Days = last30Days.reduce((sum, m) => sum + dayCost(m), 0);
    
    // Calculate occupancy (if accommodation)
    let occupancyRate: number | undefined;
    if (metric.roomsSold !== undefined && roomsAvailable && roomsAvailable > 0) {
      occupancyRate = metric.roomsSold / roomsAvailable;
    }
    
    // Calculate ADR (if accommodation)
    const averageDailyRate = metric.adr;
    
    // Calculate customer volume (if F&B)
    const customerVolume = metric.customers;
    
    // Determine staff count
    const staffCount = accommodationStaff || fnbStaff || 10;
    
    const dailyRevenue = metric.revenue;
    const dailyExpenses = (metric.cost ?? 0) + (metric.additionalCostToday ?? 0);
    const netCashFlow = dailyRevenue - dailyExpenses;
    
    const signal: OperationalSignal = {
      timestamp: signalDate,
      cashBalance: metric.cashBalance || 0,
      revenue7Days,
      revenue30Days,
      costs7Days,
      costs30Days,
      staffCount,
      occupancyRate,
      averageDailyRate,
      totalRooms: roomsAvailable,
      customerVolume,
      branchId,
      // Daily fields for alert rules
      dailyRevenue,
      dailyExpenses,
      netCashFlow,
    };
    
    // Calculate weekend/weekday revenue for alerts (if we have enough data)
    if (daysUpToNow.length >= 30) {
      const last30DaysForWeekend = daysUpToNow.slice(-30);
      let weekdayRevenue = 0;
      let weekendRevenue = 0;
      
      last30DaysForWeekend.forEach(m => {
        const date = new Date(m.date);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendRevenue += m.revenue;
        } else {
          weekdayRevenue += m.revenue;
        }
      });
      
      signal.weekdayRevenue30d = weekdayRevenue;
      signal.weekendRevenue30d = weekendRevenue;
    }
    
    // Calculate 14-day weekday/weekend averages for F&B alerts
    if (daysUpToNow.length >= 14 && customerVolume !== undefined) {
      const last14Days = daysUpToNow.slice(-14);
      let weekdayRevenue14d = 0;
      let weekendRevenue14d = 0;
      let weekdayDays = 0;
      let weekendDays = 0;
      
      last14Days.forEach(m => {
        const date = new Date(m.date);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendRevenue14d += m.revenue;
          weekendDays++;
        } else {
          weekdayRevenue14d += m.revenue;
          weekdayDays++;
        }
      });
      
      signal.avgWeekdayRevenue14d = weekdayDays > 0 ? weekdayRevenue14d / weekdayDays : undefined;
      signal.avgWeekendRevenue14d = weekendDays > 0 ? weekendRevenue14d / weekendDays : undefined;
    }
    
    signals.push(signal);
  }
  
  // Return sorted by timestamp (newest first)
  return signals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
