import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Break-even Risk Alert Rule
 * Detects when business is operating near or below break-even point
 */
export class BreakEvenRiskRule {
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

    // Calculate break-even ratio (revenue / expenses)
    const breakEvenRatio = totalRevenue / totalExpenses;
    const revenueGap = totalRevenue - totalExpenses;

    // Return null if well above break-even (ratio > 1.2)
    if (breakEvenRatio > 1.2) {
      return null;
    }

    // Determine severity
    const severity = this.determineSeverity(breakEvenRatio);

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length);

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

  private determineSeverity(breakEvenRatio: number): 'critical' | 'warning' | 'informational' {
    if (breakEvenRatio < 0.9) {
      return 'critical';
    }
    if (breakEvenRatio < 1.0) {
      return 'warning';
    }
    return 'informational'; // 1.0-1.2
  }

  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.70; // Base confidence

    // Bonus for more data points (beyond minimum 30)
    const extraDays = Math.min(60, dataPoints - 30);
    confidence += extraDays * 0.005; // +0.005 per extra day, max +0.30

    return Math.min(0.95, Math.max(0.60, confidence));
  }

  private generateMessageAndRecommendations(
    breakEvenRatio: number,
    revenueGap: number,
    severity: string
  ): { message: string; recommendations: string } {
    const severityLevel = severity === 'critical' ? 'Critical' :
                         severity === 'warning' ? 'Warning' : 'Moderate';

    const message = `${severityLevel} break-even risk: ${breakEvenRatio.toFixed(2)} revenue-to-expense ratio with $${revenueGap.toLocaleString()} gap`;

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
