/**
 * F&B Health Engine
 * 
 * PART 3: Health engine logic for F&B monitoring
 * Computes alerts from daily data
 * PART 4: Confidence system integration
 * PART 7: Guarantees - never freeze, always compute, max 3 alerts
 */

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { DailyMetric } from '../models/daily-metrics';

export interface FnbHealthScore {
  rawScore: number; // 0-100 before confidence penalty
  finalScore: number; // rawScore * coverage_ratio
  confidence: {
    coverage_ratio: number;
    level: 'High' | 'Medium' | 'Low' | 'Very Low';
  };
  alerts: AlertContract[];
  recommendations: string[];
}

/**
 * PART 3: Evaluate F&B alerts from unified daily_metrics
 * PART 7: Guarantees - always returns max 3 alerts, never freezes
 * 
 * Data Guard: Returns empty state if no data (no fallback)
 */
export function evaluateFnbHealth(
  dailyMetrics: DailyMetric[],
  branchId: string
): FnbHealthScore {
  // Data Guard: Return empty state if no data
  if (!dailyMetrics || dailyMetrics.length === 0) {
    return {
      rawScore: 0,
      finalScore: 0,
      confidence: {
        coverage_ratio: 0,
        level: 'Very Low',
      },
      alerts: [],
      recommendations: [],
    };
  }

  // Compute F&B metrics from unified daily_metrics (canonical fields)
  const computed = computeFnbMetricsFromUnified(dailyMetrics);
  const alerts: AlertContract[] = [];

  // PART 3: Alert Rules - Use unified daily_metrics fields

  // 1. Demand Drop: 7-day avg customers < previous 7-day by 15%
  if (dailyMetrics.length >= 14) {
    const current7Days = dailyMetrics.slice(0, 7);
    const previous7Days = dailyMetrics.slice(7, 14);
    
    // Use canonical 'customers' field
    const currentAvg = current7Days.reduce((sum, m) => sum + (m.customers || 0), 0) / current7Days.length;
    const previousAvg = previous7Days.reduce((sum, m) => sum + (m.customers || 0), 0) / previous7Days.length;
    
    if (previousAvg > 0 && currentAvg < previousAvg * 0.85) {
      const dropPercent = ((previousAvg - currentAvg) / previousAvg) * 100;
      alerts.push({
        id: `fnb-demand-drop-${branchId}-${Date.now()}`,
        type: 'risk',
        severity: dropPercent > 25 ? 'critical' : dropPercent > 15 ? 'warning' : 'informational',
        title: 'Demand Drop Detected',
        message: `Customer volume dropped ${dropPercent.toFixed(1)}% compared to previous week`,
        revenueImpact: computed.avg_sales_7d * (dropPercent / 100),
        conditions: {
          current_avg_customers: currentAvg,
          previous_avg_customers: previousAvg,
          drop_percent: dropPercent,
        },
        recommendations: [
          'Review marketing campaigns',
          'Check competitor activity',
          'Consider promotional offers',
        ],
        timeHorizon: 'near-term',
        scope: 'cafe_restaurant',
      } as unknown as AlertContract);
    }
  }

  // 2. Revenue Downtrend: 14-day revenue downtrend >10% (use canonical 'revenue' field)
  if (dailyMetrics.length >= 14) {
    const first7Days = dailyMetrics.slice(7, 14);
    const last7Days = dailyMetrics.slice(0, 7);
    
    // Use canonical 'revenue' field
    const firstAvg = first7Days.reduce((sum, m) => sum + (m.revenue || 0), 0) / first7Days.length;
    const lastAvg = last7Days.reduce((sum, m) => sum + (m.revenue || 0), 0) / last7Days.length;
    
    if (firstAvg > 0 && lastAvg < firstAvg * 0.90) {
      const downtrendPercent = ((firstAvg - lastAvg) / firstAvg) * 100;
      alerts.push({
        id: `fnb-revenue-downtrend-${branchId}-${Date.now()}`,
        type: 'revenue_downtrend',
        severity: downtrendPercent > 20 ? 'critical' : 'warning',
        title: 'Revenue Downtrend',
        message: `Sales declined ${downtrendPercent.toFixed(1)}% over last 14 days`,
        revenueImpact: (firstAvg - lastAvg) * 7, // Weekly impact
        conditions: {
          first_week_avg: firstAvg,
          last_week_avg: lastAvg,
          downtrend_percent: downtrendPercent,
        },
        recommendations: [
          'Analyze menu performance',
          'Review pricing strategy',
          'Check customer feedback',
        ],
        timeHorizon: 'medium-term',
        scope: 'cafe_restaurant',
      } as unknown as AlertContract);
    }
  }

  // 3. Margin Compression: margin <10%
  if (computed.margin_7d < 10) {
    alerts.push({
      id: `fnb-margin-compression-${branchId}-${Date.now()}`,
      type: 'margin_compression',
      severity: computed.margin_7d < 0 ? 'critical' : computed.margin_7d < 5 ? 'warning' : 'informational',
      title: 'Margin Compression',
      message: `Profit margin is ${computed.margin_7d.toFixed(1)}% (below 10% threshold)`,
      revenueImpact: computed.margin_7d < 0 
        ? computed.avg_sales_7d * 7 // Full revenue at risk if negative
        : (10 - computed.margin_7d) / 100 * computed.avg_sales_7d * 7,
      conditions: {
        current_margin: computed.margin_7d,
        threshold: 10,
      },
      recommendations: [
        'Review cost structure',
        'Optimize inventory management',
        'Consider menu price adjustments',
      ],
      timeHorizon: 'immediate',
      scope: 'cafe_restaurant',
    } as unknown as AlertContract);
  }

  // 4. Low Cash Runway: cash_balance / avg_daily_cost < 14 days
  if (computed.cash_runway_days < 14) {
    alerts.push({
      id: `fnb-low-cash-runway-${branchId}-${Date.now()}`,
      type: 'liquidity_runway',
      severity: computed.cash_runway_days < 7 ? 'critical' : 'warning',
      title: 'Low Cash Runway',
      message: `Only ${computed.cash_runway_days.toFixed(1)} days of cash remaining at current burn rate`,
      revenueImpact: 0, // Not a revenue issue, but operational risk
      conditions: {
        cash_balance: dailyMetrics[0].cashBalance, // Use canonical 'cashBalance' field
        avg_daily_cost: computed.avg_daily_cost,
        runway_days: computed.cash_runway_days,
      },
      recommendations: [
        'Secure additional financing',
        'Reduce operating costs immediately',
        'Accelerate receivables collection',
      ],
      timeHorizon: 'immediate',
      scope: 'cafe_restaurant',
    } as unknown as AlertContract);
  }

  // 5. Weekend Concentration: Sat+Sun revenue >55% of weekly
  if (computed.weekend_concentration_pct > 55) {
    alerts.push({
      id: `fnb-weekend-concentration-${branchId}-${Date.now()}`,
      type: 'weekend_concentration',
      severity: computed.weekend_concentration_pct > 70 ? 'warning' : 'informational',
      title: 'Weekend Concentration Risk',
      message: `${computed.weekend_concentration_pct.toFixed(1)}% of weekly revenue comes from weekends`,
      revenueImpact: 0, // Not direct revenue loss, but risk
      conditions: {
        weekend_concentration_pct: computed.weekend_concentration_pct,
        threshold: 55,
      },
      recommendations: [
        'Develop weekday promotions',
        'Target weekday customer segments',
        'Consider weekday events',
      ],
      timeHorizon: 'medium-term',
      scope: 'cafe_restaurant',
    } as unknown as AlertContract);
  }

  // 6. Data Gap: Missing >3 days in last 7
  const last7Days = dailyMetrics.slice(0, 7);
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const expectedDays = 7;
  const actualDays = last7Days.length;
  const missingDays = expectedDays - actualDays;
  
  if (missingDays > 3) {
    alerts.push({
      id: `fnb-data-gap-${branchId}-${Date.now()}`,
      type: 'data_gap',
      severity: missingDays > 5 ? 'warning' : 'informational',
      title: 'Data Gap Detected',
      message: `Missing ${missingDays} days of data in last 7 days`,
      revenueImpact: 0,
      conditions: {
        expected_days: expectedDays,
        actual_days: actualDays,
        missing_days: missingDays,
      },
      recommendations: [
        'Update daily metrics regularly',
        'Set up daily reminders',
        'Automate data collection if possible',
      ],
      timeHorizon: 'immediate',
      scope: 'cafe_restaurant',
    } as unknown as AlertContract);
  }

  // PART 7: Always return max 3 alerts (prioritize by severity)
  const sortedAlerts = alerts.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, informational: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  const top3Alerts = sortedAlerts.slice(0, 3);

  // Calculate health score (0-100)
  // Base score starts at 100, deduct points for each alert
  let rawScore = 100;
  top3Alerts.forEach(alert => {
    if (alert.severity === 'critical') {
      rawScore -= 30;
    } else if (alert.severity === 'warning') {
      rawScore -= 15;
    } else {
      rawScore -= 5;
    }
  });
  rawScore = Math.max(0, Math.min(100, rawScore));

  // PART 4: Apply confidence penalty
  const finalScore = rawScore * computed.data_coverage_ratio;

  // PART 7: Always generate at least 1 recommendation when alert exists
  const recommendations: string[] = [];
  if (top3Alerts.length > 0) {
    // Collect unique recommendations from alerts
    top3Alerts.forEach(alert => {
      const recs = (alert as { recommendations?: string[] }).recommendations;
      if (recs) recommendations.push(...recs);
    });
    // Ensure at least 1 recommendation
    if (recommendations.length === 0) {
      recommendations.push('Review daily metrics and operational performance');
    }
  }

  return {
    rawScore,
    finalScore,
    confidence: {
      coverage_ratio: computed.data_coverage_ratio,
      level: computed.confidence_level,
    },
    alerts: top3Alerts,
    recommendations: [...new Set(recommendations)].slice(0, 5), // Max 5 unique recommendations
  };
}

/**
 * Compute F&B metrics from unified daily_metrics
 * Uses canonical fields: revenue, cost, customers, avg_ticket
 */
function computeFnbMetricsFromUnified(dailyMetrics: DailyMetric[]): {
  avg_ticket: number;
  avg_customers_7d: number;
  avg_customers_14d: number;
  avg_sales_7d: number;
  avg_sales_14d: number;
  avg_cost_7d: number;
  avg_cost_14d: number;
  margin_7d: number;
  margin_14d: number;
  avg_daily_cost: number;
  cash_runway_days: number;
  weekend_concentration_pct: number;
  data_coverage_ratio: number;
  confidence_level: 'High' | 'Medium' | 'Low' | 'Very Low';
} {
  if (dailyMetrics.length === 0) {
    return {
      avg_ticket: 0,
      avg_customers_7d: 0,
      avg_customers_14d: 0,
      avg_sales_7d: 0,
      avg_sales_14d: 0,
      avg_cost_7d: 0,
      avg_cost_14d: 0,
      margin_7d: 0,
      margin_14d: 0,
      avg_daily_cost: 0,
      cash_runway_days: 0,
      weekend_concentration_pct: 0,
      data_coverage_ratio: 0,
      confidence_level: 'Very Low',
    };
  }

  // Sort by date (newest first) - use canonical 'date' field
  const sorted = [...dailyMetrics].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const latest = sorted[0];
  const last7Days = sorted.slice(0, 7);
  const last14Days = sorted.slice(0, 14);

  // Compute avg_ticket from latest day (use canonical 'avgTicket' or calculate)
  const avg_ticket = latest.avgTicket || 
    (latest.customers && latest.customers > 0 && latest.revenue 
      ? latest.revenue / latest.customers 
      : 0);

  // Compute 7-day averages (use canonical fields)
  const avg_customers_7d = last7Days.length > 0
    ? last7Days.reduce((sum, m) => sum + (m.customers || 0), 0) / last7Days.length
    : 0;
  const avg_sales_7d = last7Days.length > 0
    ? last7Days.reduce((sum, m) => sum + (m.revenue || 0), 0) / last7Days.length
    : 0;
  const avg_cost_7d = last7Days.length > 0
    ? last7Days.reduce((sum, m) => sum + (m.cost || 0), 0) / last7Days.length
    : 0;
  const margin_7d = avg_sales_7d > 0
    ? ((avg_sales_7d - avg_cost_7d) / avg_sales_7d) * 100
    : 0;

  // Compute 14-day averages
  const avg_customers_14d = last14Days.length > 0
    ? last14Days.reduce((sum, m) => sum + (m.customers || 0), 0) / last14Days.length
    : 0;
  const avg_sales_14d = last14Days.length > 0
    ? last14Days.reduce((sum, m) => sum + (m.revenue || 0), 0) / last14Days.length
    : 0;
  const avg_cost_14d = last14Days.length > 0
    ? last14Days.reduce((sum, m) => sum + (m.cost || 0), 0) / last14Days.length
    : 0;
  const margin_14d = avg_sales_14d > 0
    ? ((avg_sales_14d - avg_cost_14d) / avg_sales_14d) * 100
    : 0;

  // Average daily cost (for cash runway) - use canonical 'cost' field
  const avg_daily_cost = avg_cost_7d > 0 ? avg_cost_7d : avg_cost_14d;
  const cash_runway_days = avg_daily_cost > 0
    ? (latest.cashBalance ?? 0) / avg_daily_cost
    : 0;

  // Weekend concentration (last 7 days) - derive from metric_date weekday
  const last7DaysWithDayOfWeek = last7Days.map(m => ({
    ...m,
    dayOfWeek: new Date(m.date).getDay(), // 0=Sunday, 6=Saturday
  }));
  const weekendRevenue = last7DaysWithDayOfWeek
    .filter(m => m.dayOfWeek === 0 || m.dayOfWeek === 6)
    .reduce((sum, m) => sum + (m.revenue || 0), 0);
  const weeklyRevenue = last7Days.reduce((sum, m) => sum + (m.revenue || 0), 0);
  const weekend_concentration_pct = weeklyRevenue > 0
    ? (weekendRevenue / weeklyRevenue) * 100
    : 0;

  // Data coverage ratio
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const metricsInLast30Days = sorted.filter(m => {
    const metricDate = new Date(m.date);
    return metricDate >= thirtyDaysAgo && metricDate <= today;
  });
  
  const data_coverage_ratio = metricsInLast30Days.length / 30;
  
  // Confidence level
  let confidence_level: 'High' | 'Medium' | 'Low' | 'Very Low' = 'Very Low';
  if (data_coverage_ratio >= 0.90) {
    confidence_level = 'High';
  } else if (data_coverage_ratio >= 0.70) {
    confidence_level = 'Medium';
  } else if (data_coverage_ratio >= 0.50) {
    confidence_level = 'Low';
  }

  return {
    avg_ticket,
    avg_customers_7d,
    avg_customers_14d,
    avg_sales_7d,
    avg_sales_14d,
    avg_cost_7d,
    avg_cost_14d,
    margin_7d,
    margin_14d,
    avg_daily_cost,
    cash_runway_days,
    weekend_concentration_pct,
    data_coverage_ratio,
    confidence_level,
  };
}
