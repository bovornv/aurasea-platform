// Hospitality adapters - translate hospitality concepts to/from SME OS contracts
// This is the adapter layer for Hospitality AI app

import type { InputContract } from '../../../../core/sme-os/contracts/inputs';
import type { OutputContract } from '../../../../core/sme-os/contracts/outputs';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

/**
 * Hospitality-specific input data structure
 * This represents what the hospitality UI collects
 */
export interface HospitalityInput {
  // Revenue data
  revenue: {
    roomRevenue?: number;
    foodRevenue?: number;
    beverageRevenue?: number;
    otherRevenue?: number;
    dates: Date[];
  };
  
  // Operational data
  operations: {
    occupancyRate?: number;
    averageDailyRate?: number;
    staffShifts?: Array<{
      date: Date;
      staffCount: number;
      department: string;
    }>;
  };
  
  // Financial data
  financial: {
    currentBalance: number;
    expenses: Array<{
      date: Date;
      amount: number;
      category: string;
    }>;
  };
  
  // Time period
  timePeriod: {
    start: Date;
    end: Date;
  };
}

/**
 * Hospitality-specific alert representation
 */
export interface HospitalityAlert {
  id: string;
  timestamp: Date;
  type: 'risk' | 'opportunity' | 'anomaly' | 'threshold';
  severity: 'critical' | 'warning' | 'informational';
  category: 'revenue' | 'occupancy' | 'staffing' | 'cash' | 'forecast';
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term';
  title: string;
  message: string;
  confidence: number;
  context: string;
}

/**
 * Translate hospitality input to SME OS input contract
 */
export function translateToSMEOS(input: HospitalityInput): InputContract {
  // Aggregate revenue into cash flows
  const cashFlows = input.revenue.dates.map(date => ({
    amount: (input.revenue.roomRevenue || 0) + 
            (input.revenue.foodRevenue || 0) + 
            (input.revenue.beverageRevenue || 0) + 
            (input.revenue.otherRevenue || 0),
    direction: 'inflow' as const,
    date,
    category: 'revenue',
  }));

  // Add expense outflows
  const expenseFlows = input.financial.expenses.map(exp => ({
    amount: exp.amount,
    direction: 'outflow' as const,
    date: exp.date,
    category: exp.category,
  }));

  // Calculate projected balance (simple projection)
  const totalInflows = cashFlows.reduce((sum, cf) => sum + cf.amount, 0);
  const totalOutflows = expenseFlows.reduce((sum, cf) => sum + cf.amount, 0);
  const projectedBalance = input.financial.currentBalance + totalInflows - totalOutflows;

  // Translate staff shifts to generic resources
  const resources = input.operations.staffShifts?.map(shift => ({
    type: 'labor',
    capacity: shift.staffCount,
    utilization: shift.staffCount, // Mock utilization
    timePeriod: {
      start: shift.date,
      end: shift.date,
    },
  })) || [];

  return {
    timePeriod: {
      start: input.timePeriod.start,
      end: input.timePeriod.end,
      granularity: 'day',
    },
    financial: {
      cashFlows: [...cashFlows, ...expenseFlows],
      currentBalance: input.financial.currentBalance,
      projectedBalance,
    },
    operational: {
      resources,
      constraints: [],
    },
    historical: {
      patterns: [],
    },
    context: {
      businessMaturity: 'mature',
      marketConditions: 'neutral',
      previousDecisions: [],
    },
  };
}

/**
 * Translate SME OS alert to hospitality alert
 */
export function translateAlertFromSMEOS(alert: AlertContract): HospitalityAlert {
  // Map generic domain to hospitality category
  const categoryMap: Record<string, 'revenue' | 'occupancy' | 'staffing' | 'cash' | 'forecast'> = {
    cash: 'cash',
    labor: 'staffing',
    forecast: 'forecast',
    risk: 'forecast', // Generic risk maps to forecast
  };

  // Translate generic message to hospitality context
  let title = alert.message;
  let context = alert.message;

  if (alert.domain === 'cash') {
    title = 'Cash Flow Alert';
    context = `Cash flow concern: ${alert.message}`;
  } else if (alert.domain === 'labor') {
    title = 'Staffing Alert';
    context = `Staffing consideration: ${alert.message}`;
  } else if (alert.domain === 'forecast') {
    title = 'Forecast Alert';
    context = `Forecast insight: ${alert.message}`;
  }

  return {
    id: alert.id,
    timestamp: alert.timestamp,
    type: alert.type,
    severity: alert.severity,
    category: categoryMap[alert.domain] || 'forecast',
    timeHorizon: alert.timeHorizon,
    title,
    message: alert.message,
    confidence: alert.confidence,
    context,
  };
}

/**
 * Translate SME OS output to hospitality representation
 */
export function translateOutputFromSMEOS(output: OutputContract): {
  alerts: HospitalityAlert[];
  explanation: string;
  confidence: number;
} {
  return {
    alerts: output.alerts.map(translateAlertFromSMEOS),
    explanation: output.explanation.reasoning,
    confidence: output.evaluation.confidence,
  };
}
