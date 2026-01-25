// Mock data generator for more realistic test data
import type { AlertContract } from '../contracts/alerts';

export interface BusinessStateSummary {
  demandStatus: string;
  laborIntensityStatus: string;
  cashStressStatus: string;
  forecastReliability: string;
}

/**
 * Generate realistic mock alerts with varied scenarios
 */
export function generateMockAlerts(): AlertContract[] {
  const now = new Date();
  const alerts: AlertContract[] = [];

  // Alert 1: Critical cash runway risk
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  alerts.push({
    id: `alert-${Date.now()}-1`,
    timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
    type: 'risk',
    severity: 'critical',
    domain: 'cash',
    timeHorizon: 'immediate',
    relevanceWindow: {
      start: now,
      end: nextWeek,
    },
    message: 'Projected cash balance will fall below critical threshold within 7 days based on current cash flow patterns',
    confidence: 0.85,
    contributingFactors: [
      { factor: 'Negative cash flow trend', weight: 0.7 },
      { factor: 'Large scheduled outflows', weight: 0.5 },
      { factor: 'Reduced revenue inflows', weight: 0.4 },
    ],
    conditions: [
      'Current balance below historical average',
      'Weekly cash burn rate increasing',
      'No significant inflows scheduled',
    ],
  });

  // Alert 2: Labor optimization opportunity
  const twoWeeks = new Date(now);
  twoWeeks.setDate(twoWeeks.getDate() + 14);

  alerts.push({
    id: `alert-${Date.now()}-2`,
    timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5 hours ago
    type: 'opportunity',
    severity: 'informational',
    domain: 'labor',
    timeHorizon: 'medium-term',
    relevanceWindow: {
      start: now,
      end: twoWeeks,
    },
    message: 'Resource utilization patterns suggest optimization opportunity',
    confidence: 0.65,
    contributingFactors: [
      { factor: 'Underutilized capacity', weight: 0.7 },
      { factor: 'Peak demand patterns detected', weight: 0.3 },
    ],
    conditions: [
      'Consistent low utilization periods',
      'Predictable demand patterns',
    ],
  });

  // Alert 3: Forecast anomaly
  alerts.push({
    id: `alert-${Date.now()}-3`,
    timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
    type: 'anomaly',
    severity: 'informational',
    domain: 'forecast',
    timeHorizon: 'near-term',
    relevanceWindow: {
      start: now,
      end: tomorrow,
    },
    message: 'Unusual pattern detected in historical data',
    confidence: 0.55,
    contributingFactors: [
      { factor: 'Data variance', weight: 0.8 },
      { factor: 'External factors', weight: 0.2 },
    ],
    conditions: [
      'Statistical outlier detected',
      'Pattern deviation from baseline',
    ],
  });

  // Alert 4: Cash threshold warning
  const threeWeeks = new Date(now);
  threeWeeks.setDate(threeWeeks.getDate() + 21);

  alerts.push({
    id: `alert-${Date.now()}-4`,
    timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
    type: 'threshold',
    severity: 'warning',
    domain: 'cash',
    timeHorizon: 'near-term',
    relevanceWindow: {
      start: now,
      end: threeWeeks,
    },
    message: 'Cash balance approaching lower threshold',
    confidence: 0.75,
    contributingFactors: [
      { factor: 'Declining trend', weight: 0.6 },
      { factor: 'Increased operational costs', weight: 0.4 },
    ],
    conditions: [
      'Balance trending downward',
      'Threshold proximity warning',
    ],
  });

  return alerts;
}

/**
 * Generate mock business state summary
 */
export function generateBusinessStateSummary(): BusinessStateSummary {
  return {
    demandStatus: 'Demand is stable with slight seasonal variation. Current patterns align with historical averages.',
    laborIntensityStatus: 'Labor utilization is within normal range. Some optimization opportunities identified in off-peak periods.',
    cashStressStatus: 'Cash position requires monitoring in the near term. Current balance adequate but trend indicates attention needed.',
    forecastReliability: 'Forecast confidence is moderate based on recent patterns. Data quality is sufficient for reliable projections.',
  };
}
