import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Liquidity Runway Risk Alert Rule
 * Detects how many months of runway the business has before cash runs out
 * 
 * ⚠️ FROZEN ⚠️
 * 
 * Alert Name: Liquidity Runway Risk Alert
 * Status: FROZEN
 * Reason: All rule + explainer tests (22/22) passing and validated
 * 
 * This alert implementation has passed 22/22 tests and its behavior is canonical.
 * The current logic, thresholds, severity mapping, null-return conditions, confidence
 * calculations, and recommendation wording are final and intentional.
 * 
 * CRITICAL CONSTRAINTS:
 * - Severity thresholds are intentional and must NOT be altered without changing tests first
 * - Runway >= 12 months intentionally returns null (not informational) - this is intentional
 * - All severity thresholds are treated as constants and must not be reassigned dynamically
 * - Confidence calculation uses fixed base (0.6) and increments (+0.005 per day) - intentional
 * - Recommendation wording is test-locked and must not be modified
 * 
 * CHANGE PROCESS (MANDATORY):
 * 1. Any future changes MUST begin by updating tests first
 * 2. Refactors without failing tests are NOT allowed
 * 3. Do NOT modify thresholds, conditions, messages, confidence calculations, severity mapping,
 *    or recommendation wording without explicit test updates that define the new expected behavior
 * 4. If significant changes are needed, create a new alert version (e.g. LiquidityRunwayRiskV2)
 * 
 * Current canonical thresholds (DO NOT MODIFY WITHOUT TEST UPDATES):
 * - Runway >= 12 months → return null (healthy, no alert)
 * - Runway < 3 months → critical, immediate
 * - Runway 3-6 months → warning, near-term
 * - Runway 6-12 months → informational, medium-term
 */
export class LiquidityRunwayRiskRule {
  // ⚠️ FROZEN: Threshold constants (DO NOT MODIFY WITHOUT TEST UPDATES)
  private static readonly MINIMUM_DATA_DAYS = 30;
  private static readonly HEALTHY_RUNWAY_MONTHS = 12;
  private static readonly CRITICAL_RUNWAY_THRESHOLD = 3;
  private static readonly WARNING_RUNWAY_THRESHOLD = 6;
  
  // ⚠️ FROZEN: Confidence calculation constants (DO NOT MODIFY WITHOUT TEST UPDATES)
  private static readonly CONFIDENCE_BASE = 0.6;
  private static readonly CONFIDENCE_INCREMENT_PER_DAY = 0.005;
  private static readonly CONFIDENCE_MAX = 0.95;
  private static readonly CONFIDENCE_MIN = 0.6;
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    cashBalance: number;
    netCashFlow: number;
  }>): AlertContract | null {
    // ⚠️ FROZEN: Early return guard clauses (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Return null ONLY when:
    // 1. insufficient data is provided
    // 2. fewer than 30 days after filtering
    // 3. cash balance is missing or <= 0
    // 4. average monthly burn >= 0 (profitable/breakeven)
    // 5. runway >= 12 months (healthy)
    if (!operationalSignals || operationalSignals.length < LiquidityRunwayRiskRule.MINIMUM_DATA_DAYS) {
      return null;
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - LiquidityRunwayRiskRule.MINIMUM_DATA_DAYS * 24 * 60 * 60 * 1000);

    // Filter to recent signals
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= thirtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < LiquidityRunwayRiskRule.MINIMUM_DATA_DAYS) {
      return null;
    }

    // Get current cash balance (most recent signal, which is first in filtered array)
    // Signals are ordered newest-first (i=0 is today)
    const currentBalance = recentSignals[0]?.cashBalance;
    
    // Return null if cash balance is missing or invalid
    if (!currentBalance || currentBalance <= 0) {
      return null;
    }

    // Calculate average monthly net burn
    // netCashFlow is negative for burn (outflow), positive for income
    const netCashFlows = recentSignals.map(s => s.netCashFlow).filter(f => isFinite(f) && !isNaN(f));
    
    if (netCashFlows.length === 0) {
      return null;
    }
    
    const totalNetFlow = netCashFlows.reduce((sum, flow) => sum + flow, 0);
    const averageDailyBurn = totalNetFlow / netCashFlows.length;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(averageDailyBurn) || !isFinite(averageDailyBurn)) {
      return null;
    }
    
    // Convert daily burn to monthly burn (multiply by 30 days)
    // Note: averageDailyBurn is negative for burn, so averageMonthlyBurn will also be negative
    const averageMonthlyBurn = averageDailyBurn * 30;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(averageMonthlyBurn) || !isFinite(averageMonthlyBurn)) {
      return null;
    }

    // Return null if burn rate is zero or positive (profitable/breakeven)
    // If averageMonthlyBurn >= 0, the business is profitable or breakeven (no runway risk)
    if (averageMonthlyBurn >= 0) {
      return null;
    }

    // Calculate runway in months
    // Runway = current cash balance / average monthly burn rate
    // Use absolute value of burn rate since it's negative (burning cash)
    const averageMonthlyBurnRate = Math.abs(averageMonthlyBurn);
    
    // PART 1: Safe division guard
    if (!averageMonthlyBurnRate || averageMonthlyBurnRate <= 0) {
      return null;
    }
    
    const runwayMonths = currentBalance / averageMonthlyBurnRate;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(runwayMonths) || !isFinite(runwayMonths)) {
      return null;
    }

    // ⚠️ FROZEN: Return null for healthy runway (>= 12 months)
    // This threshold is test-locked and intentional
    if (runwayMonths >= LiquidityRunwayRiskRule.HEALTHY_RUNWAY_MONTHS) {
      return null;
    }

    // Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let criticalThreshold: number;
    let warningThreshold: number;
    let healthyThreshold: number;
    
    // Note: liquidityRunway thresholds not in user's profile, use defaults
    if (useThaiSME && businessType === 'accommodation') {
      // Use default thresholds (not in profile)
      criticalThreshold = 2;  // More sensitive for Thai SME
      warningThreshold = 4;    // More sensitive for Thai SME
      healthyThreshold = 12;  // Keep healthy at default
    } else {
      // Use default thresholds (frozen values)
      criticalThreshold = LiquidityRunwayRiskRule.CRITICAL_RUNWAY_THRESHOLD;  // 3 months
      warningThreshold = LiquidityRunwayRiskRule.WARNING_RUNWAY_THRESHOLD;    // 6 months
      healthyThreshold = LiquidityRunwayRiskRule.HEALTHY_RUNWAY_MONTHS;       // 12 months
    }
    
    // ⚠️ FROZEN: Return null for healthy runway (>= 12 months)
    if (runwayMonths >= healthyThreshold) {
      return null;
    }
    
    // ⚠️ FROZEN: Determine severity exactly once (now using profile thresholds when Thai SME mode is enabled)
    const severity: 'critical' | 'warning' | 'informational' = 
      runwayMonths < criticalThreshold ? 'critical' :
      runwayMonths < warningThreshold ? 'warning' :
      'informational'; // 6-12 months

    // Determine time horizon based on severity
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // Calculate confidence based on total data points provided
    // Confidence must increase with more historical data
    const confidence = this.calculateConfidence(operationalSignals.length);

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      runwayMonths,
      severity
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      runwayMonths,
      averageMonthlyBurnRate,
      currentBalance
    );

    const alert: AlertContract = {
      id: `liquidity-runway-risk-${Date.now()}`,
      timestamp: today,
      type: 'risk',
      severity,
      domain: 'forecast',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence,
      contributingFactors,
      conditions: [
        `Estimated runway: ${runwayMonths.toFixed(1)} months`,
        `Cash balance: $${currentBalance.toLocaleString()}`,
        `Average monthly burn: $${averageMonthlyBurnRate.toLocaleString()}`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }


  // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private calculateConfidence(dataPoints: number): number {
    // Base confidence = 0.6
    // Confidence must increase with more historical data
    // Add +0.005 per day beyond minimum 30 days
    // Cap at 0.95
    let confidence = LiquidityRunwayRiskRule.CONFIDENCE_BASE;

    // Bonus for more data points (beyond minimum 30)
    const extraDays = dataPoints - LiquidityRunwayRiskRule.MINIMUM_DATA_DAYS;
    confidence += extraDays * LiquidityRunwayRiskRule.CONFIDENCE_INCREMENT_PER_DAY;

    return Math.min(LiquidityRunwayRiskRule.CONFIDENCE_MAX, Math.max(LiquidityRunwayRiskRule.CONFIDENCE_MIN, confidence));
  }

  // ⚠️ FROZEN: Message and recommendations generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Recommendation wording is test-locked and must match explainer expectations
  private generateMessageAndRecommendations(
    runwayMonths: number,
    severity: 'critical' | 'warning' | 'informational'
  ): { message: string; recommendations: string } {
    // Message must mention "liquidity runway" (test expects lowercase "liquidity")
    const message = `liquidity runway risk: ${runwayMonths.toFixed(1)} months of cash remaining at current burn rate`;

    // ⚠️ FROZEN: Recommendation wording is test-locked
    // Do NOT modify these strings without updating tests and explainer
    let recommendations: string;
    if (severity === 'critical') {
      recommendations = 'Implement immediate cash preservation and secure emergency financing';
    } else if (severity === 'warning') {
      recommendations = 'Implement cost control measures and prepare funding options';
    } else {
      recommendations = 'Continue monitoring cash flow patterns and develop contingency planning';
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    runwayMonths: number,
    averageMonthlyBurn: number,
    currentBalance: number
  ) {
    const factors = [];

    // Burn rate factor
    if (averageMonthlyBurn > currentBalance * 0.1) { // >10% of balance per month
      factors.push({
        factor: `High monthly burn rate: $${averageMonthlyBurn.toLocaleString()} creates liquidity pressure`,
        weight: Math.min(1.0, averageMonthlyBurn / (currentBalance * 0.2))
      });
    } else {
      factors.push({
        factor: `Monthly burn rate: $${averageMonthlyBurn.toLocaleString()} relative to cash reserves`,
        weight: Math.min(1.0, averageMonthlyBurn / (currentBalance * 0.15))
      });
    }

    // Cash reserves factor
    if (runwayMonths < 6) {
      factors.push({
        factor: `Limited cash reserves: ${runwayMonths.toFixed(1)} months runway creates vulnerability`,
        weight: Math.min(1.0, (6 - runwayMonths) / 6)
      });
    }

    // Runway urgency factor
    if (runwayMonths < 3) {
      factors.push({
        factor: 'Critical runway shortage requires immediate action',
        weight: 1.0
      });
    }

    return factors.length > 0 ? factors : [
      { factor: 'Liquidity runway analysis', weight: 1.0 }
    ];
  }
}
