import { AlertContract } from '../../contracts/alerts';

interface LowWeekdayUtilizationExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  utilizationAnalysis: {
    utilizationRate: string;
    revenueGap: string;
    consistencyPattern: string;
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
}

export class LowWeekdayUtilizationExplainer {
  explain(alert: AlertContract | null, weekdayData?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): LowWeekdayUtilizationExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No weekday utilization issues detected or insufficient data',
        contributingFactors: [],
        utilizationAnalysis: {
          utilizationRate: 'Insufficient data to calculate utilization rate',
          revenueGap: 'Cannot determine revenue gap without adequate data',
          consistencyPattern: 'Unable to assess consistency patterns'
        },
        recommendations: {
          immediate: ['Ensure adequate weekday revenue data collection'],
          shortTerm: ['Implement comprehensive weekday performance tracking'],
          longTerm: ['Establish baseline weekday performance metrics']
        }
      };
    }

    const weekdayRevenues = this.extractWeekdayRevenues(weekdayData);
    const utilizationMetrics = this.calculateUtilizationMetrics(weekdayRevenues);
    
    return {
      primaryFactor: this.determinePrimaryFactor(alert, utilizationMetrics),
      contributingFactors: this.identifyContributingFactors(alert, utilizationMetrics),
      utilizationAnalysis: this.analyzeUtilization(utilizationMetrics),
      recommendations: this.generateRecommendations(alert.severity, utilizationMetrics)
    };
  }

  private extractWeekdayRevenues(weekdayData?: Array<{ timestamp: Date; dailyRevenue: number }>): number[] {
    if (!weekdayData) return [];
    
    return weekdayData
      .filter(data => {
        const dayOfWeek = data.timestamp.getDay();
        return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
      })
      .map(data => data.dailyRevenue);
  }

  private calculateUtilizationMetrics(revenues: number[]) {
    if (revenues.length === 0) {
      return {
        average: 0,
        peak: 0,
        utilization: 0,
        variability: 0,
        gap: 0
      };
    }

    const average = revenues.reduce((sum, rev) => sum + rev, 0) / revenues.length;
    const peak = Math.max(...revenues);
    const utilization = peak > 0 ? (average / peak) * 100 : 0;
    const gap = peak - average;
    
    // Calculate coefficient of variation
    const variance = revenues.reduce((sum, rev) => sum + Math.pow(rev - average, 2), 0) / revenues.length;
    const standardDeviation = Math.sqrt(variance);
    const variability = average > 0 ? standardDeviation / average : 0;

    return { average, peak, utilization, variability, gap };
  }

  private determinePrimaryFactor(alert: AlertContract, metrics: any): string {
    const utilizationText = `${metrics.utilization.toFixed(1)}%`;
    const gapAmount = `$${metrics.gap.toFixed(0)}`;

    if (alert.severity === 'critical') {
      return `Critical weekday underutilization with only ${utilizationText} capacity usage, creating a ${gapAmount} daily revenue opportunity gap`;
    } else if (alert.severity === 'warning') {
      return `Significant weekday underutilization at ${utilizationText} capacity, indicating ${gapAmount} daily revenue potential`;
    } else {
      return `Moderate weekday underutilization at ${utilizationText} capacity suggests ${gapAmount} daily improvement opportunity`;
    }
  }

  private identifyContributingFactors(alert: AlertContract, metrics: any): string[] {
    const factors = [];
    
    // Utilization level factor
    if (metrics.utilization < 30) {
      factors.push('Extremely low utilization indicates fundamental weekday demand challenges');
    } else if (metrics.utilization < 50) {
      factors.push('Low utilization suggests significant weekday market opportunity');
    } else {
      factors.push('Moderate utilization indicates room for weekday optimization');
    }

    // Revenue gap factor
    if (metrics.gap > metrics.average) {
      factors.push('Large revenue gap between peak and average performance shows substantial upside potential');
    } else if (metrics.gap > metrics.average * 0.5) {
      factors.push('Notable revenue gap indicates meaningful improvement opportunities');
    }

    // Consistency factor
    if (metrics.variability > 0.4) {
      factors.push('High revenue variability suggests inconsistent weekday operations or demand patterns');
    } else if (metrics.variability < 0.2) {
      factors.push('Consistent performance patterns provide stable foundation for improvement initiatives');
    } else {
      factors.push('Moderate revenue variability indicates some operational or demand inconsistencies');
    }

    // Peak performance factor
    if (metrics.peak > 0) {
      factors.push(`Peak weekday performance of $${metrics.peak.toFixed(0)} demonstrates achievable revenue potential`);
    }

    return factors;
  }

  private analyzeUtilization(metrics: any) {
    const utilizationRate = metrics.utilization > 0 
      ? `${metrics.utilization.toFixed(1)}% utilization rate indicates ${this.getUtilizationLevel(metrics.utilization)} weekday performance`
      : 'Unable to calculate utilization rate due to zero peak revenue';

    const revenueGap = metrics.gap > 0
      ? `$${metrics.gap.toFixed(0)} daily revenue gap between peak ($${metrics.peak.toFixed(0)}) and average ($${metrics.average.toFixed(0)}) weekday performance`
      : 'No significant revenue gap detected';

    const consistencyPattern = this.getConsistencyPattern(metrics.variability);

    return { utilizationRate, revenueGap, consistencyPattern };
  }

  private getUtilizationLevel(utilization: number): string {
    if (utilization >= 70) return 'good';
    if (utilization >= 50) return 'moderate';
    if (utilization >= 30) return 'low';
    return 'very low';
  }

  private getConsistencyPattern(variability: number): string {
    if (variability > 0.4) {
      return 'High variability indicates inconsistent weekday performance with significant day-to-day fluctuations';
    } else if (variability > 0.2) {
      return 'Moderate variability shows some inconsistency in weekday performance patterns';
    } else {
      return 'Low variability indicates consistent weekday performance patterns';
    }
  }

  private generateRecommendations(severity: string, metrics: any) {
    const immediate = [];
    const shortTerm = [];
    const longTerm = [];

    if (severity === 'critical') {
      immediate.push(
        'Launch emergency weekday customer acquisition campaign',
        'Implement immediate weekday promotions and discounts',
        'Activate all available marketing channels for weekday traffic'
      );
      shortTerm.push(
        'Develop comprehensive weekday menu and pricing strategy',
        'Establish corporate partnerships for weekday lunch programs',
        'Create weekday-specific events and entertainment offerings'
      );
      longTerm.push(
        'Build sustainable weekday customer base through loyalty programs',
        'Optimize weekday operations for improved efficiency and profitability',
        'Develop weekday brand positioning and market presence'
      );
    } else if (severity === 'warning') {
      immediate.push(
        'Implement targeted weekday marketing campaigns',
        'Launch weekday lunch specials and happy hour promotions',
        'Increase weekday social media and digital marketing efforts'
      );
      shortTerm.push(
        'Develop partnerships with local businesses for weekday traffic',
        'Create weekday customer loyalty and retention programs',
        'Optimize weekday menu offerings and pricing structure'
      );
      longTerm.push(
        'Build consistent weekday customer base and habits',
        'Establish weekday operational excellence and efficiency',
        'Develop sustainable weekday revenue growth strategies'
      );
    } else {
      immediate.push(
        'Monitor weekday performance trends closely',
        'Test modest weekday promotions and menu adjustments',
        'Gather customer feedback on weekday preferences'
      );
      shortTerm.push(
        'Analyze successful peak day strategies for weekday application',
        'Explore weekday market opportunities and customer segments',
        'Review and optimize weekday operational procedures'
      );
      longTerm.push(
        'Maintain consistent weekday performance improvement',
        'Build sustainable weekday growth and customer engagement',
        'Establish weekday performance benchmarks and targets'
      );
    }

    return { immediate, shortTerm, longTerm };
  }
}
