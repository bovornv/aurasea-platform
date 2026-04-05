// Hospitality adapters - translate hospitality concepts to/from SME OS contracts
// This is the adapter layer for the platform app

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
  domain?: 'cash' | 'risk' | 'labor' | 'forecast'; // Preserved from AlertContract
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term';
  title: string;
  message: string;
  confidence: number;
  context: string;
}

/**
 * Translate hospitality input to SME OS input contract
 * PART 1.4: Accept optional alertSensitivity to pass to alert rules
 */
export function translateToSMEOS(
  input: HospitalityInput,
  alertSensitivity?: 'low' | 'medium' | 'high',
  businessType?: 'accommodation' | 'cafe_restaurant'
): InputContract {
  // Aggregate revenue into cash flows (inflows)
  const revenueFlows = input.revenue.dates.map(date => ({
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

  // Combine all cash flows and sort by date
  const allCashFlows = [...revenueFlows, ...expenseFlows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Calculate projected balance (simple projection)
  const totalInflows = revenueFlows.reduce((sum, cf) => sum + cf.amount, 0);
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
      cashFlows: allCashFlows,
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
    // PART 1.4: Include alert sensitivity in businessContext for threshold adjustment
    businessContext: {
      region: 'thailand',
      businessSize: 'sme',
      ...(alertSensitivity && { alertSensitivity }),
    },
    ...(businessType && { businessType }),
  };
}

/** Product-level category labels (respectful, forward-looking, no blame). */
const ALERT_CATEGORY_LABELS = {
  en: {
    positive_optimization: 'Positive Optimization',
    preventive_early_signal: 'Preventive Early Signal',
    risk_pattern_emerging: 'Risk Pattern Emerging',
  },
  th: {
    positive_optimization: 'ข้อเสนอปรับปรุง',
    preventive_early_signal: 'สัญญาณเตือนล่วงหน้า',
    risk_pattern_emerging: 'รูปแบบความเสี่ยงที่กำลังเกิด',
  },
} as const;

/**
 * Translate SME OS alert to hospitality alert
 */
export function translateAlertFromSMEOS(alert: AlertContract | any, locale: 'en' | 'th' = 'en'): HospitalityAlert {
  // Handle extended alert contract with confidence decay
  const extendedAlert = alert as any;
  const confidence = extendedAlert.confidenceAdjusted !== undefined 
    ? extendedAlert.confidenceAdjusted 
    : alert.confidence;
  
  // Preserve confidence decay metadata
  const confidenceRaw = extendedAlert.confidenceRaw;
  const confidenceDecayReason = extendedAlert.confidenceDecayReason;
  // Use Thai copy when available and locale is th
  const messageForLocale = (locale === 'th' && extendedAlert.messageTh) ? extendedAlert.messageTh : alert.message;
  const titleForImpact = (locale === 'th' && extendedAlert.revenueImpactTitleTh) ? extendedAlert.revenueImpactTitleTh : extendedAlert.revenueImpactTitle;
  // Determine category based on alert ID and message
  const alertId = alert.id.toLowerCase();
  const alertMessage = alert.message.toLowerCase();
  
  let category: 'revenue' | 'occupancy' | 'staffing' | 'cash' | 'forecast' = 'forecast';
  
  if (alert.domain === 'cash' || alertId.includes('cash')) {
    category = 'cash';
  } else if (alertId.includes('weekend-weekday-imbalance') || alert.type === 'opportunity') {
    category = 'revenue'; // Revenue opportunity alerts
  } else if (alertId.includes('demand') || alertId.includes('occupancy') || alertId.includes('seasonal') ||
             alertMessage.includes('demand') || alertMessage.includes('occupancy') || alertMessage.includes('revenue')) {
    category = 'revenue';
  } else if (alertId.includes('cost') || alertId.includes('margin') || alertId.includes('pressure') ||
             alertMessage.includes('cost') || alertMessage.includes('margin') || alertMessage.includes('pressure')) {
    category = 'forecast'; // Cost alerts map to forecast category
  } else if (alert.domain === 'labor' || alertId.includes('staff')) {
    category = 'staffing';
  }

  // Translation maps
  const translations = {
    en: {
      // Alert titles
      cashFlowAlert: 'Cash Flow Alert',
      demandDropAlert: 'Demand Drop Alert',
      costPressureAlert: 'Cost Pressure Alert',
      marginCompressionAlert: 'Margin Compression Alert',
      seasonalMismatchAlert: 'Seasonal Mismatch Alert',
      dataConfidenceAlert: 'Data Confidence Alert',
      weekendWeekdayImbalanceAlert: 'Weekend-Weekday Imbalance Alert',
      staffingAlert: 'Staffing Alert',
      forecastAlert: 'Forecast Alert',
      // Context prefixes
      cashFlowConcern: 'Cash flow concern:',
      demandConcern: 'Demand concern:',
      costConcern: 'Cost concern:',
      marginConcern: 'Margin concern:',
      seasonalInsight: 'Seasonal pattern:',
      dataQualityNote: 'Data quality note:',
      revenueOpportunity: 'Revenue opportunity:',
      staffingConsideration: 'Staffing consideration:',
      forecastInsight: 'Forecast insight:',
      // Alert message translations
      cashRunwayRisk: 'Projected cash balance will fall below critical threshold within 7 days based on current cash flow patterns',
      demandDrop: 'Demand indicators show decline compared to recent baseline',
      costPressure: 'Operating costs rising faster than revenue',
      marginCompression: 'Profit margin compressed despite stable revenue',
      seasonalMismatch: 'Revenue differs from same period last year during peak/low season',
      dataConfidence: 'Data confidence reduced due to stale data',
    },
    th: {
      // Alert titles
      cashFlowAlert: 'การแจ้งเตือนกระแสเงินสด',
      demandDropAlert: 'การแจ้งเตือนความต้องการลดลง',
      costPressureAlert: 'การแจ้งเตือนความกดดันด้านต้นทุน',
      marginCompressionAlert: 'การแจ้งเตือนการบีบอัดกำไร',
      seasonalMismatchAlert: 'การแจ้งเตือนความไม่สอดคล้องตามฤดูกาล',
      dataConfidenceAlert: 'การแจ้งเตือนความเชื่อมั่นของข้อมูล',
      weekendWeekdayImbalanceAlert: 'การแจ้งเตือนโอกาสรายได้: วันหยุด vs วันธรรมดา',
      staffingAlert: 'การแจ้งเตือนทรัพยากรบุคคล',
      forecastAlert: 'การแจ้งเตือนการคาดการณ์',
      // Context prefixes
      cashFlowConcern: 'ความกังวลเรื่องกระแสเงินสด:',
      demandConcern: 'ความกังวลเรื่องความต้องการ:',
      costConcern: 'ความกังวลเรื่องต้นทุน:',
      marginConcern: 'ความกังวลเรื่องกำไร:',
      seasonalInsight: 'รูปแบบตามฤดูกาล:',
      dataQualityNote: 'หมายเหตุคุณภาพข้อมูล:',
      revenueOpportunity: 'โอกาสรายได้:',
      staffingConsideration: 'การพิจารณาทรัพยากรบุคคล:',
      forecastInsight: 'ข้อมูลเชิงลึกการคาดการณ์:',
      // Alert message translations
      cashRunwayRisk: 'ยอดเงินสดที่คาดการณ์จะต่ำกว่าเกณฑ์วิกฤตภายใน 7 วันตามรูปแบบกระแสเงินสดปัจจุบัน',
      demandDrop: 'ตัวชี้วัดความต้องการแสดงการลดลงเมื่อเทียบกับฐานล่าสุด',
      costPressure: 'ต้นทุนการดำเนินงานเพิ่มขึ้นเร็วกว่ารายได้',
      marginCompression: 'กำไรถูกบีบอัดแม้ว่ารายได้จะคงที่',
      seasonalMismatch: 'รายได้แตกต่างจากช่วงเดียวกันของปีที่แล้วในช่วงฤดูสูง/ต่ำ',
      dataConfidence: 'ความเชื่อมั่นของข้อมูลลดลงเนื่องจากข้อมูลเก่า',
    },
  };

  const t = translations[locale];
  const categoryLabels = ALERT_CATEGORY_LABELS[locale];

  // Translate generic message to hospitality context (use localized message when available)
  let title = messageForLocale;
  let message = messageForLocale;
  let context = messageForLocale;

  // Determine title and translate message based on alert type
  if (alertId.includes('cash-runway') || alertId.includes('cash')) {
    title = t.cashFlowAlert;
    if (alert.message.includes('Projected cash balance') || alert.message.includes('Cash coverage')) {
      message = locale === 'th' ? alert.message : alert.message; // Keep original for now, can enhance later
    }
    context = `${t.cashFlowConcern} ${message}`;
  } else if (alertId.includes('weekend-weekday-imbalance')) {
    title = t.weekendWeekdayImbalanceAlert;
    message = locale === 'th' ? alert.message : alert.message;
    context = `${t.revenueOpportunity} ${message}`;
  } else if (alertId.includes('demand-drop')) {
    title = t.demandDropAlert;
    message = locale === 'th' ? alert.message : alert.message;
    context = `${t.demandConcern} ${message}`;
  } else if (alertId.includes('cost-pressure')) {
    title = t.costPressureAlert;
    message = locale === 'th' ? alert.message : alert.message;
    context = `${t.costConcern} ${message}`;
  } else if (alertId.includes('margin-compression')) {
    title = t.marginCompressionAlert;
    message = locale === 'th' ? alert.message : alert.message;
    context = `${t.marginConcern} ${message}`;
  } else if (alertId.includes('seasonal-mismatch')) {
    title = t.seasonalMismatchAlert;
    message = locale === 'th' ? alert.message : alert.message;
    context = `${t.seasonalInsight} ${message}`;
  } else if (alertId.includes('data-confidence')) {
    title = t.dataConfidenceAlert;
    message = messageForLocale;
    context = `${t.dataQualityNote} ${message}`;
  } else if (alertId.startsWith('phase-micro') || alertId.startsWith('phase-trend') || alertId.startsWith('phase-variability') || alertId.startsWith('optimization-healthy')) {
    title = titleForImpact || messageForLocale;
    message = messageForLocale;
    context = messageForLocale;
  } else if (alert.domain === 'labor' || alertId.includes('staff')) {
    title = t.staffingAlert;
    context = `${t.staffingConsideration} ${message}`;
  } else {
    title = t.forecastAlert;
    context = `${t.forecastInsight} ${message}`;
  }

  const cat = extendedAlert.alertCategory as keyof typeof categoryLabels | undefined;
  const productCategoryLabel = cat && cat in categoryLabels ? categoryLabels[cat] : undefined;
  const hospitalityAlert: HospitalityAlert & { 
    confidenceRaw?: number; 
    confidenceDecayReason?: string;
    type?: string;
    productCategoryLabel?: string; // Positive Optimization | Preventive Early Signal | Risk Pattern Emerging
  } = {
    id: alert.id,
    timestamp: alert.timestamp,
    type: alert.type,
    severity: alert.severity,
    category,
    domain: alert.domain,
    timeHorizon: alert.timeHorizon,
    title: titleForImpact ?? title,
    message,
    confidence,
    context,
  };
  if (productCategoryLabel) {
    (hospitalityAlert as any).productCategoryLabel = productCategoryLabel;
  }
  
  // Preserve confidence decay metadata if present
  if (confidenceRaw !== undefined) {
    (hospitalityAlert as any).confidenceRaw = confidenceRaw;
  }
  if (confidenceDecayReason) {
    (hospitalityAlert as any).confidenceDecayReason = confidenceDecayReason;
  }
  
  // Preserve alert type for UI distinction (opportunity vs risk)
  (hospitalityAlert as any).type = alert.type;
  
  return hospitalityAlert;
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
