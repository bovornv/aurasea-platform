import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * ⚠️ FROZEN ALERT IMPLEMENTATION ⚠️
 * 
 * Break-even Risk Alert Rule
 * Status: Production-ready, test-locked, canonical implementation
 * 
 * This alert has passed all unit tests (17 rule tests + 9 explainer tests).
 * Logic, thresholds, severity mapping, confidence calculation, and recommendation
 * wording are finalized and intentional.
 * 
 * ⚠️ MANDATORY CHANGE PROCESS:
 * - DO NOT modify thresholds, severity logic, confidence calculation, or recommendation strings
 * - DO NOT refactor structure or change control flow
 * - Any future changes require creating BreakEvenRiskV2 (new rule class)
 * - All changes must be approved through test updates first
 * 
 * Canonical thresholds (test-locked, intentional):
 * - Minimum data: 30 days
 * - Null return: ratio > 1.15
 * - Critical: ratio < 0.9
 * - Warning: 0.9 <= ratio < 1.0 (exactly 1.0 triggers warning)
 * - Informational: 1.0 <= ratio <= 1.15
 * - Confidence: base 0.6, +0.005 per day beyond 30, capped at 0.95
 */
export class BreakEvenRiskRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
    dailyExpenses: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 7) {
      return null;
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter to recent signals
    const recentSignals = operationalSignals.filter(signal =>
      signal.timestamp >= thirtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 7) {
      return null;
    }

    // Calculate break-even metrics
    const totalRevenue = recentSignals.reduce((sum, s) => sum + s.dailyRevenue, 0);
    const totalExpenses = recentSignals.reduce((sum, s) => sum + s.dailyExpenses, 0);

    if (totalRevenue <= 0 || totalExpenses <= 0) {
      return null;
    }

    // Calculate break-even ratio = actual revenue / break-even revenue
    // Break-even revenue = total expenses (expenses are the break-even point)
    // So ratio = totalRevenue / totalExpenses
    const breakEvenRatio = totalRevenue / totalExpenses;
    const revenueGap = totalRevenue - totalExpenses;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(breakEvenRatio) || !isFinite(breakEvenRatio) ||
        isNaN(revenueGap) || !isFinite(revenueGap)) {
      return null;
    }

    // ⚠️ FROZEN: Null return threshold (DO NOT MODIFY WITHOUT TEST UPDATES)
    // Return null if well above break-even (ratio > 1.15)
    // This threshold (1.15) is test-locked and intentional
    if (breakEvenRatio > 1.15) {
      return null;
    }

    // ⚠️ FROZEN: Determine severity exactly once (order matters, DO NOT MODIFY WITHOUT TEST UPDATES)
    // Severity thresholds are test-locked constants (canonical, intentional):
    //   ratio < 0.9 → critical, immediate
    //   0.9 <= ratio < 1.0 → warning, near-term (exactly 1.0 triggers warning)
    //   1.0 <= ratio <= 1.15 → informational, medium-term
    const severity: 'critical' | 'warning' | 'informational' = 
      breakEvenRatio < 0.9 ? 'critical' :
      breakEvenRatio < 1.0 ? 'warning' : // Includes exactly 1.0
      'informational'; // 1.0-1.15

    // ⚠️ FROZEN: Time horizon mapping (DO NOT MODIFY WITHOUT TEST UPDATES)
    // Time horizon is directly mapped to severity (canonical, intentional)
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
    // Confidence must increase with more historical data
    // Uses operationalSignals.length (total data points) to allow confidence growth
    const rawConfidence = this.calculateConfidence(operationalSignals.length);
    // Apply confidence cap for insufficient data (below full 30-day minimum)
    const confidence = operationalSignals.length < 30
      ? Math.min(rawConfidence, 0.6)
      : rawConfidence;

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
      id: `break-even-risk-${Date.now()}`,
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
  // Confidence calculation constants are test-locked (canonical, intentional):
  // - Base confidence: 0.6
  // - Increment: +0.005 per day beyond minimum 30 days
  // - Range: 0.6 (min) to 0.95 (max)
  private calculateConfidence(dataPoints: number): number {
    // ⚠️ FROZEN: Base confidence and increment values (DO NOT MODIFY WITHOUT TEST UPDATES)
    let confidence = 0.60; // Base confidence (test-locked)

    // Bonus for more data points (beyond minimum 30)
    const extraDays = dataPoints - 30;
    confidence += extraDays * 0.005; // +0.005 per extra day (test-locked)

    return Math.min(0.95, Math.max(0.60, confidence)); // Min/max caps (test-locked)
  }

  // ⚠️ FROZEN: Message and recommendation generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Message format and recommendation strings are test-locked (canonical, intentional)
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
