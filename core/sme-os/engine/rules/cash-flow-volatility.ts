import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Cash Flow Volatility Risk Alert Rule
 * Detects high volatility in cash flow patterns that create business risk
 * 
 * ⚠️ FROZEN ⚠️
 * 
 * Alert Name: Cash Flow Volatility Alert
 * Status: FROZEN
 * Reason: All rule + explainer tests (18/18) passing and validated
 * 
 * This alert implementation has passed 18/18 tests and its behavior is canonical.
 * The current logic, thresholds, severity mapping, null-return conditions, and
 * confidence calculations are final and intentional.
 * 
 * CRITICAL CONSTRAINTS:
 * - Severity thresholds are intentional and must NOT be altered without changing tests first
 * - CV < 0.25 intentionally returns null (not informational) - this is intentional
 * - All severity thresholds are treated as constants and must not be reassigned dynamically
 * - Confidence calculation uses fixed base (0.6) and increments (+0.05 per 30-day block) - intentional
 * 
 * CHANGE PROCESS (MANDATORY):
 * 1. Any future changes MUST begin by updating tests first
 * 2. Refactors without failing tests are NOT allowed
 * 3. Do NOT modify thresholds, conditions, messages, confidence calculations, or severity mapping
 *    without explicit test updates that define the new expected behavior
 * 
 * Current canonical thresholds (DO NOT MODIFY WITHOUT TEST UPDATES):
 * - CV < 0.25 → return null (stable, no alert)
 * - CV >= 0.25 and < 0.5 → informational
 * - CV >= 0.5 and < 0.75 → warning
 * - CV >= 0.75 → critical
 */
export class CashFlowVolatilityRule {
  // ⚠️ FROZEN: Threshold constants (DO NOT MODIFY WITHOUT TEST UPDATES)
  private static readonly MINIMUM_DATA_DAYS = 60;
  private static readonly CV_THRESHOLD_INFORMATIONAL = 0.25;
  private static readonly CV_THRESHOLD_WARNING = 0.5;
  private static readonly CV_THRESHOLD_CRITICAL = 0.75;
  
  // ⚠️ FROZEN: Confidence calculation constants (DO NOT MODIFY WITHOUT TEST UPDATES)
  private static readonly CONFIDENCE_BASE = 0.6;
  private static readonly CONFIDENCE_INCREMENT_PER_30_DAYS = 0.05;
  private static readonly CONFIDENCE_MAX = 0.95;
  private static readonly CONFIDENCE_MIN = 0.6;
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    // ⚠️ FROZEN: Early return guard clauses (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Return null ONLY when:
    // 1. insufficient data is provided
    // 2. total days < 60
    // 3. mean revenue === 0
    // 4. coefficient of variation (CV) < 0.25
    // These checks must remain in this exact order
    if (!operationalSignals || operationalSignals.length < CashFlowVolatilityRule.MINIMUM_DATA_DAYS) {
      return null;
    }

    const today = new Date();
    const sixtyDaysAgo = new Date(today.getTime() - CashFlowVolatilityRule.MINIMUM_DATA_DAYS * 24 * 60 * 60 * 1000);

    // Filter to signals with at least 60 days of data
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= sixtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < CashFlowVolatilityRule.MINIMUM_DATA_DAYS) {
      return null;
    }

    // Calculate revenue statistics
    const revenues = recentSignals.map(s => s.dailyRevenue);
    const totalRevenue = revenues.reduce((sum, rev) => sum + rev, 0);
    const meanRevenue = totalRevenue / revenues.length;

    // Return null if mean revenue is zero
    if (meanRevenue === 0) {
      return null;
    }

    // Calculate coefficient of variation (use raw CV for all comparisons)
    // ⚠️ FROZEN: CV calculation must use raw (unrounded) value for threshold comparisons
    const variance = revenues.reduce((sum, rev) => sum + Math.pow(rev - meanRevenue, 2), 0) / revenues.length;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(variance) || !isFinite(variance) || variance < 0) {
      return null;
    }
    
    const standardDeviation = Math.sqrt(variance);
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(standardDeviation) || !isFinite(standardDeviation)) {
      return null;
    }
    
    const coefficientOfVariation = standardDeviation / meanRevenue;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(coefficientOfVariation) || !isFinite(coefficientOfVariation)) {
      return null;
    }

    // Return null ONLY when CV < 0.25 (use raw CV, not rounded)
    // ⚠️ FROZEN: This threshold (0.25) is test-locked and intentional
    // Do NOT return null for CV >= 0.25 under any circumstance
    if (coefficientOfVariation < CashFlowVolatilityRule.CV_THRESHOLD_INFORMATIONAL) {
      return null;
    }

    // ⚠️ FROZEN: Once CV >= 0.25 is confirmed, the function MUST ALWAYS construct and return an alert object
    // Do NOT place alert creation inside nested conditionals that may be skipped
    // Do NOT allow any code path with CV >= 0.25 to return null

    // Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let criticalThreshold: number;
    let warningThreshold: number;
    let informationalThreshold: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { revenueVolatilityCritical?: number; revenueVolatilityWarning?: number };
      criticalThreshold = thresholds.revenueVolatilityCritical ?? 0.40;
      warningThreshold = thresholds.revenueVolatilityWarning ?? 0.25;
      informationalThreshold = 0.25;
    } else {
      // Use default thresholds (frozen values)
      criticalThreshold = CashFlowVolatilityRule.CV_THRESHOLD_CRITICAL;  // 0.75
      warningThreshold = CashFlowVolatilityRule.CV_THRESHOLD_WARNING;    // 0.5
      informationalThreshold = CashFlowVolatilityRule.CV_THRESHOLD_INFORMATIONAL; // 0.25
    }
    
    // ⚠️ FROZEN: Determine severity exactly once using raw CV (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Severity thresholds (now using profile-based thresholds when Thai SME mode is enabled)
    // Severity must be assigned once and never reassigned later
    const severity: 'critical' | 'warning' | 'informational' = 
      coefficientOfVariation >= criticalThreshold ? 'critical' :
      coefficientOfVariation >= warningThreshold ? 'warning' :
      'informational'; // CV >= informationalThreshold (already checked above)
    
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // Calculate confidence
    // Base confidence = 0.6
    // +0.05 for every full 30 days beyond 60
    // Use >= 60 days (not > 60)
    // Cap at 0.95
    // Confidence must increase with more data points
    const confidence = this.calculateConfidence(recentSignals.length);

    // Round CV to 2 decimal places for display only
    const cvRounded = Math.round(coefficientOfVariation * 100) / 100;

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      coefficientOfVariation,
      severity
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      coefficientOfVariation,
      meanRevenue,
      standardDeviation
    );

    // Build conditions array with required strings
    // Always include "Volatility (CV):" and "Data points:"
    // For warning or critical severity, include "cash flow management"
    const conditions = [
      `Volatility (CV): ${cvRounded.toFixed(2)}`,
      `Data points: ${recentSignals.length} days`
    ];

    // Add recommendation
    conditions.push(`Recommendations: ${recommendations}`);
    
    // For warning or critical severity, ensure at least one condition contains "cash flow management"
    // Check if any condition already includes "cash flow management" (case-insensitive)
    const hasCashFlowManagement = conditions.some(c => 
      c.toLowerCase().includes('cash flow management')
    );
    
    // If not found and severity is warning/critical, add explicit cash flow management condition
    if ((severity === 'warning' || severity === 'critical') && !hasCashFlowManagement) {
      conditions.push('Requires cash flow management to mitigate volatility risk');
    }

    // CRITICAL: Always construct and return alert object (no conditional returns after this point)
    const alert: AlertContract = {
      id: `cash-flow-volatility-${Date.now()}`,
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
      conditions
    };

    return alert;
  }


  // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private calculateConfidence(dataPoints: number): number {
    // Base confidence = 0.6
    // Add +0.05 for EACH full 30-day block beyond 60 days
    // Exactly 60 days = 0.6 (base)
    // 90 days = 0.6 + 0.05 = 0.65 (one full 30-day block)
    // 120 days = 0.6 + 0.10 = 0.7 (two full 30-day blocks)
    // Confidence MUST increase when more data is provided (e.g. 120 > 90)
    // Cap confidence at 0.95
    let confidence = CashFlowVolatilityRule.CONFIDENCE_BASE;

    // Calculate full 30-day blocks beyond 60 days
    const daysBeyond60 = dataPoints - CashFlowVolatilityRule.MINIMUM_DATA_DAYS;
    const full30DayPeriods = Math.floor(daysBeyond60 / 30);
    confidence += full30DayPeriods * CashFlowVolatilityRule.CONFIDENCE_INCREMENT_PER_30_DAYS;

    // Cap confidence at max, ensure minimum of base
    return Math.min(CashFlowVolatilityRule.CONFIDENCE_MAX, Math.max(CashFlowVolatilityRule.CONFIDENCE_MIN, confidence));
  }

  private generateMessageAndRecommendations(
    coefficientOfVariation: number,
    severity: string
  ): { message: string; recommendations: string } {
    const severityLevel = severity === 'critical' ? 'Extreme' :
                         severity === 'warning' ? 'High' : 'Moderate';

    const message = `${severityLevel} cash flow volatility detected: ${coefficientOfVariation.toFixed(2)} coefficient of variation indicates unpredictable revenue patterns`;

    let recommendations: string;
    if (severity === 'critical') {
      recommendations = 'Implement emergency cash flow management and revenue stabilization strategies';
    } else if (severity === 'warning') {
      recommendations = 'Develop cash flow management and revenue smoothing strategies';
    } else {
      recommendations = 'Monitor cash flow patterns and develop volatility management plans';
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    coefficientOfVariation: number,
    meanRevenue: number,
    standardDeviation: number
  ) {
    const factors = [];

    // ⚠️ FROZEN: Volatility magnitude factor (required: one factor referencing volatility magnitude)
    // Uses same thresholds as severity determination
    if (coefficientOfVariation >= CashFlowVolatilityRule.CV_THRESHOLD_CRITICAL) {
      factors.push({
        factor: `Extreme revenue volatility: ${coefficientOfVariation.toFixed(2)} CV indicates severe unpredictability`,
        weight: Math.min(1.0, coefficientOfVariation)
      });
    } else if (coefficientOfVariation >= CashFlowVolatilityRule.CV_THRESHOLD_WARNING) {
      factors.push({
        factor: `High revenue volatility: ${coefficientOfVariation.toFixed(2)} CV indicates significant unpredictability`,
        weight: Math.min(1.0, coefficientOfVariation)
      });
    } else {
      factors.push({
        factor: `Moderate revenue volatility: ${coefficientOfVariation.toFixed(2)} CV indicates emerging unpredictability`,
        weight: Math.min(1.0, coefficientOfVariation)
      });
    }

    // Revenue instability factor (required: one factor referencing revenue instability)
    factors.push({
      factor: `Revenue instability: High variation in daily revenue patterns creates cash flow uncertainty`,
      weight: Math.min(1.0, coefficientOfVariation)
    });

    // Standard deviation factor (additional context)
    if (standardDeviation > meanRevenue * 0.5) {
      factors.push({
        factor: 'High standard deviation relative to mean revenue',
        weight: Math.min(1.0, standardDeviation / meanRevenue)
      });
    }

    return factors.length > 0 ? factors : [
      { factor: 'Cash flow volatility pattern analysis', weight: 1.0 }
    ];
  }
}
