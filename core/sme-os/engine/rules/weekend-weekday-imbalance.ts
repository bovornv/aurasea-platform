import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Weekend-Weekday Imbalance Alert Rule
 * Detects pricing inefficiency and demand leakage between weekdays and weekends
 */
export class WeekendWeekdayImbalanceRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
    occupancyRate: number;
    averageDailyRate: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 28) {
      return null;
    }

    const today = new Date();
    const twentyEightDaysAgo = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);

    // Filter to 28-day rolling window
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= twentyEightDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 28) {
      return null;
    }

    // Classify days as weekday (Mon-Thu) or weekend (Fri-Sun)
    const weekdayData: typeof recentSignals = [];
    const weekendData: typeof recentSignals = [];

    recentSignals.forEach(signal => {
      const dayOfWeek = signal.timestamp.getDay(); // 0=Sunday, 1=Monday, etc.
      if (dayOfWeek >= 1 && dayOfWeek <= 4) { // Monday-Thursday
        weekdayData.push(signal);
      } else { // Friday-Sunday
        weekendData.push(signal);
      }
    });

    if (weekdayData.length === 0 || weekendData.length === 0) {
      return null;
    }

    // Calculate averages
    const weekdayAvg = this.calculateAverages(weekdayData);
    const weekendAvg = this.calculateAverages(weekendData);

    // Calculate key metrics
    const weekendPremiumRatio = weekendAvg.revenue / weekdayAvg.revenue;
    const occupancyDifference = Math.abs(weekendAvg.occupancy - weekdayAvg.occupancy);
    const weekdayOccupancyAdvantage = weekdayAvg.occupancy - weekendAvg.occupancy;
    const adrRatio = weekendAvg.adr / weekdayAvg.adr;

    // Detect imbalance patterns
    const imbalanceType = this.detectImbalanceType(
      weekendAvg.occupancy,
      weekdayAvg.occupancy,
      weekendPremiumRatio,
      adrRatio
    );

    if (imbalanceType === 'none') {
      return null;
    }

    // Determine severity
    const severity = this.determineSeverity(
      weekendAvg.occupancy,
      weekdayOccupancyAdvantage,
      weekendPremiumRatio,
      imbalanceType
    );

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      imbalanceType,
      weekendPremiumRatio,
      weekdayOccupancyAdvantage,
      weekendAvg,
      weekdayAvg
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      imbalanceType,
      weekendPremiumRatio,
      occupancyDifference,
      adrRatio
    );

    const alert: AlertContract = {
      id: `weekend-weekday-imbalance-${Date.now()}`,
      timestamp: today,
      type: 'opportunity',
      severity,
      domain: 'risk',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence: 0.75,
      contributingFactors,
      conditions: [
        `Weekend premium ratio: ${weekendPremiumRatio.toFixed(2)}x`,
        `Weekend occupancy: ${(weekendAvg.occupancy * 100).toFixed(1)}%`,
        `Weekday occupancy: ${(weekdayAvg.occupancy * 100).toFixed(1)}%`,
        `Weekend ADR: $${weekendAvg.adr.toFixed(0)}`,
        `Weekday ADR: $${weekdayAvg.adr.toFixed(0)}`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  private calculateAverages(data: Array<{
    dailyRevenue: number;
    occupancyRate: number;
    averageDailyRate: number;
  }>) {
    const sum = data.reduce((acc, signal) => ({
      revenue: acc.revenue + signal.dailyRevenue,
      occupancy: acc.occupancy + signal.occupancyRate,
      adr: acc.adr + signal.averageDailyRate
    }), { revenue: 0, occupancy: 0, adr: 0 });

    return {
      revenue: sum.revenue / data.length,
      occupancy: sum.occupancy / data.length,
      adr: sum.adr / data.length
    };
  }

  private detectImbalanceType(
    weekendOccupancy: number,
    weekdayOccupancy: number,
    weekendPremiumRatio: number,
    adrRatio: number
  ): 'underpriced_weekends' | 'overpriced_weekends' | 'weekday_leakage' | 'none' {
    // Underpriced weekends: High weekend occupancy but low premium
    if (weekendOccupancy > 0.80 && weekendPremiumRatio < 1.3) {
      return 'underpriced_weekends';
    }

    // Overpriced weekends: Low weekend occupancy but high premium
    if (weekendOccupancy < 0.70 && weekendPremiumRatio > 1.8) {
      return 'overpriced_weekends';
    }

    // Weekday demand leakage: Significantly higher weekday occupancy
    if (weekdayOccupancy - weekendOccupancy > 0.15) {
      return 'weekday_leakage';
    }

    return 'none';
  }

  private determineSeverity(
    weekendOccupancy: number,
    weekdayOccupancyAdvantage: number,
    weekendPremiumRatio: number,
    imbalanceType: string
  ): 'critical' | 'warning' | 'informational' {
    // Critical thresholds
    if (
      (weekendOccupancy > 0.90 && weekendPremiumRatio < 1.1) ||
      (weekendOccupancy < 0.50 && weekendPremiumRatio > 2.5) ||
      (weekdayOccupancyAdvantage > 0.30)
    ) {
      return 'critical';
    }

    // Warning thresholds
    if (
      (weekendOccupancy > 0.85 && weekendPremiumRatio < 1.2) ||
      (weekendOccupancy < 0.60 && weekendPremiumRatio > 2.0) ||
      (weekdayOccupancyAdvantage > 0.20)
    ) {
      return 'warning';
    }

    return 'informational';
  }

  private generateMessageAndRecommendations(
    imbalanceType: string,
    weekendPremiumRatio: number,
    weekdayOccupancyAdvantage: number,
    weekendAvg: { revenue: number; occupancy: number; adr: number },
    weekdayAvg: { revenue: number; occupancy: number; adr: number }
  ): { message: string; recommendations: string } {
    switch (imbalanceType) {
      case 'underpriced_weekends':
        const suggestedIncrease = Math.min(25, (1.4 - weekendPremiumRatio) * 100);
        return {
          message: `Weekend demand exceeds pricing: ${(weekendAvg.occupancy * 100).toFixed(1)}% occupancy with only ${weekendPremiumRatio.toFixed(2)}x weekday premium`,
          recommendations: `Consider increasing weekend rates by ${suggestedIncrease.toFixed(0)}%`
        };

      case 'overpriced_weekends':
        const suggestedDecrease = Math.min(20, (weekendPremiumRatio - 1.6) * 100);
        return {
          message: `Weekend pricing may be limiting demand: ${(weekendAvg.occupancy * 100).toFixed(1)}% occupancy with ${weekendPremiumRatio.toFixed(2)}x weekday premium`,
          recommendations: `Consider reducing weekend rates by ${suggestedDecrease.toFixed(0)}% or adding value packages`
        };

      case 'weekday_leakage':
        return {
          message: `Weekday occupancy significantly higher than weekends: ${(weekdayOccupancyAdvantage * 100).toFixed(1)}% difference indicates demand leakage`,
          recommendations: `Implement weekend promotions or packages to capture demand`
        };

      default:
        return {
          message: 'Weekend-weekday imbalance detected',
          recommendations: 'Monitor pricing strategy'
        };
    }
  }

  private generateContributingFactors(
    imbalanceType: string,
    weekendPremiumRatio: number,
    occupancyDifference: number,
    adrRatio: number
  ) {
    const factors = [];

    if (imbalanceType === 'underpriced_weekends') {
      factors.push({
        factor: 'High weekend occupancy with low price premium',
        weight: Math.min(1.0, (0.85 - (weekendPremiumRatio - 1.0)) * 2)
      });
    }

    if (imbalanceType === 'overpriced_weekends') {
      factors.push({
        factor: 'Low weekend occupancy despite high price premium',
        weight: Math.min(1.0, (weekendPremiumRatio - 1.5) / 1.0)
      });
    }

    if (imbalanceType === 'weekday_leakage') {
      factors.push({
        factor: 'Weekday demand significantly exceeds weekend demand',
        weight: Math.min(1.0, occupancyDifference * 2)
      });
    }

    if (Math.abs(adrRatio - weekendPremiumRatio) > 0.2) {
      factors.push({
        factor: 'ADR and revenue premium misalignment',
        weight: Math.min(1.0, Math.abs(adrRatio - weekendPremiumRatio) * 2)
      });
    }

    return factors.length > 0 ? factors : [
      { factor: 'Weekend-weekday demand pattern analysis', weight: 1.0 }
    ];
  }
}
