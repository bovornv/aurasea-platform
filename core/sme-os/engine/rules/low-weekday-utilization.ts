import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';

export class LowWeekdayUtilizationRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 14) {
      return null;
    }

    // Filter to weekdays only (Monday = 1 to Friday = 5)
    const weekdaySignals = operationalSignals.filter(signal => {
      const dayOfWeek = signal.timestamp.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    });

    // Need at least 14 weekday days
    if (weekdaySignals.length < 14) {
      return null;
    }

    // Sort by timestamp and take the most recent 14 weekdays
    const sortedWeekdays = [...weekdaySignals].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    ).slice(0, 14);

    // Calculate utilization metrics
    const weekdayRevenues = sortedWeekdays.map(signal => signal.dailyRevenue);
    const avgWeekdayRevenue = weekdayRevenues.reduce((sum, rev) => sum + rev, 0) / weekdayRevenues.length;
    const peakWeekdayRevenue = Math.max(...weekdayRevenues);

    // Avoid division by zero
    if (peakWeekdayRevenue === 0) {
      return null;
    }

    const utilizationPercentage = (avgWeekdayRevenue / peakWeekdayRevenue) * 100;

    // Determine severity based on utilization thresholds
    let severity: AlertSeverity;
    if (utilizationPercentage >= 70) {
      return null; // No alert for good utilization
    } else if (utilizationPercentage >= 50) {
      severity = 'informational'; // Medium impact
    } else if (utilizationPercentage >= 30) {
      severity = 'warning'; // High impact
    } else {
      severity = 'critical'; // Critical impact
    }

    const today = sortedWeekdays[0].timestamp;
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days lookback for context

    const confidence = this.calculateConfidence(weekdaySignals.length);
    const { message, recommendations } = this.generateMessageAndRecommendations(
      utilizationPercentage,
      avgWeekdayRevenue,
      peakWeekdayRevenue,
      severity
    );

    const contributingFactors = this.generateContributingFactors(
      utilizationPercentage,
      avgWeekdayRevenue,
      peakWeekdayRevenue,
      weekdayRevenues
    );

    return {
      id: `low-weekday-utilization-${Date.now()}`,
      timestamp: today,
      type: 'opportunity' as AlertType,
      severity,
      domain: 'risk' as AlertDomain,
      timeHorizon: 'near-term' as TimeHorizon,
      relevanceWindow: {
        start: cutoffDate,
        end: today
      },
      scope: 'cafe_restaurant',
      category: 'demand',
      confidence,
      message,
      conditions: [
        `Weekday Utilization Rate: ${utilizationPercentage.toFixed(1)}%`,
        `Average Weekday Revenue: $${avgWeekdayRevenue.toFixed(2)}`,
        `Peak Weekday Revenue: $${peakWeekdayRevenue.toFixed(2)}`,
        `Weekdays Analyzed: ${sortedWeekdays.length}`,
        `Analysis Period: Last 14 weekdays`
      ],
      contributingFactors,
      recommendations
    } as AlertContract & { scope: string; category: string; recommendations: string[] };
  }

  private calculateConfidence(weekdayDataPoints: number): number {
    let confidence = 0.65; // Base confidence for weekday utilization analysis

    // Bonus for more weekday data points (beyond minimum 14)
    const extraWeekdays = weekdayDataPoints - 14;
    confidence += extraWeekdays * 0.01; // +0.01 per extra weekday

    return Math.min(0.90, Math.max(0.65, confidence));
  }

  private generateMessageAndRecommendations(
    utilizationPercentage: number,
    avgWeekdayRevenue: number,
    peakWeekdayRevenue: number,
    severity: AlertSeverity
  ): { message: string; recommendations: string[] } {
    const utilizationText = `${utilizationPercentage.toFixed(1)}%`;
    const avgAmount = `$${avgWeekdayRevenue.toFixed(0)}`;
    const peakAmount = `$${peakWeekdayRevenue.toFixed(0)}`;
    const gapAmount = `$${(peakWeekdayRevenue - avgWeekdayRevenue).toFixed(0)}`;

    let message: string;
    let recommendations: string[];

    if (severity === 'critical') {
      message = `Critical weekday underutilization detected in F&B operations. Weekday utilization is only ${utilizationText}, with average daily revenue (${avgAmount}) significantly below peak performance (${peakAmount}). This represents a ${gapAmount} daily revenue gap and substantial growth opportunity.`;
      recommendations = [
        'Immediately implement aggressive weekday customer acquisition campaigns',
        'Launch targeted weekday promotions and special offers',
        'Develop weekday-specific menu items or pricing strategies',
        'Explore corporate partnerships for weekday lunch programs',
        'Consider weekday events or entertainment to drive traffic',
        'Analyze successful peak day strategies for weekday application'
      ];
    } else if (severity === 'warning') {
      message = `Significant weekday underutilization in F&B operations. Weekday utilization is ${utilizationText}, with average daily revenue (${avgAmount}) notably below peak performance (${peakAmount}). This ${gapAmount} daily gap indicates substantial improvement potential.`;
      recommendations = [
        'Develop targeted weekday marketing and promotional strategies',
        'Consider weekday lunch specials or happy hour offerings',
        'Explore partnerships with local businesses for weekday traffic',
        'Review weekday staffing and operational efficiency',
        'Implement customer loyalty programs focused on weekday visits',
        'Analyze peak day success factors for weekday optimization'
      ];
    } else {
      message = `Moderate weekday underutilization observed in F&B operations. Weekday utilization is ${utilizationText}, with average daily revenue (${avgAmount}) below peak performance (${peakAmount}). This ${gapAmount} daily gap suggests room for weekday optimization.`;
      recommendations = [
        'Monitor weekday performance trends and customer patterns',
        'Consider modest weekday promotions or menu adjustments',
        'Review weekday operating hours and service offerings',
        'Gather customer feedback on weekday experience preferences',
        'Explore social media marketing for weekday engagement',
        'Track competitor weekday strategies and market opportunities'
      ];
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    utilizationPercentage: number,
    avgWeekdayRevenue: number,
    peakWeekdayRevenue: number,
    weekdayRevenues: number[]
  ): Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> {
    const factors = [];
    const revenueGap = peakWeekdayRevenue - avgWeekdayRevenue;
    const revenueVariability = this.calculateVariability(weekdayRevenues);

    // Utilization level factor
    if (utilizationPercentage < 40) {
      factors.push({
        factor: `Very low weekday utilization at ${utilizationPercentage.toFixed(1)}% indicates significant underperformance`,
        impact: 'high' as const,
        direction: 'negative' as const
      });
    } else if (utilizationPercentage < 60) {
      factors.push({
        factor: `Low weekday utilization at ${utilizationPercentage.toFixed(1)}% shows room for improvement`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    // Revenue gap factor
    if (revenueGap > 0) {
      factors.push({
        factor: `Daily revenue gap of $${revenueGap.toFixed(2)} between peak and average weekday performance`,
        impact: revenueGap > avgWeekdayRevenue ? 'high' as const : 'medium' as const,
        direction: 'negative' as const
      });
    }

    // Peak performance factor
    factors.push({
      factor: `Peak weekday performance of $${peakWeekdayRevenue.toFixed(2)} demonstrates achievable revenue potential`,
      impact: 'medium' as const,
      direction: 'positive' as const
    });

    // Consistency factor
    if (revenueVariability > 0.3) {
      factors.push({
        factor: `High weekday revenue variability indicates inconsistent performance patterns`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    } else if (revenueVariability < 0.15) {
      factors.push({
        factor: `Consistent weekday performance patterns provide stable baseline for improvement`,
        impact: 'low' as const,
        direction: 'positive' as const
      });
    }

    return factors;
  }

  private calculateVariability(revenues: number[]): number {
    if (revenues.length === 0) return 0;
    
    const mean = revenues.reduce((sum, rev) => sum + rev, 0) / revenues.length;
    const variance = revenues.reduce((sum, rev) => sum + Math.pow(rev - mean, 2), 0) / revenues.length;
    const standardDeviation = Math.sqrt(variance);
    
    return mean > 0 ? standardDeviation / mean : 0; // Coefficient of variation
  }
}
