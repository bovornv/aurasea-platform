import { AlertContract } from '../../contracts/alerts';

interface WeekendWeekdayExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  pricingAnalysis: {
    weekendPremium: string;
    occupancyPattern: string;
    revenueEfficiency: string;
  };
  recommendations: {
    immediate: string[];
    strategic: string[];
  };
}

interface AlertWithMetrics extends AlertContract {
  metrics?: {
    weekendPremiumRatio: number;
    weekendOccupancy: number;
    weekdayOccupancy: number;
    weekendADR: number;
    weekdayADR: number;
  };
}

export class WeekendWeekdayExplainer {
  explain(alert: AlertContract | null, weekendData?: Array<{
    timestamp: Date;
    dailyRevenue: number;
    occupancyRate: number;
    averageDailyRate: number;
  }>, weekdayData?: Array<{
    timestamp: Date;
    dailyRevenue: number;
    occupancyRate: number;
    averageDailyRate: number;
  }>): WeekendWeekdayExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No weekend-weekday imbalance detected or insufficient data',
        contributingFactors: [],
        pricingAnalysis: {
          weekendPremium: 'No premium analysis available',
          occupancyPattern: 'No occupancy pattern detected',
          revenueEfficiency: 'No efficiency analysis available'
        },
        recommendations: {
          immediate: [],
          strategic: []
        }
      };
    }

    const alertWithMetrics = alert as AlertWithMetrics;
    
    // Extract metrics from alert conditions or calculate from data
    let weekendPremiumRatio = 1.0;
    let weekendOccupancy = 0;
    let weekdayOccupancy = 0;
    let weekendADR = 0;
    let weekdayADR = 0;

    if (alertWithMetrics.metrics) {
      weekendPremiumRatio = alertWithMetrics.metrics.weekendPremiumRatio;
      weekendOccupancy = alertWithMetrics.metrics.weekendOccupancy;
      weekdayOccupancy = alertWithMetrics.metrics.weekdayOccupancy;
      weekendADR = alertWithMetrics.metrics.weekendADR;
      weekdayADR = alertWithMetrics.metrics.weekdayADR;
    } else if (weekendData && weekdayData && weekendData.length > 0 && weekdayData.length > 0) {
      const weekendAvg = this.calculateAverages(weekendData);
      const weekdayAvg = this.calculateAverages(weekdayData);
      
      weekendPremiumRatio = weekendAvg.revenue / weekdayAvg.revenue;
      weekendOccupancy = weekendAvg.occupancy;
      weekdayOccupancy = weekdayAvg.occupancy;
      weekendADR = weekendAvg.adr;
      weekdayADR = weekdayAvg.adr;
    }

    // Determine imbalance type from alert message
    const imbalanceType = this.detectImbalanceTypeFromAlert(alert);

    // Generate primary factor explanation
    const primaryFactor = this.generatePrimaryFactor(
      imbalanceType,
      weekendPremiumRatio,
      weekendOccupancy,
      weekdayOccupancy
    );

    // Generate contributing factors
    const contributingFactors = this.generateContributingFactors(
      imbalanceType,
      weekendPremiumRatio,
      weekendOccupancy,
      weekdayOccupancy,
      weekendADR,
      weekdayADR
    );

    // Generate pricing analysis
    const pricingAnalysis = this.analyzePricing(
      weekendPremiumRatio,
      weekendOccupancy,
      weekdayOccupancy,
      weekendADR,
      weekdayADR
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      imbalanceType,
      weekendPremiumRatio,
      weekendOccupancy,
      weekdayOccupancy
    );

    return {
      primaryFactor,
      contributingFactors,
      pricingAnalysis,
      recommendations
    };
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

  private detectImbalanceTypeFromAlert(alert: AlertContract): string {
    const message = alert.message.toLowerCase();
    
    if (message.includes('weekend demand exceeds pricing') || message.includes('low price premium')) {
      return 'underpriced_weekends';
    } else if (message.includes('weekend pricing may be limiting') || message.includes('high price premium')) {
      return 'overpriced_weekends';
    } else if (message.includes('weekday occupancy significantly higher') || message.includes('demand leakage')) {
      return 'weekday_leakage';
    }
    
    return 'general_imbalance';
  }

  private generatePrimaryFactor(
    imbalanceType: string,
    weekendPremiumRatio: number,
    weekendOccupancy: number,
    weekdayOccupancy: number
  ): string {
    switch (imbalanceType) {
      case 'underpriced_weekends':
        return `Weekend rates are underpriced: ${(weekendOccupancy * 100).toFixed(1)}% occupancy suggests demand exceeds current pricing at ${weekendPremiumRatio.toFixed(2)}x weekday rates`;
      
      case 'overpriced_weekends':
        return `Weekend rates may be too high: ${(weekendOccupancy * 100).toFixed(1)}% occupancy with ${weekendPremiumRatio.toFixed(2)}x premium suggests price resistance`;
      
      case 'weekday_leakage':
        const occupancyGap = ((weekdayOccupancy - weekendOccupancy) * 100).toFixed(1);
        return `Weekday occupancy exceeds weekend by ${occupancyGap}%, indicating potential weekend demand capture opportunity`;
      
      default:
        return `Weekend-weekday pricing imbalance detected with ${weekendPremiumRatio.toFixed(2)}x premium ratio`;
    }
  }

  private generateContributingFactors(
    imbalanceType: string,
    weekendPremiumRatio: number,
    weekendOccupancy: number,
    weekdayOccupancy: number,
    weekendADR: number,
    weekdayADR: number
  ): string[] {
    const factors: string[] = [];

    // Premium ratio analysis
    if (weekendPremiumRatio < 1.2) {
      factors.push(`Low weekend premium (${weekendPremiumRatio.toFixed(2)}x) may indicate underpricing`);
    } else if (weekendPremiumRatio > 2.0) {
      factors.push(`High weekend premium (${weekendPremiumRatio.toFixed(2)}x) may be limiting demand`);
    }

    // Occupancy pattern analysis
    const occupancyDiff = Math.abs(weekendOccupancy - weekdayOccupancy);
    if (occupancyDiff > 0.15) {
      factors.push(`Significant occupancy variance: ${(occupancyDiff * 100).toFixed(1)}% difference between periods`);
    }

    // ADR efficiency analysis
    const adrRatio = weekendADR / weekdayADR;
    if (Math.abs(adrRatio - weekendPremiumRatio) > 0.3) {
      factors.push(`ADR ratio (${adrRatio.toFixed(2)}x) differs from revenue premium, suggesting volume effects`);
    }

    // Specific pattern factors
    if (imbalanceType === 'underpriced_weekends' && weekendOccupancy > 0.85) {
      factors.push('High weekend occupancy indicates strong demand that could support higher rates');
    }

    if (imbalanceType === 'overpriced_weekends' && weekendOccupancy < 0.60) {
      factors.push('Low weekend occupancy suggests price sensitivity in weekend market');
    }

    if (imbalanceType === 'weekday_leakage') {
      factors.push('Strong weekday performance indicates business travel or local demand base');
    }

    return factors.length > 0 ? factors : ['Weekend-weekday demand patterns require pricing optimization'];
  }

  private analyzePricing(
    weekendPremiumRatio: number,
    weekendOccupancy: number,
    weekdayOccupancy: number,
    weekendADR: number,
    weekdayADR: number
  ) {
    const weekendPremium = weekendPremiumRatio < 1.2 ? 'Low premium suggests underpricing opportunity' :
                          weekendPremiumRatio > 2.0 ? 'High premium may be limiting weekend demand' :
                          'Premium ratio within typical range';

    const occupancyPattern = weekendOccupancy > weekdayOccupancy ? 
                            `Weekend-focused demand: ${((weekendOccupancy - weekdayOccupancy) * 100).toFixed(1)}% higher weekend occupancy` :
                            `Weekday-focused demand: ${((weekdayOccupancy - weekendOccupancy) * 100).toFixed(1)}% higher weekday occupancy`;

    const revenuePerOccupancyWeekend = weekendOccupancy > 0 ? weekendADR / weekendOccupancy : 0;
    const revenuePerOccupancyWeekday = weekdayOccupancy > 0 ? weekdayADR / weekdayOccupancy : 0;
    
    const revenueEfficiency = revenuePerOccupancyWeekend > revenuePerOccupancyWeekday ?
                             'Weekend periods show higher revenue efficiency per occupancy point' :
                             'Weekday periods show higher revenue efficiency per occupancy point';

    return {
      weekendPremium,
      occupancyPattern,
      revenueEfficiency
    };
  }

  private generateRecommendations(
    imbalanceType: string,
    weekendPremiumRatio: number,
    weekendOccupancy: number,
    weekdayOccupancy: number
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];

    switch (imbalanceType) {
      case 'underpriced_weekends':
        const increasePercent = Math.min(25, (1.4 - weekendPremiumRatio) * 100);
        immediate.push(`Test weekend rate increase of ${increasePercent.toFixed(0)}%`);
        immediate.push('Monitor booking pace and cancellation rates during rate test');
        strategic.push('Implement dynamic weekend pricing based on demand forecasts');
        strategic.push('Consider premium weekend packages to justify higher rates');
        break;

      case 'overpriced_weekends':
        const decreasePercent = Math.min(20, (weekendPremiumRatio - 1.6) * 100);
        immediate.push(`Consider weekend rate reduction of ${decreasePercent.toFixed(0)}%`);
        immediate.push('Introduce weekend value packages or promotions');
        strategic.push('Develop weekend-specific amenities to justify premium');
        strategic.push('Target leisure market segments with weekend packages');
        break;

      case 'weekday_leakage':
        immediate.push('Launch weekend promotion campaign');
        immediate.push('Review weekend marketing and distribution channels');
        strategic.push('Develop weekend leisure packages and experiences');
        strategic.push('Partner with local attractions for weekend packages');
        break;

      default:
        immediate.push('Analyze booking patterns by day of week');
        strategic.push('Implement day-of-week pricing strategy');
        break;
    }

    return { immediate, strategic };
  }
}
