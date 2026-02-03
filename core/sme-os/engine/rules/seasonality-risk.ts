import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Seasonality Risk Alert Rule
 * Detects revenue seasonality using monthly aggregation to identify business vulnerability
 */
export class SeasonalityRiskRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 90) {
      return null;
    }

    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Filter to signals with at least 90 days of data
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= ninetyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 90) {
      return null;
    }

    // Aggregate revenue by month
    const monthlyRevenue = this.aggregateMonthlyRevenue(recentSignals);
    const monthlyValues = Object.values(monthlyRevenue);
    
    if (monthlyValues.length < 3 || monthlyValues.some(val => val <= 0)) {
      return null;
    }

    // Calculate seasonality metrics
    const maxMonthlyRevenue = Math.max(...monthlyValues);
    const minMonthlyRevenue = Math.min(...monthlyValues);
    const seasonalityRatio = maxMonthlyRevenue / minMonthlyRevenue;

    // Find peak and low months
    const peakMonth = Object.keys(monthlyRevenue).find(month => monthlyRevenue[month] === maxMonthlyRevenue) || 'Unknown';
    const lowMonth = Object.keys(monthlyRevenue).find(month => monthlyRevenue[month] === minMonthlyRevenue) || 'Unknown';

    // Detect seasonality risk
    if (seasonalityRatio < 2.0) {
      return null; // No significant seasonality
    }

    // Determine severity
    const severity = this.determineSeverity(seasonalityRatio);

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length, monthlyValues.length);

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      seasonalityRatio,
      peakMonth,
      lowMonth
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      seasonalityRatio,
      peakMonth,
      lowMonth,
      maxMonthlyRevenue,
      minMonthlyRevenue
    );

    const alert: AlertContract = {
      id: `seasonality-risk-${Date.now()}`,
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
        `Seasonality ratio: ${seasonalityRatio.toFixed(1)}x`,
        `Peak month: ${peakMonth} ($${maxMonthlyRevenue.toLocaleString()})`,
        `Low month: ${lowMonth} ($${minMonthlyRevenue.toLocaleString()})`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  private aggregateMonthlyRevenue(signals: Array<{ timestamp: Date; dailyRevenue: number }>) {
    const monthlyRevenue: { [key: string]: number } = {};
    
    signals.forEach(signal => {
      const monthKey = `Month ${signal.timestamp.getMonth() + 1}`;
      if (!monthlyRevenue[monthKey]) {
        monthlyRevenue[monthKey] = 0;
      }
      monthlyRevenue[monthKey] += signal.dailyRevenue;
    });
    
    return monthlyRevenue;
  }

  private determineSeverity(seasonalityRatio: number): 'critical' | 'warning' | 'informational' {
    // Critical: Extreme seasonality (6x or higher)
    if (seasonalityRatio >= 6.0) {
      return 'critical';
    }

    // Warning: High seasonality (3x to 6x)
    if (seasonalityRatio >= 3.0) {
      return 'warning';
    }

    // Informational: Moderate seasonality (2x to 3x)
    return 'informational';
  }

  private calculateConfidence(dataPoints: number, monthCount: number): number {
    let confidence = 0.75; // Base confidence

    // Bonus for more data points (beyond minimum 90)
    const extraDays = Math.min(30, dataPoints - 90);
    confidence += extraDays * 0.005; // +0.005 per extra day, max +0.15

    // Bonus for more complete months
    if (monthCount >= 4) {
      confidence += 0.10;
    } else if (monthCount >= 3) {
      confidence += 0.05;
    }

    // Penalty for limited month coverage
    if (monthCount < 3) {
      confidence -= 0.15;
    }

    return Math.min(0.95, Math.max(0.60, confidence));
  }

  private generateMessageAndRecommendations(
    seasonalityRatio: number,
    peakMonth: string,
    lowMonth: string
  ): { message: string; recommendations: string } {
    const severityLevel = seasonalityRatio >= 6.0 ? 'Extreme' :
                         seasonalityRatio >= 3.0 ? 'High' : 'Moderate';

    const message = `${severityLevel} revenue seasonality detected: ${seasonalityRatio.toFixed(1)}x variation between peak and low months`;

    let recommendations: string;
    if (seasonalityRatio >= 6.0) {
      recommendations = 'Urgent seasonal risk management and diversification required';
    } else if (seasonalityRatio >= 3.0) {
      recommendations = 'Implement seasonal risk mitigation and revenue smoothing';
    } else {
      recommendations = 'Develop seasonal planning and cash flow management';
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    seasonalityRatio: number,
    peakMonth: string,
    lowMonth: string,
    maxMonthlyRevenue: number,
    minMonthlyRevenue: number
  ) {
    const factors = [];

    // Seasonality ratio factor
    if (seasonalityRatio >= 6.0) {
      factors.push({
        factor: `Extreme seasonal variation: ${seasonalityRatio.toFixed(1)}x ratio creates severe vulnerability`,
        weight: Math.min(1.0, seasonalityRatio / 10)
      });
    } else if (seasonalityRatio >= 3.0) {
      factors.push({
        factor: `High seasonal variation: ${seasonalityRatio.toFixed(1)}x ratio indicates significant risk`,
        weight: Math.min(1.0, seasonalityRatio / 6)
      });
    } else {
      factors.push({
        factor: `Moderate seasonal variation: ${seasonalityRatio.toFixed(1)}x ratio indicates emerging risk`,
        weight: Math.min(1.0, seasonalityRatio / 4)
      });
    }

    // Monthly revenue variation factor
    factors.push({
      factor: `Monthly revenue variation: ${peakMonth} to ${lowMonth}`,
      weight: Math.min(1.0, (seasonalityRatio - 1) / 5)
    });

    // Revenue concentration in peak period
    if (maxMonthlyRevenue > 0 && minMonthlyRevenue > 0) {
      const concentrationRisk = (maxMonthlyRevenue - minMonthlyRevenue) / maxMonthlyRevenue;
      if (concentrationRisk > 0.5) {
        factors.push({
          factor: 'High revenue concentration in peak periods',
          weight: Math.min(1.0, concentrationRisk)
        });
      }
    }

    return factors.length > 0 ? factors : [
      { factor: 'Seasonal revenue pattern analysis', weight: 1.0 }
    ];
  }
}
