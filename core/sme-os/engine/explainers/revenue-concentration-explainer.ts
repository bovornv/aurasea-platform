import { AlertContract } from '../../contracts/alerts';

interface RevenueConcentrationExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  concentrationAnalysis: {
    weekendShare: string;
    topDayConcentration: string;
    riskLevel: string;
  };
  recommendations: {
    immediate: string[];
    strategic: string[];
  };
}

interface AlertWithMetrics extends AlertContract {
  metrics?: {
    weekendShare: number;
    top5Share: number;
    totalRevenue: number;
    variance: number;
  };
}

export class RevenueConcentrationExplainer {
  explain(alert: AlertContract | null, revenueData?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): RevenueConcentrationExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No revenue concentration risk detected or insufficient data',
        contributingFactors: [],
        concentrationAnalysis: {
          weekendShare: 'No weekend revenue analysis available',
          topDayConcentration: 'No top-day concentration analysis available',
          riskLevel: 'No risk assessment available'
        },
        recommendations: {
          immediate: [],
          strategic: []
        }
      };
    }

    const alertWithMetrics = alert as AlertWithMetrics;
    
    // Extract metrics from alert conditions or calculate from data
    let weekendShare = 0;
    let top5Share = 0;
    let totalRevenue = 0;
    let variance = 0;

    if (alertWithMetrics.metrics) {
      weekendShare = alertWithMetrics.metrics.weekendShare;
      top5Share = alertWithMetrics.metrics.top5Share;
      totalRevenue = alertWithMetrics.metrics.totalRevenue;
      variance = alertWithMetrics.metrics.variance;
    } else if (revenueData && revenueData.length > 0) {
      totalRevenue = revenueData.reduce((sum, d) => sum + d.dailyRevenue, 0);
      
      const weekendRevenue = revenueData
        .filter(d => {
          const dayOfWeek = d.timestamp.getDay();
          return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
        })
        .reduce((sum, d) => sum + d.dailyRevenue, 0);
      
      weekendShare = (weekendRevenue / totalRevenue) * 100;
      
      const sortedRevenues = revenueData.map(d => d.dailyRevenue).sort((a, b) => b - a);
      const top5Revenue = sortedRevenues.slice(0, 5).reduce((sum, rev) => sum + rev, 0);
      top5Share = (top5Revenue / totalRevenue) * 100;
      
      const avgRevenue = totalRevenue / revenueData.length;
      variance = this.calculateVariance(revenueData.map(d => d.dailyRevenue), avgRevenue);
    } else {
      // Extract from alert conditions
      weekendShare = this.extractMetricFromConditions(alert, 'Weekend revenue share');
      top5Share = this.extractMetricFromConditions(alert, 'Top-5 day concentration');
    }

    // Determine concentration type from alert
    const concentrationType = this.detectConcentrationTypeFromAlert(alert);

    // Generate primary factor explanation
    const primaryFactor = this.generatePrimaryFactor(
      concentrationType,
      weekendShare,
      top5Share,
      alert.severity
    );

    // Generate contributing factors
    const contributingFactors = this.generateContributingFactors(
      concentrationType,
      weekendShare,
      top5Share,
      variance
    );

    // Generate concentration analysis
    const concentrationAnalysis = this.analyzeConcentration(
      weekendShare,
      top5Share,
      alert.severity
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      concentrationType,
      weekendShare,
      top5Share,
      alert.severity
    );

    return {
      primaryFactor,
      contributingFactors,
      concentrationAnalysis,
      recommendations
    };
  }

  private extractMetricFromConditions(alert: AlertContract, metricName: string): number {
    const condition = alert.conditions.find(c => c.startsWith(metricName));
    if (condition) {
      const match = condition.match(/(\d+\.?\d*)%/);
      return match ? parseFloat(match[1]) : 0;
    }
    return 0;
  }

  private calculateVariance(revenues: number[], mean: number): number {
    const squaredDiffs = revenues.map(rev => Math.pow(rev - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / revenues.length;
    return Math.sqrt(variance);
  }

  private detectConcentrationTypeFromAlert(alert: AlertContract): string {
    const message = alert.message.toLowerCase();
    
    if (message.includes('weekend revenue concentration')) {
      return 'weekend_concentration';
    } else if (message.includes('top-day revenue concentration') || message.includes('top 5 days')) {
      return 'top_day_concentration';
    } else if (message.includes('dual concentration')) {
      return 'both';
    }
    
    return 'general_concentration';
  }

  private generatePrimaryFactor(
    concentrationType: string,
    weekendShare: number,
    top5Share: number,
    severity: string
  ): string {
    switch (concentrationType) {
      case 'weekend_concentration':
        return `Weekend revenue concentration risk: ${weekendShare.toFixed(1)}% of total revenue concentrated in weekends creates vulnerability to demand fluctuations`;
      
      case 'top_day_concentration':
        return `Top-day revenue concentration risk: ${top5Share.toFixed(1)}% of total revenue concentrated in top 5 days indicates uneven demand distribution`;
      
      case 'both':
        return `Dual concentration risk: ${weekendShare.toFixed(1)}% weekend concentration and ${top5Share.toFixed(1)}% top-day concentration create compounded vulnerability`;
      
      default:
        return `Revenue concentration detected: uneven distribution across time periods creates business risk`;
    }
  }

  private generateContributingFactors(
    concentrationType: string,
    weekendShare: number,
    top5Share: number,
    variance: number
  ): string[] {
    const factors: string[] = [];

    // Weekend concentration analysis
    if (weekendShare >= 75) {
      factors.push(`Extreme weekend dependency: ${weekendShare.toFixed(1)}% concentration creates severe vulnerability`);
    } else if (weekendShare >= 65) {
      factors.push(`High weekend dependency: ${weekendShare.toFixed(1)}% concentration indicates significant risk`);
    } else if (weekendShare >= 55) {
      factors.push(`Moderate weekend concentration: ${weekendShare.toFixed(1)}% indicates emerging risk pattern`);
    }

    // Top-day concentration analysis
    if (top5Share >= 65) {
      factors.push(`Extreme top-day concentration: ${top5Share.toFixed(1)}% in top 5 days creates severe risk`);
    } else if (top5Share >= 55) {
      factors.push(`High top-day concentration: ${top5Share.toFixed(1)}% in top 5 days indicates significant risk`);
    } else if (top5Share >= 45) {
      factors.push(`Moderate top-day concentration: ${top5Share.toFixed(1)}% in top 5 days indicates emerging risk`);
    }

    // Revenue volatility analysis
    if (variance > 0) {
      factors.push('High revenue volatility indicates uneven demand distribution patterns');
    }

    // Pattern-specific factors
    if (concentrationType === 'both') {
      factors.push('Combined weekend and top-day concentration amplifies business vulnerability');
    }

    return factors.length > 0 ? factors : ['Revenue concentration patterns require diversification strategy'];
  }

  private analyzeConcentration(
    weekendShare: number,
    top5Share: number,
    severity: string
  ) {
    const weekendShareAnalysis = weekendShare >= 75 ? `Critical weekend dependency at ${weekendShare.toFixed(1)}%` :
                                weekendShare >= 65 ? `High weekend concentration at ${weekendShare.toFixed(1)}%` :
                                weekendShare >= 55 ? `Moderate weekend concentration at ${weekendShare.toFixed(1)}%` :
                                `Balanced weekend distribution at ${weekendShare.toFixed(1)}%`;

    const topDayConcentration = top5Share >= 65 ? `Critical top-day concentration at ${top5Share.toFixed(1)}%` :
                               top5Share >= 55 ? `High top-day concentration at ${top5Share.toFixed(1)}%` :
                               top5Share >= 45 ? `Moderate top-day concentration at ${top5Share.toFixed(1)}%` :
                               `Balanced daily distribution at ${top5Share.toFixed(1)}%`;

    const riskLevel = severity === 'critical' ? 'Critical risk requiring immediate diversification action' :
                     severity === 'warning' ? 'Warning level risk requiring near-term planning' :
                     'Informational level requiring monitoring and strategic planning';

    return {
      weekendShare: weekendShareAnalysis,
      topDayConcentration,
      riskLevel
    };
  }

  private generateRecommendations(
    concentrationType: string,
    weekendShare: number,
    top5Share: number,
    severity: string
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];

    if (concentrationType === 'weekend_concentration' || concentrationType === 'both') {
      if (severity === 'critical') {
        immediate.push('Launch immediate weekday promotion campaigns');
        immediate.push('Implement aggressive weekday pricing strategies');
        immediate.push('Develop emergency weekday revenue streams');
      } else if (severity === 'warning') {
        immediate.push('Increase weekday marketing efforts');
        immediate.push('Review weekday pricing competitiveness');
        immediate.push('Explore corporate partnership opportunities');
      } else {
        immediate.push('Consider weekday promotional packages');
        immediate.push('Analyze weekday market opportunities');
      }

      strategic.push('Develop comprehensive weekday revenue strategy');
      strategic.push('Invest in business travel market development');
      strategic.push('Create weekday-specific value propositions');
    }

    if (concentrationType === 'top_day_concentration' || concentrationType === 'both') {
      if (severity === 'critical') {
        immediate.push('Implement dynamic pricing to spread demand');
        immediate.push('Create incentives for off-peak day bookings');
        immediate.push('Review capacity allocation strategies');
      } else if (severity === 'warning') {
        immediate.push('Develop demand smoothing strategies');
        immediate.push('Consider off-peak promotional pricing');
        immediate.push('Analyze peak day demand drivers');
      } else {
        immediate.push('Monitor daily revenue distribution patterns');
        immediate.push('Consider demand leveling initiatives');
      }

      strategic.push('Implement revenue management best practices');
      strategic.push('Develop demand forecasting and optimization');
      strategic.push('Create balanced demand distribution strategy');
    }

    if (concentrationType === 'general_concentration') {
      immediate.push('Analyze revenue distribution patterns');
      immediate.push('Identify concentration risk factors');
      strategic.push('Develop revenue diversification strategy');
      strategic.push('Implement risk mitigation planning');
    }

    return { immediate, strategic };
  }
}
