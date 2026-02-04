import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Liquidity Runway Risk Alert Rule
 * Detects how many months of runway the business has before cash runs out
 */
export class LiquidityRunwayRiskRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    cashBalance: number;
    netCashFlow: number;
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

    // Get current cash balance (most recent)
    const currentBalance = recentSignals[0].cashBalance;
    
    // Return null if cash balance is missing or invalid
    if (currentBalance <= 0) {
      return null;
    }

    // Calculate average monthly net burn
    const netCashFlows = recentSignals.map(s => s.netCashFlow);
    const totalNetFlow = netCashFlows.reduce((sum, flow) => sum + flow, 0);
    const averageDailyBurn = totalNetFlow / netCashFlows.length;
    const averageMonthlyBurn = averageDailyBurn * 30;

    // Return null if burn rate is zero or negative (profitable/breakeven)
    if (averageMonthlyBurn <= 0) {
      return null;
    }

    // Calculate runway in months
    const runwayMonths = currentBalance / averageMonthlyBurn;

    // Return null for healthy runway (>= 12 months)
    if (runwayMonths >= 12) {
      return null;
    }

    // Determine severity
    const severity = this.determineSeverity(runwayMonths);

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length);

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      runwayMonths,
      severity
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      runwayMonths,
      averageMonthlyBurn,
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
        `Average monthly burn: $${averageMonthlyBurn.toLocaleString()}`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  private determineSeverity(runwayMonths: number): 'critical' | 'warning' | 'informational' {
    if (runwayMonths < 3) {
      return 'critical';
    }
    if (runwayMonths < 6) {
      return 'warning';
    }
    return 'informational'; // 6-12 months
  }

  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.60; // Base confidence

    // Bonus for more data points (beyond minimum 30)
    const extraDays = Math.min(60, dataPoints - 30);
    confidence += extraDays * 0.005; // +0.005 per extra day, max +0.30

    return Math.min(0.95, Math.max(0.60, confidence));
  }

  private generateMessageAndRecommendations(
    runwayMonths: number,
    severity: string
  ): { message: string; recommendations: string } {
    const message = `Liquidity runway risk: ${runwayMonths.toFixed(1)} months of cash remaining at current burn rate`;

    let recommendations: string;
    if (severity === 'critical') {
      recommendations = 'Implement immediate cash preservation and secure emergency financing';
    } else if (severity === 'warning') {
      recommendations = 'Implement cost control measures and prepare funding options';
    } else {
      recommendations = 'Monitor cash flow patterns and develop contingency planning';
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
