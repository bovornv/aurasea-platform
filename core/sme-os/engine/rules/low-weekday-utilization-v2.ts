import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';

/**
 * Low Weekday Utilization Rule V2
 * 
 * Detects low weekday utilization in café/restaurant F&B operations.
 * V2 Changes: Supports Thai SME threshold calibration
 * All other logic remains identical to V1 (frozen)
 */
export class LowWeekdayUtilizationRuleV2 {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    // PART 2: Add explicit 14-day minimum guard
    if (!operationalSignals || operationalSignals.length < 14) {
      return null;
    }

    // Filter to weekdays only (Monday = 1 to Friday = 5)
    const weekdaySignals = operationalSignals.filter(signal => {
      const dayOfWeek = signal.timestamp.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    });

    // Sort by timestamp (most recent first)
    const sortedWeekdaySignals = [...weekdaySignals].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );

    // Group by date to get unique weekday days
    const weekdayDates = new Set<string>();
    const revenueByDate = new Map<string, number>();
    
    sortedWeekdaySignals.forEach(signal => {
      const dateKey = signal.timestamp.toISOString().split('T')[0];
      weekdayDates.add(dateKey);
      const existing = revenueByDate.get(dateKey) || 0;
      revenueByDate.set(dateKey, existing + signal.dailyRevenue);
    });

    // Need at least 14 unique weekday days
    if (weekdayDates.size < 14) {
      return null;
    }

    // Use all unique weekday days for utilization calculation
    const weekdayRevenues = Array.from(revenueByDate.values());
    const avgWeekdayRevenue = weekdayRevenues.reduce((sum, rev) => sum + rev, 0) / weekdayRevenues.length;
    const peakWeekdayRevenue = Math.max(...weekdayRevenues);
    
    const weekdayDaysAnalyzed = weekdayRevenues.length;
    const today = sortedWeekdaySignals[0].timestamp;

    // Avoid division by zero
    if (peakWeekdayRevenue === 0) {
      return null;
    }

    // Calculate raw utilization ratio
    const utilizationRatio = avgWeekdayRevenue / peakWeekdayRevenue;
    const utilizationPercentageRaw = utilizationRatio * 100;
    const rawUtilization = parseFloat(utilizationPercentageRaw.toFixed(1));
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(rawUtilization) || !isFinite(rawUtilization)) {
      return null;
    }

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input, 'cafe_restaurant');
    const useThaiSME = isThaiSMEContext(input);
    
    let criticalThreshold: number;
    let warningThreshold: number;
    let informationalThreshold: number;
    
    if (useThaiSME && businessType === 'fnb') {
      const thresholds = getThresholds('fnb') as { weekdayUtilizationCritical?: number; weekdayUtilizationWarning?: number };
      criticalThreshold = thresholds.weekdayUtilizationCritical ?? 35;
      warningThreshold = thresholds.weekdayUtilizationWarning ?? 40;
      informationalThreshold = 60;
    } else {
      // Use default thresholds
      criticalThreshold = 30;
      warningThreshold = 40;
      informationalThreshold = 60;
    }

    // Map raw utilization to canonical bucket using resolved thresholds
    const canonicalUtilizationPercentage: number | null = this.mapToCanonicalUtilization(
      rawUtilization,
      criticalThreshold,
      warningThreshold,
      informationalThreshold
    );
    
    const uniqueWeekdayDays = weekdayDates.size;
    const hasExtendedData = uniqueWeekdayDays > 14;
    let severity: AlertSeverity;
    if (canonicalUtilizationPercentage === null) {
      if (hasExtendedData) {
        severity = 'informational';
      } else {
        return null;
      }
    } else if (canonicalUtilizationPercentage === 25.0) {
      severity = 'critical';
    } else if (canonicalUtilizationPercentage === 40.0) {
      severity = 'warning';
    } else {
      severity = 'informational';
    }
    
    const effectiveCanonicalUtilization = canonicalUtilizationPercentage ?? 60.0;

    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const confidence = this.calculateConfidence(uniqueWeekdayDays);
    const { message, recommendations } = this.generateMessageAndRecommendations(
      effectiveCanonicalUtilization,
      avgWeekdayRevenue,
      peakWeekdayRevenue,
      severity
    );

    const contributingFactors = this.generateContributingFactors(
      effectiveCanonicalUtilization,
      severity,
      avgWeekdayRevenue,
      peakWeekdayRevenue,
      weekdayRevenues
    );

    return {
      id: `low-weekday-utilization-v2-${Date.now()}`,
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
        `Weekday Utilization Rate: ${effectiveCanonicalUtilization.toFixed(1)}%`,
        `Average Weekday Revenue: $${avgWeekdayRevenue.toFixed(2)}`,
        `Peak Weekday Revenue: $${peakWeekdayRevenue.toFixed(2)}`,
        `Weekdays Analyzed: ${weekdayDaysAnalyzed}`,
        `Analysis Period: Last 14 weekdays`
      ],
      contributingFactors,
      recommendations
    } as unknown as AlertContract & { scope: string; category: string; recommendations: string[] };
  }

  /**
   * Maps raw utilization to canonical buckets using resolved thresholds
   */
  private mapToCanonicalUtilization(
    rawUtilization: number,
    criticalThreshold: number,
    warningThreshold: number,
    informationalThreshold: number
  ): number | null {
    if (rawUtilization >= 70.0) {
      return null; // ≥70% → null (no alert)
    } else if (rawUtilization >= 50.0) {
      return 60.0; // 50-69.9% → 60.0
    } else if (rawUtilization >= criticalThreshold) {
      return 40.0; // criticalThreshold-49.9% → 40.0
    } else {
      return 25.0; // <criticalThreshold → 25.0
    }
  }

  private calculateConfidence(weekdayDataPoints: number): number {
    let confidence = 0.65;
    const extraWeekdays = weekdayDataPoints - 14;
    confidence += extraWeekdays * 0.01;
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
    canonicalUtilization: number,
    severity: AlertSeverity,
    avgWeekdayRevenue: number,
    peakWeekdayRevenue: number,
    weekdayRevenues: number[]
  ): Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> {
    const factors = [];
    const revenueGap = peakWeekdayRevenue - avgWeekdayRevenue;
    const revenueVariability = this.calculateVariability(weekdayRevenues);

    if (canonicalUtilization === 25.0) {
      factors.push({
        factor: `Very low weekday utilization at ${canonicalUtilization.toFixed(1)}% indicates significant underperformance`,
        impact: 'high' as const,
        direction: 'negative' as const
      });
    } else if (canonicalUtilization === 40.0) {
      factors.push({
        factor: `Very low weekday utilization at ${canonicalUtilization.toFixed(1)}% indicates significant underperformance`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    } else {
      factors.push({
        factor: `Moderate weekday utilization at ${canonicalUtilization.toFixed(1)}% indicates room for optimization`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    if (revenueGap > 0) {
      factors.push({
        factor: `Daily revenue gap of $${revenueGap.toFixed(2)} between peak and average weekday performance`,
        impact: revenueGap > avgWeekdayRevenue ? 'high' as const : 'medium' as const,
        direction: 'negative' as const
      });
    }

    factors.push({
      factor: `Peak weekday performance of $${peakWeekdayRevenue.toFixed(2)} demonstrates achievable revenue potential`,
      impact: 'medium' as const,
      direction: 'positive' as const
    });

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
    
    if (isNaN(mean) || !isFinite(mean) || mean <= 0) {
      return 0;
    }
    
    const variance = revenues.reduce((sum, rev) => sum + Math.pow(rev - mean, 2), 0) / revenues.length;
    const standardDeviation = Math.sqrt(variance);
    
    if (isNaN(standardDeviation) || !isFinite(standardDeviation)) {
      return 0;
    }
    
    return standardDeviation / mean;
  }
}
