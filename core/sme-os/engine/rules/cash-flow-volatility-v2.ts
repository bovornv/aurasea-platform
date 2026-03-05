import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Cash Flow Volatility Risk Alert Rule V2
 * Detects high volatility in cash flow patterns that create business risk
 * 
 * V2 Changes:
 * - Supports Thai SME threshold calibration
 * - All other logic remains identical to V1 (frozen)
 * 
 * This V2 version maintains all frozen logic from V1 but adds configurable thresholds
 * for Thai SME business context. Original thresholds are used as defaults.
 */
export class CashFlowVolatilityRuleV2 {
  // ⚠️ FROZEN: Threshold constants (DO NOT MODIFY WITHOUT TEST UPDATES)
  private static readonly MINIMUM_DATA_DAYS = 60;
  
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
    if (!operationalSignals || operationalSignals.length < CashFlowVolatilityRuleV2.MINIMUM_DATA_DAYS) {
      return null;
    }

    const today = new Date();
    const sixtyDaysAgo = new Date(today.getTime() - CashFlowVolatilityRuleV2.MINIMUM_DATA_DAYS * 24 * 60 * 60 * 1000);

    // Filter to signals with at least 60 days of data
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= sixtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < CashFlowVolatilityRuleV2.MINIMUM_DATA_DAYS) {
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

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let informationalThreshold: number;
    let warningThreshold: number;
    let criticalThreshold: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { revenueVolatilityWarning?: number; revenueVolatilityCritical?: number };
      informationalThreshold = thresholds.revenueVolatilityWarning ?? 0.25;
      criticalThreshold = thresholds.revenueVolatilityCritical ?? 0.40;
      warningThreshold = (informationalThreshold + criticalThreshold) / 2;
    } else {
      // Use default thresholds
      informationalThreshold = 0.25;
      warningThreshold = 0.5;
      criticalThreshold = 0.75;
    }

    // Return null ONLY when CV < informationalThreshold (use raw CV, not rounded)
    // ⚠️ FROZEN: This threshold logic is test-locked and intentional
    if (coefficientOfVariation < informationalThreshold) {
      return null;
    }

    // ⚠️ FROZEN: Once CV >= informationalThreshold is confirmed, the function MUST ALWAYS construct and return an alert object
    // Determine severity exactly once using raw CV (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Severity thresholds (now using resolved thresholds):
    //   CV >= criticalThreshold → severity "critical", timeHorizon "immediate"
    //   CV >= warningThreshold → severity "warning", timeHorizon "near-term"
    //   CV >= informationalThreshold → severity "informational", timeHorizon "medium-term"
    const severity: 'critical' | 'warning' | 'informational' = 
      coefficientOfVariation >= criticalThreshold ? 'critical' :
      coefficientOfVariation >= warningThreshold ? 'warning' :
      'informational'; // CV >= informationalThreshold (already checked above)
    
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // Calculate confidence
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
      standardDeviation,
      criticalThreshold,
      warningThreshold
    );

    // Build conditions array with required strings
    const conditions = [
      `Volatility (CV): ${cvRounded.toFixed(2)}`,
      `Data points: ${recentSignals.length} days`
    ];

    // Add recommendation
    conditions.push(`Recommendations: ${recommendations}`);
    
    // For warning or critical severity, ensure at least one condition contains "cash flow management"
    const hasCashFlowManagement = conditions.some(c => 
      c.toLowerCase().includes('cash flow management')
    );
    
    if ((severity === 'warning' || severity === 'critical') && !hasCashFlowManagement) {
      conditions.push('Requires cash flow management to mitigate volatility risk');
    }

    // CRITICAL: Always construct and return alert object
    const alert: AlertContract = {
      id: `cash-flow-volatility-v2-${Date.now()}`,
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
    let confidence = CashFlowVolatilityRuleV2.CONFIDENCE_BASE;

    const daysBeyond60 = dataPoints - CashFlowVolatilityRuleV2.MINIMUM_DATA_DAYS;
    const full30DayPeriods = Math.floor(daysBeyond60 / 30);
    confidence += full30DayPeriods * CashFlowVolatilityRuleV2.CONFIDENCE_INCREMENT_PER_30_DAYS;

    return Math.min(CashFlowVolatilityRuleV2.CONFIDENCE_MAX, Math.max(CashFlowVolatilityRuleV2.CONFIDENCE_MIN, confidence));
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
    standardDeviation: number,
    criticalThreshold: number,
    warningThreshold: number
  ) {
    const factors = [];

    // Volatility magnitude factor (uses resolved thresholds)
    if (coefficientOfVariation >= criticalThreshold) {
      factors.push({
        factor: `Extreme revenue volatility: ${coefficientOfVariation.toFixed(2)} CV indicates severe unpredictability`,
        weight: Math.min(1.0, coefficientOfVariation)
      });
    } else if (coefficientOfVariation >= warningThreshold) {
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

    // Revenue instability factor
    factors.push({
      factor: `Revenue instability: High variation in daily revenue patterns creates cash flow uncertainty`,
      weight: Math.min(1.0, coefficientOfVariation)
    });

    // Standard deviation factor
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
