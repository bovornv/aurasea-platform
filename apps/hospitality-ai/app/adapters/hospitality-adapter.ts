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
export function translateAlertFromSMEOS(alert: AlertContract, locale: 'en' | 'th' = 'en'): HospitalityAlert {
  // Map generic domain to hospitality category
  const categoryMap: Record<string, 'revenue' | 'occupancy' | 'staffing' | 'cash' | 'forecast'> = {
    cash: 'cash',
    labor: 'staffing',
    forecast: 'forecast',
    risk: 'forecast', // Generic risk maps to forecast
  };

  // Translation maps
  const translations = {
    en: {
      cashFlowAlert: 'Cash Flow Alert',
      staffingAlert: 'Staffing Alert',
      forecastAlert: 'Forecast Alert',
      cashFlowConcern: 'Cash flow concern:',
      staffingConsideration: 'Staffing consideration:',
      forecastInsight: 'Forecast insight:',
      // Alert message translations
      cashRunwayRisk: 'Projected cash balance will fall below critical threshold within 7 days based on current cash flow patterns',
      laborOptimization: 'Resource utilization patterns suggest optimization opportunity',
      forecastAnomaly: 'Unusual pattern detected in historical data',
      cashThresholdWarning: 'Cash balance approaching lower threshold',
    },
    th: {
      cashFlowAlert: 'การแจ้งเตือนกระแสเงินสด',
      staffingAlert: 'การแจ้งเตือนทรัพยากรบุคคล',
      forecastAlert: 'การแจ้งเตือนการคาดการณ์',
      cashFlowConcern: 'ความกังวลเรื่องกระแสเงินสด:',
      staffingConsideration: 'การพิจารณาทรัพยากรบุคคล:',
      forecastInsight: 'ข้อมูลเชิงลึกการคาดการณ์:',
      // Alert message translations
      cashRunwayRisk: 'ยอดเงินสดที่คาดการณ์จะต่ำกว่าเกณฑ์วิกฤตภายใน 7 วันตามรูปแบบกระแสเงินสดปัจจุบัน',
      laborOptimization: 'รูปแบบการใช้ทรัพยากรบ่งชี้ถึงโอกาสในการปรับปรุง',
      forecastAnomaly: 'ตรวจพบรูปแบบผิดปกติในข้อมูลในอดีต',
      cashThresholdWarning: 'ยอดเงินสดใกล้ถึงเกณฑ์ต่ำ',
    },
  };

  const t = translations[locale];

  // Translate generic message to hospitality context
  let title = alert.message;
  let message = alert.message;
  let context = alert.message;

  // Translate alert messages based on content
  if (alert.message.includes('Projected cash balance will fall below critical threshold')) {
    message = t.cashRunwayRisk;
  } else if (alert.message.includes('Resource utilization patterns suggest')) {
    message = t.laborOptimization;
  } else if (alert.message.includes('Unusual pattern detected')) {
    message = t.forecastAnomaly;
  } else if (alert.message.includes('Cash balance approaching lower threshold')) {
    message = t.cashThresholdWarning;
  }

  if (alert.domain === 'cash') {
    title = t.cashFlowAlert;
    context = `${t.cashFlowConcern} ${message}`;
  } else if (alert.domain === 'labor') {
    title = t.staffingAlert;
    context = `${t.staffingConsideration} ${message}`;
  } else if (alert.domain === 'forecast') {
    title = t.forecastAlert;
    context = `${t.forecastInsight} ${message}`;
  }

  return {
    id: alert.id,
    timestamp: alert.timestamp,
    type: alert.type,
    severity: alert.severity,
    category: categoryMap[alert.domain] || 'forecast',
    timeHorizon: alert.timeHorizon,
    title,
    message,
    confidence: alert.confidence,
    context,
  };
}

/**
 * Translate SME OS output to hospitality representation
 */
export function translateOutputFromSMEOS(output: OutputContract, locale: 'en' | 'th' = 'en'): {
  alerts: HospitalityAlert[];
  explanation: string;
  confidence: number;
} {
  return {
    alerts: output.alerts.map(alert => translateAlertFromSMEOS(alert, locale)),
    explanation: output.explanation.reasoning,
    confidence: output.evaluation.confidence,
  };
}
