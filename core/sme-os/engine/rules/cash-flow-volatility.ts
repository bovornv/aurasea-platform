import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Cash Flow Volatility Risk Alert Rule
 * Detects high volatility in cash flow patterns that create business risk
 */
export class CashFlowVolatilityRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 60) {
      return null;
    }

    const today = new Date();
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Filter to signals with at least 60 days of data
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= sixtyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 60) {
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

    // Calculate coefficient of variation
    const variance = revenues.reduce((sum, rev) => sum + Math.pow(rev - meanRevenue, 2), 0) / revenues.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / meanRevenue;

    // Return null if CV is below threshold
    if (coefficientOfVariation < 0.25) {
      return null;
    }

    // Determine severity based on CV
    const severity = this.determineSeverity(coefficientOfVariation);

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length);

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
      conditions: [
        `Volatility (CV): ${coefficientOfVariation.toFixed(2)}`,
        `Mean daily revenue: $${meanRevenue.toLocaleString()}`,
        `Standard deviation: $${standardDeviation.toLocaleString()}`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  private determineSeverity(coefficientOfVariation: number): 'critical' | 'warning' | 'informational' {
    if (coefficientOfVariation >= 0.75) {
      return 'critical';
    }
    if (coefficientOfVariation >= 0.5) {
      return 'warning';
    }
    return 'informational';
  }

  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.70; // Base confidence

    // Bonus for more data points (beyond minimum 60)
    const extraDays = Math.min(30, dataPoints - 60);
    confidence += extraDays * 0.005; // +0.005 per extra day, max +0.15

    return Math.min(0.95, Math.max(0.60, confidence));
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

    // Volatility level factor
    if (coefficientOfVariation >= 0.75) {
      factors.push({
        factor: `Extreme revenue volatility: ${coefficientOfVariation.toFixed(2)} CV indicates severe unpredictability`,
        weight: Math.min(1.0, coefficientOfVariation)
      });
    } else if (coefficientOfVariation >= 0.5) {
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
