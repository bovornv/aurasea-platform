import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Liquidity Runway Risk Alert Rule V2
 * Detects how many months of runway the business has before cash runs out
 * 
 * V2 Changes:
 * - Supports Thai SME threshold calibration
 * - All other logic remains identical to V1 (frozen)
 * 
 * This V2 version maintains all frozen logic from V1 but adds configurable thresholds
 * for Thai SME business context. Original thresholds are used as defaults.
 */
export class LiquidityRunwayRiskRuleV2 {
  // ⚠️ FROZEN: Threshold constants (DO NOT MODIFY WITHOUT TEST UPDATES)
  private static readonly MINIMUM_DATA_DAYS = 30;
  
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
    if (!operationalSignals || operationalSignals.length < LiquidityRunwayRiskRuleV2.MINIMUM_DATA_DAYS) {
      return null;
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - LiquidityRunwayRiskRuleV2.MINIMUM_DATA_DAYS * 24 * 60 * 60 * 1000);

    // Filter to recent signals
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= thirtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < LiquidityRunwayRiskRuleV2.MINIMUM_DATA_DAYS) {
      return null;
    }

    // Get current cash balance (most recent signal)
    const currentBalance = recentSignals[0]?.cashBalance;
    
    if (!currentBalance || currentBalance <= 0) {
      return null;
    }

    // Calculate average monthly net burn
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
    
    const averageMonthlyBurn = averageDailyBurn * 30;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(averageMonthlyBurn) || !isFinite(averageMonthlyBurn)) {
      return null;
    }

    // Return null if burn rate is zero or positive (profitable/breakeven)
    if (averageMonthlyBurn >= 0) {
      return null;
    }

    // Calculate runway in months
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

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let healthyRunwayMonths: number;
    let criticalThreshold: number;
    let warningThreshold: number;
    let informationalThreshold: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { liquidityRunwayCritical?: number; liquidityRunwayWarning?: number };
      healthyRunwayMonths = 12;
      criticalThreshold = thresholds.liquidityRunwayCritical ?? 2;
      warningThreshold = thresholds.liquidityRunwayWarning ?? 4;
      informationalThreshold = 8;
    } else {
      // Use default thresholds
      healthyRunwayMonths = 12;
      criticalThreshold = 3;
      warningThreshold = 6;
      informationalThreshold = 12;
    }

    // ⚠️ FROZEN: Return null for healthy runway (now using resolved threshold)
    if (runwayMonths >= healthyRunwayMonths) {
      return null;
    }

    // ⚠️ FROZEN: Determine severity exactly once (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Severity thresholds (now using resolved thresholds):
    //   Runway < criticalThreshold → critical, immediate
    //   Runway criticalThreshold-warningThreshold → warning, near-term
    //   Runway warningThreshold-healthyRunwayMonths → informational, medium-term
    const severity: 'critical' | 'warning' | 'informational' = 
      runwayMonths < criticalThreshold ? 'critical' :
      runwayMonths < warningThreshold ? 'warning' :
      'informational'; // warningThreshold-healthyRunwayMonths

    // Determine time horizon based on severity
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // Calculate confidence based on total data points provided
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
      id: `liquidity-runway-risk-v2-${Date.now()}`,
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
    let confidence = LiquidityRunwayRiskRuleV2.CONFIDENCE_BASE;

    const extraDays = dataPoints - LiquidityRunwayRiskRuleV2.MINIMUM_DATA_DAYS;
    confidence += extraDays * LiquidityRunwayRiskRuleV2.CONFIDENCE_INCREMENT_PER_DAY;

    return Math.min(LiquidityRunwayRiskRuleV2.CONFIDENCE_MAX, Math.max(LiquidityRunwayRiskRuleV2.CONFIDENCE_MIN, confidence));
  }

  // ⚠️ FROZEN: Message and recommendations generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private generateMessageAndRecommendations(
    runwayMonths: number,
    severity: 'critical' | 'warning' | 'informational'
  ): { message: string; recommendations: string } {
    const message = `liquidity runway risk: ${runwayMonths.toFixed(1)} months of cash remaining at current burn rate`;

    // ⚠️ FROZEN: Recommendation wording is test-locked
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
    if (averageMonthlyBurn > currentBalance * 0.1) {
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
