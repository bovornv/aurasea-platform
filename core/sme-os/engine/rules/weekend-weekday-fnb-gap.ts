import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';

export class WeekendWeekdayFnbGapRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 14) {
      return null;
    }

    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Filter to last 14 days
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= cutoffDate
    );

    if (recentSignals.length < 14) {
      return null;
    }

    // Separate weekend (Sat=6, Sun=0) and weekday (Mon=1 to Fri=5) revenue
    const weekendRevenues: number[] = [];
    const weekdayRevenues: number[] = [];

    recentSignals.forEach(signal => {
      const dayOfWeek = signal.timestamp.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
        weekendRevenues.push(signal.dailyRevenue);
      } else { // Monday to Friday
        weekdayRevenues.push(signal.dailyRevenue);
      }
    });

    // Calculate averages
    const avgWeekendRevenue = weekendRevenues.length > 0 
      ? weekendRevenues.reduce((sum, rev) => sum + rev, 0) / weekendRevenues.length 
      : 0;
    const avgWeekdayRevenue = weekdayRevenues.length > 0 
      ? weekdayRevenues.reduce((sum, rev) => sum + rev, 0) / weekdayRevenues.length 
      : 0;

    // Return null if weekday revenue is zero (avoid division by zero)
    if (avgWeekdayRevenue === 0) {
      return null;
    }

    // Calculate weekend/weekday ratio
    const weekendWeekdayRatio = avgWeekendRevenue / avgWeekdayRevenue;

    // Determine severity based on thresholds
    let severity: AlertSeverity;
    if (weekendWeekdayRatio >= 2.8) {
      severity = 'critical';
    } else if (weekendWeekdayRatio >= 2.0) {
      severity = 'warning';
    } else if (weekendWeekdayRatio >= 1.5) {
      severity = 'informational';
    } else {
      return null; // Below threshold, no alert needed
    }

    const confidence = this.calculateConfidence(recentSignals.length);
    const { message, recommendations } = this.generateMessageAndRecommendations(
      weekendWeekdayRatio,
      avgWeekendRevenue,
      avgWeekdayRevenue,
      severity
    );

    const contributingFactors = this.generateContributingFactors(
      weekendWeekdayRatio,
      avgWeekendRevenue,
      avgWeekdayRevenue,
      weekendRevenues.length,
      weekdayRevenues.length
    );

    return {
      id: `weekend-weekday-fnb-gap-${Date.now()}`,
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
        `Weekend/Weekday Revenue Ratio: ${weekendWeekdayRatio.toFixed(2)}x`,
        `Average Weekend Revenue: $${avgWeekendRevenue.toFixed(2)}`,
        `Average Weekday Revenue: $${avgWeekdayRevenue.toFixed(2)}`,
        `Weekend Days Analyzed: ${weekendRevenues.length}`,
        `Weekday Days Analyzed: ${weekdayRevenues.length}`
      ],
      contributingFactors,
      recommendations
    };
  }

  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.70; // Base confidence for F&B analysis

    // Bonus for more data points (beyond minimum 14)
    const extraDays = dataPoints - 14;
    confidence += extraDays * 0.01; // +0.01 per extra day

    return Math.min(0.95, Math.max(0.70, confidence));
  }

  private generateMessageAndRecommendations(
    ratio: number,
    avgWeekendRevenue: number,
    avgWeekdayRevenue: number,
    severity: AlertSeverity
  ): { message: string; recommendations: string[] } {
    const ratioText = `${ratio.toFixed(1)}x`;
    const weekendAmount = `$${avgWeekendRevenue.toFixed(0)}`;
    const weekdayAmount = `$${avgWeekdayRevenue.toFixed(0)}`;

    let message: string;
    let recommendations: string[];

    if (severity === 'critical') {
      message = `Extreme weekend revenue advantage detected in F&B operations. Weekend daily revenue (${weekendAmount}) is ${ratioText} higher than weekday revenue (${weekdayAmount}), indicating significant untapped weekday potential.`;
      recommendations = [
        'Implement aggressive weekday promotions and marketing campaigns',
        'Consider weekday-specific menu offerings or pricing strategies',
        'Evaluate staffing optimization to reduce weekday operational costs',
        'Explore corporate lunch programs or weekday catering opportunities',
        'Analyze competitor weekday strategies and market positioning'
      ];
    } else if (severity === 'warning') {
      message = `Significant weekend revenue advantage in F&B operations. Weekend daily revenue (${weekendAmount}) is ${ratioText} higher than weekday revenue (${weekdayAmount}), suggesting weekday growth opportunities.`;
      recommendations = [
        'Develop targeted weekday customer acquisition strategies',
        'Consider weekday lunch specials or happy hour promotions',
        'Review weekday operating hours and service offerings',
        'Explore partnerships with local businesses for weekday traffic',
        'Analyze weekday customer demographics and preferences'
      ];
    } else {
      message = `Moderate weekend revenue advantage in F&B operations. Weekend daily revenue (${weekendAmount}) is ${ratioText} higher than weekday revenue (${weekdayAmount}), indicating potential for weekday optimization.`;
      recommendations = [
        'Monitor weekday performance trends and customer patterns',
        'Consider modest weekday promotions or loyalty programs',
        'Review weekday menu offerings and pricing structure',
        'Evaluate weekday marketing and social media presence',
        'Track competitor weekday activities and market response'
      ];
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    ratio: number,
    avgWeekendRevenue: number,
    avgWeekdayRevenue: number,
    weekendDays: number,
    weekdayDays: number
  ): Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> {
    const factors = [];

    // Weekend performance factor
    if (avgWeekendRevenue > 0) {
      factors.push({
        factor: `Strong weekend performance with average daily revenue of $${avgWeekendRevenue.toFixed(2)}`,
        impact: 'high' as const,
        direction: 'positive' as const
      });
    }

    // Weekday underperformance factor
    if (ratio >= 2.0) {
      factors.push({
        factor: `Significant weekday underperformance with average daily revenue of $${avgWeekdayRevenue.toFixed(2)}`,
        impact: 'high' as const,
        direction: 'negative' as const
      });
    } else {
      factors.push({
        factor: `Moderate weekday underperformance with average daily revenue of $${avgWeekdayRevenue.toFixed(2)}`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    // Data coverage factor
    const totalDays = weekendDays + weekdayDays;
    if (totalDays >= 14) {
      factors.push({
        factor: `Sufficient data coverage with ${totalDays} days analyzed (${weekendDays} weekend, ${weekdayDays} weekday)`,
        impact: 'medium' as const,
        direction: 'positive' as const
      });
    }

    // Revenue gap magnitude
    const revenueGap = avgWeekendRevenue - avgWeekdayRevenue;
    if (revenueGap > 0) {
      factors.push({
        factor: `Daily revenue gap of $${revenueGap.toFixed(2)} between weekend and weekday performance`,
        impact: ratio >= 2.5 ? 'high' as const : 'medium' as const,
        direction: 'negative' as const
      });
    }

    return factors;
  }
}
