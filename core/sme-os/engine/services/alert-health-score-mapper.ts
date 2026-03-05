/**
 * Alert → Health Score Mapping Service
 * 
 * Maps alerts to health score penalties based on alert type and severity.
 * Provides deterministic, explainable health score calculation.
 */

import type { AlertContract } from '../../contracts/alerts';

// Import safe number utilities (using dynamic require to avoid circular deps)
let safeNumber: (value: unknown, fallback?: number) => number;
let safeDivide: (numerator: unknown, denominator: unknown, fallback?: number) => number;
let safeClamp: (value: unknown, min?: number, max?: number) => number;

try {
  const safeNumberUtils = require('../../../../apps/web/app/utils/safe-number');
  safeNumber = safeNumberUtils.safeNumber;
  safeDivide = safeNumberUtils.safeDivide;
  safeClamp = safeNumberUtils.safeClamp;
} catch (e) {
  // Fallback implementations if utils not available
  safeNumber = (value: unknown, fallback: number = 0): number => {
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value;
    const parsed = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
    return (!isNaN(parsed) && isFinite(parsed)) ? parsed : fallback;
  };
  safeDivide = (num: unknown, den: unknown, fallback: number = 0): number => {
    const n = safeNumber(num, 0);
    const d = safeNumber(den, 0);
    return d === 0 ? fallback : (isNaN(n / d) ? fallback : n / d);
  };
  safeClamp = (value: unknown, min: number = 0, max: number = 100): number => {
    const num = safeNumber(value, min);
    return Math.max(min, Math.min(max, num));
  };
}

/**
 * Alert penalty mapping table
 * Maps alert ID prefix to penalty by severity level
 * Penalties are applied as score deductions (higher = more impact)
 */
const ALERT_PENALTY_MAP: Record<string, Record<string, number>> = {
  // Critical cash/runway alerts (highest impact)
  'cash-runway': { critical: 25 },
  'liquidity-runway-risk': { critical: 25 },
  
  // High-impact operational risks
  'break-even-risk': { critical: 20 },
  'margin-compression': { critical: 20, warning: 15 },
  'cost-pressure': { critical: 20, warning: 15 },
  'demand-drop': { critical: 20, warning: 15 },
  
  // Revenue concentration and volatility
  'revenue-concentration': { critical: 20, warning: 12 },
  'cash-flow-volatility': { critical: 20, warning: 12 },
  
  // Medium-impact utilization and gap alerts
  'low-weekday-utilization': { critical: 15, warning: 10 },
  'capacity-utilization': { critical: 15, warning: 10 },
  'weekend-weekday-imbalance': { critical: 12, warning: 8 },
  'weekend-weekday-fnb-gap': { critical: 12, warning: 8 },
  'menu-revenue-concentration': { critical: 12, warning: 8 },
  
  // Lower-impact seasonal and mismatch alerts
  'seasonal-mismatch': { critical: 10, warning: 6 },
  'seasonality-risk': { critical: 10, warning: 6 },
  
  // Data confidence (informational only)
  'data-confidence-risk': { warning: 5, informational: 3 },
};

/**
 * Get alert type identifier from alert ID
 * Extracts the prefix before the timestamp
 */
export function getAlertType(alert: AlertContract): string {
  // Alert IDs are formatted as: "alert-type-${timestamp}"
  // Extract the type prefix
  const idParts = alert.id.split('-');
  if (idParts.length < 2) {
    return alert.id; // Fallback to full ID if no pattern match
  }
  
  // Remove timestamp (last part) and join remaining parts
  // Examples:
  // "cash-runway-1234567890" -> "cash-runway"
  // "liquidity-runway-risk-1234567890" -> "liquidity-runway-risk"
  const timestampPattern = /^\d+$/;
  const partsWithoutTimestamp = idParts.filter(part => !timestampPattern.test(part));
  
  return partsWithoutTimestamp.join('-') || alert.id;
}

/**
 * Get penalty for a specific alert based on its type and severity
 */
function getAlertPenalty(alert: AlertContract): number {
  const alertType = getAlertType(alert);
  const penaltyMap = ALERT_PENALTY_MAP[alertType];
  
  if (!penaltyMap) {
    // Fallback to severity-based penalties if alert type not in map
    switch (alert.severity) {
      case 'critical': return 20;
      case 'warning': return 10;
      case 'informational': return 5;
      default: return 5;
    }
  }
  
  // Get penalty for this severity level
  const penalty = penaltyMap[alert.severity] || penaltyMap['warning'] || penaltyMap['informational'] || 5;
  return penalty;
}

/**
 * Calculate health score from alerts with alert-specific penalties
 * 
 * @param alerts - Array of active alerts
 * @returns Object with score, totalPenalty, and breakdown
 */
export interface HealthScoreCalculationResult {
  score: number; // Final score (20-100)
  totalPenalty: number; // Total penalty applied (0-80)
  penaltyBreakdown: Array<{
    alertId: string;
    alertType: string;
    severity: string;
    penalty: number;
    confidence: number;
    adjustedPenalty: number;
  }>;
  activeAlertCount: number;
  alertSummary?: { critical: number; warning: number; informational: number };
}

export function calculateHealthScoreFromAlerts(
  alerts: AlertContract[]
): HealthScoreCalculationResult {
  // Defensive: Handle null/undefined alerts
  if (!alerts || !Array.isArray(alerts) || alerts.length === 0) {
    return {
      score: 100,
      totalPenalty: 0,
      penaltyBreakdown: [],
      activeAlertCount: 0,
    };
  }
  
  // Base score = 100
  let baseScore = 100;
  
  // Track penalties by alert category for duplicate handling
  const categoryPenalties = new Map<string, number>();
  const penaltyBreakdown: HealthScoreCalculationResult['penaltyBreakdown'] = [];
  
  // Get money impact from alerts (revenueImpact field)
  // Calculate total money impact for normalization
  const alertsWithImpact = alerts.map(alert => {
    if (!alert) return { alert: null as any, moneyImpact: 0 };
    const extended = alert as any; // ExtendedAlertContract
    const moneyImpact = safeNumber(extended?.revenueImpact, 0);
    return { alert, moneyImpact };
  }).filter(item => item.alert !== null);
  
  const totalMoneyImpact = alertsWithImpact.reduce((sum, item) => sum + safeNumber(item.moneyImpact, 0), 0);
  const maxMoneyImpact = alertsWithImpact.length > 0 
    ? Math.max(...alertsWithImpact.map(item => safeNumber(item.moneyImpact, 0)), 0)
    : 0;
  
  // If no alerts have revenue impact, still process all alerts with severity-based penalties
  const hasAnyRevenueImpact = totalMoneyImpact > 0;
  
  // Process each alert (including those without revenue impact)
  // If no alerts have revenue impact, still apply severity-based penalties
  const alertsToProcess = hasAnyRevenueImpact
    ? alertsWithImpact 
    : alerts.map(alert => ({ alert, moneyImpact: 0 })).filter(item => item.alert !== null);
  
  alertsToProcess.forEach(({ alert, moneyImpact }) => {
    if (!alert) return; // Skip invalid alerts
    
    const alertType = getAlertType(alert);
    const basePenalty = safeNumber(getAlertPenalty(alert), 5);
    
    // Apply confidence adjustment - ensure confidence is valid (0-1)
    const confidence = safeClamp(alert.confidence ?? 0.5, 0, 1);
    const confidenceMultiplier = confidence < 0.5 ? 0.5 : 1.0;
    
    // Weight penalty by money impact
    // Health score must compute from active alerts weighted by money impact
    // If alert has money impact, weight the penalty proportionally
    // Scale: 0.5x (low impact) to 2.0x (high impact) multiplier
    let moneyImpactWeight = 1.0;
    const safeMoneyImpact = safeNumber(moneyImpact, 0);
    const safeMaxMoneyImpact = safeNumber(maxMoneyImpact, 0);
    const safeTotalMoneyImpact = safeNumber(totalMoneyImpact, 0);
    
    if (hasAnyRevenueImpact) {
      if (safeMaxMoneyImpact > 0 && safeMoneyImpact > 0) {
        // Normalize by max impact to get 0-1 ratio
        const impactRatio = safeDivide(safeMoneyImpact, safeMaxMoneyImpact, 0);
        // Scale to 0.5-2.0x range: low impact = 0.5x, high impact = 2.0x
        moneyImpactWeight = safeClamp(0.5 + (impactRatio * 1.5), 0.5, 2.0);
      } else if (safeMoneyImpact === 0 && safeTotalMoneyImpact > 0) {
        // If this alert has no money impact but others do, reduce its weight
        moneyImpactWeight = 0.5;
      }
    } else {
      // No alerts have revenue impact - use severity-based weighting
      // Critical = 1.5x, Warning = 1.0x, Informational = 0.5x
      if (alert.severity === 'critical') {
        moneyImpactWeight = 1.5;
      } else if (alert.severity === 'warning') {
        moneyImpactWeight = 1.0;
      } else {
        moneyImpactWeight = 0.5;
      }
    }
    
    const adjustedPenalty = safeNumber(basePenalty * confidenceMultiplier * moneyImpactWeight, 0);
    
    // Handle duplicate alerts in same category
    // First alert = 100% impact, subsequent = 50% impact
    const existingPenalty = safeNumber(categoryPenalties.get(alertType), 0);
    const finalPenalty = existingPenalty === 0 
      ? adjustedPenalty  // First alert in category
      : safeNumber(adjustedPenalty * 0.5, 0);  // Subsequent alert in same category
    
    categoryPenalties.set(alertType, safeNumber((categoryPenalties.get(alertType) || 0) + finalPenalty, 0));
    
    penaltyBreakdown.push({
      alertId: alert.id || 'unknown',
      alertType,
      severity: alert.severity || 'informational',
      penalty: basePenalty,
      confidence,
      adjustedPenalty: finalPenalty,
    });
  });
  
  // Calculate total penalty (capped at 80)
  const penaltyValues = Array.from(categoryPenalties.values()).map(p => safeNumber(p, 0));
  const totalPenalty = safeClamp(
    penaltyValues.reduce((sum, p) => sum + p, 0),
    0,
    80
  );
  
  // Final score = max(20, 100 - totalPenalty)
  const finalScore = safeClamp(baseScore - totalPenalty, 20, 100);
  
  return {
    score: Math.round(finalScore * 10) / 10, // Round to 1 decimal
    totalPenalty: Math.round(totalPenalty * 10) / 10,
    penaltyBreakdown,
    activeAlertCount: alerts.length,
    alertSummary: {
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      informational: alerts.filter(a => a.severity === 'informational').length,
    },
  };
}

/**
 * Get top risks by impact score
 * Impact score = penalty × confidence × severityMultiplier
 * 
 * @param alerts - Array of active alerts
 * @param maxRisks - Maximum number of risks to return (default: 3)
 * @returns Array of top risks sorted by impact score
 */
export interface TopRisk {
  alertId: string;
  title: string;
  impactScore: number;
  penalty: number;
  confidence: number;
  severity: string;
  explanation: string;
  estimatedImpact?: string;
}

const SEVERITY_MULTIPLIERS: Record<string, number> = {
  critical: 1.5,
  warning: 1.0,
  informational: 0.5,
};

export function getTopRisks(
  alerts: AlertContract[],
  maxRisks: number = 3
): TopRisk[] {
  const risks: TopRisk[] = [];
  
  // Track categories to handle duplicates
  const categorySeen = new Map<string, boolean>();
  
  alerts.forEach(alert => {
    const alertType = getAlertType(alert);
    const basePenalty = getAlertPenalty(alert);
    
    // Apply duplicate penalty reduction
    const isDuplicate = categorySeen.get(alertType) || false;
    const penalty = isDuplicate ? basePenalty * 0.5 : basePenalty;
    
    if (!isDuplicate) {
      categorySeen.set(alertType, true);
    }
    
    // Calculate impact score
    const severityMultiplier = SEVERITY_MULTIPLIERS[alert.severity] || 1.0;
    const impactScore = penalty * alert.confidence * severityMultiplier;
    
    // Generate money-oriented explanation
    const explanation = generateMoneyExplanation(alert, alertType);
    
    risks.push({
      alertId: alert.id,
      title: alert.message || `${alertType} alert`,
      impactScore: Math.round(impactScore * 10) / 10,
      penalty,
      confidence: alert.confidence,
      severity: alert.severity,
      explanation,
      estimatedImpact: generateEstimatedImpact(alert, alertType),
    });
  });
  
  // Sort by impact score (descending) and return top N
  return risks
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, maxRisks);
}

/**
 * Generate money-oriented explanation for an alert
 */
function generateMoneyExplanation(alert: AlertContract, alertType: string): string {
  // Extract key information from alert message and conditions
  const message = alert.message.toLowerCase();
  const conditions = alert.conditions.join(' ').toLowerCase();
  const combined = `${message} ${conditions}`;
  
  // Map alert types to money-oriented explanations
  if (alertType.includes('cash-runway') || alertType.includes('liquidity-runway')) {
    return 'Low cash reserves threaten business continuity. Immediate action needed to secure funding or reduce expenses.';
  }
  
  if (alertType.includes('break-even')) {
    return 'Revenue not covering expenses. Business is losing money daily. Need to increase revenue or reduce costs.';
  }
  
  if (alertType.includes('margin-compression')) {
    return 'Profit margins shrinking. Each sale generates less profit, reducing overall business value.';
  }
  
  if (alertType.includes('cost-pressure')) {
    return 'Rising costs eating into profits. Without price increases or cost cuts, profitability will decline.';
  }
  
  if (alertType.includes('demand-drop')) {
    return 'Customer demand declining. Fewer customers means less revenue and potential market share loss.';
  }
  
  if (alertType.includes('revenue-concentration')) {
    return 'Too much revenue depends on few sources. If one source fails, business faces significant revenue loss.';
  }
  
  if (alertType.includes('cash-flow-volatility')) {
    return 'Unpredictable cash flow makes planning difficult. Hard to invest or cover unexpected expenses.';
  }
  
  if (alertType.includes('low-weekday-utilization') || alertType.includes('capacity-utilization')) {
    return 'Underutilized capacity means wasted resources. Fixed costs spread over fewer sales reduces profitability.';
  }
  
  if (alertType.includes('weekend-weekday') || alertType.includes('fnb-gap')) {
    return 'Revenue gap between peak and off-peak periods. Opportunity to increase revenue by improving off-peak performance.';
  }
  
  if (alertType.includes('menu-revenue-concentration')) {
    return 'Too much revenue from few menu items. If popular items become unavailable, revenue could drop significantly.';
  }
  
  if (alertType.includes('seasonal') || alertType.includes('mismatch')) {
    return 'Seasonal patterns not aligned with expectations. May indicate missed opportunities or unexpected market changes.';
  }
  
  // Generic fallback
  return `This risk could impact business performance and profitability. Review details and take appropriate action.`;
}

/**
 * Generate estimated impact string if available
 */
function generateEstimatedImpact(alert: AlertContract, alertType: string): string | undefined {
  // Extract numeric values from conditions for impact estimation
  const conditions = alert.conditions.join(' ');
  
  // Try to extract percentage or dollar amounts
  const percentageMatch = conditions.match(/(\d+(?:\.\d+)?)%/);
  const dollarMatch = conditions.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  
  if (alertType.includes('runway') || alertType.includes('liquidity')) {
    const monthsMatch = conditions.match(/(\d+(?:\.\d+)?)\s*month/i);
    if (monthsMatch) {
      return `Estimated runway: ${monthsMatch[1]} months`;
    }
  }
  
  if (percentageMatch) {
    return `Impact: ${percentageMatch[1]}%`;
  }
  
  if (dollarMatch) {
    return `Estimated impact: $${dollarMatch[1]}`;
  }
  
  return undefined;
}
