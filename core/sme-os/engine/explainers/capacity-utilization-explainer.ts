import { AlertContract } from '../../contracts/alerts';

interface CapacityUtilizationExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  utilizationAnalysis: {
    averageOccupancy: string;
    peakDayPattern: string;
    consistencyPattern: string;
  };
  recommendations: {
    immediate: string[];
    strategic: string[];
  };
}

interface AlertWithMetrics extends AlertContract {
  metrics?: {
    avgOccupancy: number;
    peakDays: number;
    lowDays: number;
    variance: number;
  };
}

export class CapacityUtilizationExplainer {
  explain(alert: AlertContract | null, occupancyData?: Array<{
    timestamp: Date;
    occupancyRate: number;
  }>): CapacityUtilizationExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No capacity utilization issues detected or insufficient data',
        contributingFactors: [],
        utilizationAnalysis: {
          averageOccupancy: 'No occupancy data available',
          peakDayPattern: 'No peak day analysis available',
          consistencyPattern: 'No consistency analysis available'
        },
        recommendations: {
          immediate: [],
          strategic: []
        }
      };
    }

    const alertWithMetrics = alert as AlertWithMetrics;
    
    // Extract metrics from alert conditions or calculate from data
    let avgOccupancy = 0;
    let peakDays = 0;
    let lowDays = 0;
    let variance = 0;

    if (alertWithMetrics.metrics) {
      avgOccupancy = alertWithMetrics.metrics.avgOccupancy;
      peakDays = alertWithMetrics.metrics.peakDays;
      lowDays = alertWithMetrics.metrics.lowDays;
      variance = alertWithMetrics.metrics.variance;
    } else if (occupancyData && occupancyData.length > 0) {
      const occupancyRates = occupancyData.map(d => d.occupancyRate);
      avgOccupancy = occupancyRates.reduce((sum, rate) => sum + rate, 0) / occupancyRates.length;
      peakDays = occupancyRates.filter(rate => rate >= 0.95).length;
      lowDays = occupancyRates.filter(rate => rate < 0.40).length;
      variance = this.calculateVariance(occupancyRates, avgOccupancy);
    } else {
      // Extract from alert conditions
      avgOccupancy = this.extractOccupancyFromConditions(alert);
      peakDays = this.extractPeakDaysFromConditions(alert);
      lowDays = this.extractLowDaysFromConditions(alert);
    }

    // Determine utilization type from alert
    const utilizationType = this.detectUtilizationTypeFromAlert(alert);

    // Generate primary factor explanation
    const primaryFactor = this.generatePrimaryFactor(
      utilizationType,
      avgOccupancy,
      peakDays,
      lowDays,
      alert.severity
    );

    // Generate contributing factors
    const contributingFactors = this.generateContributingFactors(
      utilizationType,
      avgOccupancy,
      peakDays,
      lowDays,
      variance
    );

    // Generate utilization analysis
    const utilizationAnalysis = this.analyzeUtilization(
      avgOccupancy,
      peakDays,
      lowDays,
      variance
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      utilizationType,
      avgOccupancy,
      peakDays,
      alert.severity
    );

    return {
      primaryFactor,
      contributingFactors,
      utilizationAnalysis,
      recommendations
    };
  }

  private extractOccupancyFromConditions(alert: AlertContract): number {
    const occupancyCondition = alert.conditions.find(c => c.startsWith('Average occupancy:'));
    if (occupancyCondition) {
      const match = occupancyCondition.match(/(\d+\.?\d*)%/);
      return match ? parseFloat(match[1]) / 100 : 0;
    }
    return 0;
  }

  private extractPeakDaysFromConditions(alert: AlertContract): number {
    const peakCondition = alert.conditions.find(c => c.startsWith('Peak days'));
    if (peakCondition) {
      const match = peakCondition.match(/(\d+) days/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  }

  private extractLowDaysFromConditions(alert: AlertContract): number {
    const lowCondition = alert.conditions.find(c => c.startsWith('Low days'));
    if (lowCondition) {
      const match = lowCondition.match(/(\d+) days/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  }

  private calculateVariance(occupancyRates: number[], mean: number): number {
    const squaredDiffs = occupancyRates.map(rate => Math.pow(rate - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / occupancyRates.length;
    return Math.sqrt(variance);
  }

  private detectUtilizationTypeFromAlert(alert: AlertContract): string {
    const message = alert.message.toLowerCase();
    
    if (message.includes('underutilization') || message.includes('low capacity') || alert.type === 'opportunity') {
      return 'underutilized';
    } else if (message.includes('capacity strain') || message.includes('high capacity') || message.includes('high average occupancy')) {
      return 'overutilized';
    }
    
    return 'general';
  }

  private generatePrimaryFactor(
    utilizationType: string,
    avgOccupancy: number,
    peakDays: number,
    lowDays: number,
    severity: string
  ): string {
    const occupancyPercent = (avgOccupancy * 100).toFixed(1);

    if (utilizationType === 'overutilized') {
      if (peakDays >= 7) {
        return `Critical capacity strain: ${peakDays} days at peak capacity (≥95%) with ${occupancyPercent}% average occupancy indicates severe overutilization`;
      } else if (peakDays >= 3) {
        return `High capacity pressure: ${peakDays} peak days and ${occupancyPercent}% average occupancy may impact service quality`;
      } else {
        return `Elevated occupancy levels: ${occupancyPercent}% average occupancy approaching capacity constraints`;
      }
    }

    if (utilizationType === 'underutilized') {
      if (lowDays >= 10) {
        return `Severe underutilization: ${lowDays} days below 40% occupancy with ${occupancyPercent}% average indicates significant revenue opportunity`;
      } else if (avgOccupancy < 0.40) {
        return `Critical underutilization: ${occupancyPercent}% average occupancy represents substantial untapped capacity`;
      } else {
        return `Moderate underutilization: ${occupancyPercent}% average occupancy suggests room for growth`;
      }
    }

    return `Capacity utilization at ${occupancyPercent}% average occupancy requires attention`;
  }

  private generateContributingFactors(
    utilizationType: string,
    avgOccupancy: number,
    peakDays: number,
    lowDays: number,
    variance: number
  ): string[] {
    const factors: string[] = [];

    if (utilizationType === 'overutilized') {
      if (avgOccupancy > 0.85) {
        factors.push(`Consistently high occupancy: ${(avgOccupancy * 100).toFixed(1)}% average indicates sustained demand pressure`);
      }

      if (peakDays >= 3) {
        factors.push(`Frequent peak capacity days: ${peakDays} days at ≥95% occupancy may strain operations`);
      }

      if (variance < 0.10) {
        factors.push('Consistent high-occupancy pattern indicates structural capacity constraints');
      }

      if (peakDays >= 5 && avgOccupancy > 0.85) {
        factors.push('Combined high average and frequent peaks suggest immediate capacity management needed');
      }
    }

    if (utilizationType === 'underutilized') {
      if (avgOccupancy < 0.50) {
        factors.push(`Low average occupancy: ${(avgOccupancy * 100).toFixed(1)}% indicates significant revenue opportunity`);
      }

      if (lowDays >= 7) {
        factors.push(`Frequent low-occupancy days: ${lowDays} days below 40% suggests demand generation challenges`);
      }

      if (variance < 0.15) {
        factors.push('Consistently low occupancy pattern indicates systematic underperformance');
      }

      if (lowDays >= 10 && avgOccupancy < 0.45) {
        factors.push('Combined low average and frequent low days suggest urgent revenue optimization needed');
      }
    }

    // General variance analysis
    if (variance > 0.30) {
      factors.push('High occupancy variance indicates inconsistent demand patterns requiring analysis');
    }

    return factors.length > 0 ? factors : ['Capacity utilization patterns require monitoring'];
  }

  private analyzeUtilization(
    avgOccupancy: number,
    peakDays: number,
    lowDays: number,
    variance: number
  ) {
    const occupancyPercent = (avgOccupancy * 100).toFixed(1);

    const averageOccupancy = avgOccupancy > 0.85 ? `High utilization at ${occupancyPercent}% suggests strong demand` :
                            avgOccupancy > 0.70 ? `Moderate utilization at ${occupancyPercent}% indicates healthy demand` :
                            avgOccupancy > 0.50 ? `Below-optimal utilization at ${occupancyPercent}% suggests growth opportunity` :
                            `Low utilization at ${occupancyPercent}% indicates significant underperformance`;

    const peakDayPattern = peakDays >= 7 ? `Frequent peak days (${peakDays}) indicate capacity constraints` :
                          peakDays >= 3 ? `Moderate peak days (${peakDays}) suggest periodic capacity pressure` :
                          peakDays > 0 ? `Occasional peak days (${peakDays}) indicate good demand periods` :
                          'No peak capacity days observed in period';

    const consistencyPattern = variance < 0.10 ? 'Very consistent occupancy pattern indicates stable demand' :
                              variance < 0.20 ? 'Moderately consistent occupancy with some variation' :
                              variance < 0.30 ? 'Variable occupancy pattern suggests seasonal or cyclical demand' :
                              'Highly variable occupancy indicates unpredictable demand patterns';

    return {
      averageOccupancy,
      peakDayPattern,
      consistencyPattern
    };
  }

  private generateRecommendations(
    utilizationType: string,
    avgOccupancy: number,
    peakDays: number,
    severity: string
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];

    if (utilizationType === 'overutilized') {
      if (severity === 'critical') {
        immediate.push('Implement immediate demand management: increase rates for peak periods');
        immediate.push('Restrict availability during high-demand periods');
        immediate.push('Monitor service quality metrics closely');
      } else if (severity === 'warning') {
        immediate.push('Consider rate increases for high-demand periods');
        immediate.push('Optimize capacity allocation and operations');
        immediate.push('Review service delivery standards');
      } else {
        immediate.push('Monitor occupancy trends and service quality');
        immediate.push('Consider premium positioning opportunities');
      }

      strategic.push('Develop dynamic pricing strategy based on demand patterns');
      strategic.push('Invest in capacity expansion or service optimization');
      strategic.push('Implement revenue management best practices');
    }

    if (utilizationType === 'underutilized') {
      if (severity === 'critical') {
        immediate.push('Launch aggressive marketing campaigns');
        immediate.push('Implement promotional pricing strategies');
        immediate.push('Review and optimize distribution channels');
      } else if (severity === 'warning') {
        immediate.push('Increase marketing efforts and promotional activities');
        immediate.push('Review pricing strategy for competitiveness');
        immediate.push('Analyze competitor positioning');
      } else {
        immediate.push('Consider targeted promotional packages');
        immediate.push('Explore new market segments');
      }

      strategic.push('Develop comprehensive revenue optimization strategy');
      strategic.push('Invest in marketing and brand positioning');
      strategic.push('Consider market expansion or service diversification');
    }

    return { immediate, strategic };
  }
}
