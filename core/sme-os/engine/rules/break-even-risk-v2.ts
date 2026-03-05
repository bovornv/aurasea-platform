import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * ⚠️ FROZEN ALERT IMPLEMENTATION V2 ⚠️
 * 
 * Break-even Risk Alert Rule V2
 * Status: Production-ready, test-locked, canonical implementation with Thai SME support
 * 
 * V2 Changes:
 * - Supports Thai SME threshold calibration
 * - All other logic remains identical to V1 (frozen)
 * 
 * This V2 version maintains all frozen logic from V1 but adds configurable thresholds
 * for Thai SME business context. Original thresholds are used as defaults.
 */
export class BreakEvenRiskRuleV2 {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
    dailyExpenses: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 30) {
      return null;
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter to recent signals
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= thirtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 30) {
      return null;
    }

    // Calculate break-even metrics
    const totalRevenue = recentSignals.reduce((sum, s) => sum + s.dailyRevenue, 0);
    const totalExpenses = recentSignals.reduce((sum, s) => sum + s.dailyExpenses, 0);

    if (totalRevenue <= 0 || totalExpenses <= 0) {
      return null;
    }

    // Calculate break-even ratio = actual revenue / break-even revenue
    const breakEvenRatio = totalRevenue / totalExpenses;
    const revenueGap = totalRevenue - totalExpenses;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(breakEvenRatio) || !isFinite(breakEvenRatio) ||
        isNaN(revenueGap) || !isFinite(revenueGap)) {
      return null;
    }

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let nullReturnThreshold: number;
    let criticalThreshold: number;
    let warningThreshold: number;
    let informationalMin: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { breakEvenCritical?: number; breakEvenWarning?: number };
      criticalThreshold = thresholds.breakEvenCritical ?? 0.95;
      warningThreshold = thresholds.breakEvenWarning ?? 1.05;
      informationalMin = 1.0; // Keep at default
      nullReturnThreshold = 1.15; // Keep at default (not in profile)
    } else {
      // Use default thresholds
      nullReturnThreshold = 1.15;
      criticalThreshold = 0.9;
      warningThreshold = 1.0;
      informationalMin = 1.0;
    }

    // ⚠️ FROZEN: Null return threshold (now using resolved threshold)
    if (breakEvenRatio > nullReturnThreshold) {
      return null;
    }

    // ⚠️ FROZEN: Determine severity exactly once (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Severity thresholds (now using resolved thresholds):
    //   ratio < criticalThreshold → critical, immediate
    //   criticalThreshold <= ratio < warningThreshold → warning, near-term
    //   informationalMin <= ratio <= nullReturnThreshold → informational, medium-term
    const severity: 'critical' | 'warning' | 'informational' = 
      breakEvenRatio < criticalThreshold ? 'critical' :
      breakEvenRatio < warningThreshold ? 'warning' : // Includes exactly warningThreshold
      'informational'; // informationalMin-nullReturnThreshold

    // ⚠️ FROZEN: Time horizon mapping (DO NOT MODIFY WITHOUT TEST UPDATES)
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
    const confidence = this.calculateConfidence(operationalSignals.length);

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      breakEvenRatio,
      revenueGap,
      severity
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      breakEvenRatio,
      revenueGap,
      totalRevenue,
      totalExpenses
    );

    const alert: AlertContract = {
      id: `break-even-risk-v2-${Date.now()}`,
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
        `Break-even ratio: ${breakEvenRatio.toFixed(2)}`,
        `Revenue gap: $${revenueGap.toLocaleString()}`,
        `Total revenue: $${totalRevenue.toLocaleString()}`,
        `Total expenses: $${totalExpenses.toLocaleString()}`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.60; // Base confidence (test-locked)

    const extraDays = dataPoints - 30;
    confidence += extraDays * 0.005; // +0.005 per extra day (test-locked)

    return Math.min(0.95, Math.max(0.60, confidence)); // Min/max caps (test-locked)
  }

  // ⚠️ FROZEN: Message and recommendation generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private generateMessageAndRecommendations(
    breakEvenRatio: number,
    revenueGap: number,
    severity: string
  ): { message: string; recommendations: string } {
    const severityLevel = severity === 'critical' ? 'Critical' :
                         severity === 'warning' ? 'Warning' : 'Moderate';

    const message = `${severityLevel} break-even risk: ${breakEvenRatio.toFixed(2)} revenue-to-expense ratio with $${revenueGap.toLocaleString()} gap`;

    // ⚠️ FROZEN: Recommendation strings (DO NOT MODIFY WITHOUT TEST UPDATES)
    let recommendations: string;
    if (severity === 'critical') {
      recommendations = 'Implement immediate cost reduction and revenue enhancement strategies';
    } else if (severity === 'warning') {
      recommendations = 'Develop cost management and revenue optimization plans';
    } else {
      recommendations = 'Monitor profitability trends and optimize operational efficiency';
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    breakEvenRatio: number,
    revenueGap: number,
    totalRevenue: number,
    totalExpenses: number
  ) {
    const factors = [];

    // Break-even ratio factor
    if (breakEvenRatio < 0.9) {
      factors.push({
        factor: `Critical break-even shortfall: ${breakEvenRatio.toFixed(2)} ratio indicates severe profitability risk`,
        weight: Math.min(1.0, (1.0 - breakEvenRatio) * 2)
      });
    } else if (breakEvenRatio < 1.0) {
      factors.push({
        factor: `Break-even shortfall: ${breakEvenRatio.toFixed(2)} ratio indicates profitability concern`,
        weight: Math.min(1.0, (1.0 - breakEvenRatio) * 1.5)
      });
    } else {
      factors.push({
        factor: `Narrow profitability margin: ${breakEvenRatio.toFixed(2)} ratio indicates limited buffer`,
        weight: Math.min(1.0, (1.2 - breakEvenRatio) * 1.0)
      });
    }

    // Revenue gap factor
    if (revenueGap < 0) {
      factors.push({
        factor: `Operating at loss: $${Math.abs(revenueGap).toLocaleString()} negative gap requires immediate attention`,
        weight: Math.min(1.0, Math.abs(revenueGap) / totalRevenue)
      });
    } else {
      factors.push({
        factor: `Minimal profit margin: $${revenueGap.toLocaleString()} gap provides limited financial cushion`,
        weight: Math.min(1.0, (totalExpenses * 0.2 - revenueGap) / (totalExpenses * 0.2))
      });
    }

    return factors.length > 0 ? factors : [
      { factor: 'Break-even analysis', weight: 1.0 }
    ];
  }
}
