import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';

/**
 * Weekend–Weekday F&B Gap Alert Rule V2
 * Detects revenue imbalance between weekend and weekday performance in F&B operations
 * 
 * V2 Changes: Supports Thai SME threshold calibration
 * All other logic remains identical to V1 (frozen)
 */
export class WeekendWeekdayFnbGapRuleV2 {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    // ⚠️ FROZEN: Minimum data requirement (DO NOT MODIFY WITHOUT TEST UPDATES)
    if (!operationalSignals || operationalSignals.length < 14) {
      return null;
    }

    const sortedSignals = [...operationalSignals].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );

    const signalsToAnalyze = sortedSignals.slice(0, 14);
    
    if (signalsToAnalyze.length < 14) {
      return null;
    }

    const today = signalsToAnalyze[0].timestamp;
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    const weekendRevenues: number[] = [];
    const weekdayRevenues: number[] = [];

    signalsToAnalyze.forEach(signal => {
      const dayOfWeek = signal.timestamp.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendRevenues.push(signal.dailyRevenue);
      } else {
        weekdayRevenues.push(signal.dailyRevenue);
      }
    });

    const avgWeekendRevenue = weekendRevenues.length > 0 
      ? weekendRevenues.reduce((sum, rev) => sum + rev, 0) / weekendRevenues.length 
      : 0;
    const avgWeekdayRevenue = weekdayRevenues.length > 0 
      ? weekdayRevenues.reduce((sum, rev) => sum + rev, 0) / weekdayRevenues.length 
      : 0;

    if (avgWeekdayRevenue === 0) {
      return null;
    }

    const weekendWeekdayRatio = avgWeekendRevenue / avgWeekdayRevenue;
    
    if (isNaN(weekendWeekdayRatio) || !isFinite(weekendWeekdayRatio)) {
      return null;
    }

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input, 'cafe_restaurant');
    const useThaiSME = isThaiSMEContext(input);
    
    let informationalThreshold: number;
    let warningThreshold: number;
    let criticalThreshold: number;
    
    if (useThaiSME && businessType === 'fnb') {
      const thresholds = getThresholds('fnb') as { weekendWeekdayGapWarning?: number; weekendWeekdayGapCritical?: number };
      informationalThreshold = 1.3;
      warningThreshold = thresholds.weekendWeekdayGapWarning ?? 1.8;
      criticalThreshold = thresholds.weekendWeekdayGapCritical ?? 2.5;
    } else {
      // Use default thresholds
      informationalThreshold = 1.5;
      warningThreshold = 2.0;
      criticalThreshold = 2.8;
    }

    // ⚠️ FROZEN: Severity thresholds logic (now using resolved thresholds)
    let severity: AlertSeverity;
    if (weekendWeekdayRatio >= criticalThreshold) {
      severity = 'critical';
    } else if (weekendWeekdayRatio >= warningThreshold) {
      severity = 'warning';
    } else if (weekendWeekdayRatio >= informationalThreshold) {
      severity = 'informational';
    } else {
      return null;
    }

    const confidence = this.calculateConfidence(operationalSignals.length);
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

    const alert: any = {
      id: `weekend-weekday-fnb-gap-v2-${Date.now()}`,
      timestamp: today,
      type: 'opportunity' as AlertType,
      severity,
      domain: 'risk' as AlertDomain,
      timeHorizon: 'near-term' as TimeHorizon,
      relevanceWindow: {
        start: cutoffDate,
        end: today
      },
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
      scope: 'cafe_restaurant',
      category: 'demand',
      recommendations
    };

    return alert as AlertContract & { scope: string; category: string; recommendations: string[] };
  }

  // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.70;
    const extraDays = dataPoints - 14;
    confidence += extraDays * 0.01;
    return Math.min(0.95, Math.max(0.70, confidence));
  }

  // ⚠️ FROZEN: Message and recommendation generation (DO NOT MODIFY WITHOUT TEST UPDATES)
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

  // ⚠️ FROZEN: Contributing factors generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  private generateContributingFactors(
    ratio: number,
    avgWeekendRevenue: number,
    avgWeekdayRevenue: number,
    weekendDays: number,
    weekdayDays: number
  ): Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> {
    const factors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> = [];
    const revenueGap = avgWeekendRevenue - avgWeekdayRevenue;
    const totalDays = weekendDays + weekdayDays;

    factors.push({
      factor: `Strong weekend performance with average daily revenue of $${avgWeekendRevenue.toFixed(2)}`,
      impact: 'high',
      direction: 'positive'
    });

    if (ratio >= 2.0) {
      factors.push({
        factor: `Significant weekday underperformance with average daily revenue of $${avgWeekdayRevenue.toFixed(2)}`,
        impact: 'high',
        direction: 'negative'
      });
    } else {
      factors.push({
        factor: `Moderate weekday underperformance with average daily revenue of $${avgWeekdayRevenue.toFixed(2)}`,
        impact: 'medium',
        direction: 'negative'
      });
    }

    if (totalDays >= 14) {
      factors.push({
        factor: `Sufficient data coverage with ${totalDays} days analyzed`,
        impact: 'medium',
        direction: 'positive'
      });
    }

    if (revenueGap > 0) {
      factors.push({
        factor: `Daily revenue gap of $${revenueGap.toFixed(2)} between weekend and weekday performance`,
        impact: ratio >= 2.5 ? 'high' : 'medium',
        direction: 'negative'
      });
    }

    return factors;
  }
}
