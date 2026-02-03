import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Weekend-Weekday Imbalance Alert Rule (Revenue Opportunity)
 * Detects strong weekend demand but weak weekday occupancy for Thai hotels/resorts
 * This is an OPPORTUNITY alert, not a risk alert
 */
export class WeekendWeekdayImbalanceRule {
  evaluate(
    input: InputContract,
    operationalSignals?: Array<{
      timestamp: Date;
      revenue7Days: number;
      revenue30Days: number;
      occupancyRate?: number;
    }>,
    businessType?: 'cafe' | 'resort' | 'restaurant' | 'hotel'
  ): AlertContract | null {
    // Only applies to hotels and resorts
    if (businessType !== 'hotel' && businessType !== 'resort') {
      return null;
    }

    if (!operationalSignals || operationalSignals.length < 2) {
      return null;
    }

    const today = new Date();
    const latest = operationalSignals[0];
    const previous = operationalSignals[1];

    // Need occupancy rate data for this alert
    if (latest.occupancyRate === undefined || previous.occupancyRate === undefined) {
      return null;
    }

    // Calculate average occupancy
    const avgOccupancy = latest.occupancyRate;
    
    // Heuristic: If occupancy is moderate-high (50%+) but revenue per day is inconsistent,
    // it suggests weekend/weekday imbalance
    // For 7-day revenue, weekends typically account for 40-50% of weekly revenue
    // If we see high occupancy but revenue doesn't scale linearly, it suggests imbalance
    
    const revenuePerDay7Days = latest.revenue7Days / 7;
    const revenuePerDay30Days = latest.revenue30Days / 30;
    
    // Calculate revenue efficiency (revenue per occupancy point)
    // Lower efficiency suggests weekday underutilization
    const revenueEfficiency = avgOccupancy > 0 
      ? revenuePerDay7Days / (avgOccupancy * 100) 
      : 0;

    // Detect pattern: High occupancy (>60%) but revenue efficiency suggests weekday gaps
    // This indicates strong weekends but weak weekdays
    const highOccupancy = avgOccupancy >= 0.60; // 60%+ occupancy
    const moderateOccupancy = avgOccupancy >= 0.45; // 45%+ occupancy
    
    // Revenue efficiency threshold: if efficiency is low relative to occupancy,
    // it suggests weekday underutilization
    const lowEfficiency = revenueEfficiency < 0.8 && avgOccupancy > 0.50;
    
    // Revenue variance: if 7-day vs 30-day per-day revenue differs significantly,
    // it suggests weekly patterns (weekend/weekday)
    const revenueVariance = revenuePerDay30Days > 0
      ? Math.abs(revenuePerDay7Days - revenuePerDay30Days) / revenuePerDay30Days
      : 0;
    
    const hasImbalance = (highOccupancy || moderateOccupancy) && 
                        (lowEfficiency || revenueVariance > 0.15);

    if (!hasImbalance) {
      return null;
    }

    // Determine severity (for opportunity alerts, higher occupancy = higher opportunity)
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (avgOccupancy >= 0.70 && lowEfficiency) {
      severity = 'warning'; // High opportunity
    } else if (avgOccupancy >= 0.60) {
      severity = 'informational';
    }

    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'medium-term';
    if (avgOccupancy >= 0.70) {
      timeHorizon = 'near-term';
    }

    // Generate message
    const occupancyPercent = Math.round(avgOccupancy * 100);
    const message = `Occupancy at ${occupancyPercent}% suggests strong weekend demand with weekday underutilization opportunity`;

    // Contributing factors
    const contributingFactors = [];
    if (highOccupancy) {
      contributingFactors.push({
        factor: 'High overall occupancy rate',
        weight: Math.min(1.0, avgOccupancy)
      });
    }
    if (lowEfficiency) {
      contributingFactors.push({
        factor: 'Revenue efficiency suggests weekday gaps',
        weight: Math.min(1.0, (0.8 - revenueEfficiency) / 0.8)
      });
    }
    if (revenueVariance > 0.15) {
      contributingFactors.push({
        factor: 'Weekly revenue patterns detected',
        weight: Math.min(1.0, revenueVariance / 0.3)
      });
    }

    const alert: AlertContract = {
      id: `weekend-weekday-imbalance-${Date.now()}`,
      timestamp: today,
      type: 'opportunity', // This is an opportunity alert, not a risk
      severity,
      domain: 'forecast', // Revenue opportunity domain
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000) // 60 days
      },
      message,
      confidence: 0.68, // Moderate confidence - pattern detection
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Occupancy pattern analysis', weight: 1.0 }
      ],
      conditions: [
        `Current occupancy rate: ${occupancyPercent}%`,
        `7-day revenue per day: ${revenuePerDay7Days.toLocaleString()}`,
        `30-day revenue per day: ${revenuePerDay30Days.toLocaleString()}`,
        `Revenue efficiency: ${revenueEfficiency.toFixed(2)}`,
        `Business type: ${businessType}`
      ]
    };

    return alert;
  }
}
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
