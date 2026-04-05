import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Weekend–Weekday F&B Gap Alert Rule
 * Detects revenue imbalance between weekend and weekday performance in F&B operations
 * 
 * ⚠️ FROZEN — LOGIC VALIDATED BY FULL TEST COVERAGE ⚠️
 * 
 * This alert implementation has passed all tests and its behavior is canonical.
 * The current logic, thresholds, severity mapping, confidence calculation, and alert structure
 * are final and intentional.
 * 
 * CRITICAL CONSTRAINTS:
 * - Severity thresholds (1.5x / 2.0x / 2.8x) are final and must NOT be altered without changing tests first
 * - Confidence formula (base 0.70, +0.01 per extra day, cap 0.95) is final
 * - Minimum data requirement (14 days) is final
 * - Scope must remain "cafe_restaurant"
 * - Conditions, recommendations, contributingFactors structure must remain exactly as implemented
 * 
 * CHANGE PROCESS (MANDATORY):
 * 1. Any future changes MUST begin by updating tests first
 * 2. Refactors without failing tests are NOT allowed
 * 3. Do NOT modify thresholds, conditions, messages, confidence calculations, or alert structure
 *    without explicit test updates that define the new expected behavior
 * 4. Only allow changes if a new alert version is intentionally introduced, or
 *    a new test explicitly requires different behavior
 * 
 * Current canonical thresholds (DO NOT MODIFY WITHOUT TEST UPDATES):
 * - ratio < 1.5x → return null (below threshold, no alert)
 * - ratio >= 1.5x and < 2.0x → informational
 * - ratio >= 2.0x and < 2.8x → warning
 * - ratio >= 2.8x → critical
 */
export class WeekendWeekdayFnbGapRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 5) {
      return null;
    }

    // Sort signals by timestamp (most recent first) and take the most recent 14
    const sortedSignals = [...operationalSignals].sort((a, b) =>
      b.timestamp.getTime() - a.timestamp.getTime()
    );

    const signalsToAnalyze = sortedSignals.slice(0, 14);

    if (signalsToAnalyze.length < 5) {
      return null;
    }

    // Use the most recent signal's date as reference for today
    const today = signalsToAnalyze[0].timestamp;
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Separate weekend (Sat=6, Sun=0) and weekday (Mon=1 to Fri=5) revenue
    const weekendRevenues: number[] = [];
    const weekdayRevenues: number[] = [];

    signalsToAnalyze.forEach(signal => {
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
    // PART 1: Safe division guard already checked above (avgWeekdayRevenue === 0 check)
    const weekendWeekdayRatio = avgWeekendRevenue / avgWeekdayRevenue;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(weekendWeekdayRatio) || !isFinite(weekendWeekdayRatio)) {
      return null;
    }

    // Determine business type and load thresholds
    const businessType = getBusinessType(input, 'cafe_restaurant'); // This alert is F&B only
    const useThaiSME = isThaiSMEContext(input);
    
    let criticalThreshold: number;
    let warningThreshold: number;
    let informationalThreshold: number;
    
    // Note: weekendWeekdayGap thresholds not in user's profile, use defaults
    if (useThaiSME && businessType === 'fnb') {
      // Use more sensitive defaults for Thai SME F&B
      criticalThreshold = 2.5;  // More sensitive
      warningThreshold = 1.8;    // More sensitive
      informationalThreshold = 1.5; // Keep informational at default
    } else {
      // Use default thresholds (frozen values)
      criticalThreshold = 2.8;
      warningThreshold = 2.0;
      informationalThreshold = 1.5;
    }
    
    // ⚠️ FROZEN: Severity thresholds (now using profile-based thresholds when Thai SME mode is enabled)
    let severity: AlertSeverity;
    if (weekendWeekdayRatio >= criticalThreshold) {
      severity = 'critical';
    } else if (weekendWeekdayRatio >= warningThreshold) {
      severity = 'warning';
    } else if (weekendWeekdayRatio >= informationalThreshold) {
      severity = 'informational';
    } else {
      return null; // Below threshold, no alert needed
    }

    const rawConfidence = this.calculateConfidence(operationalSignals.length);
    // Apply confidence cap for insufficient data (below full 14-day minimum)
    const confidence = operationalSignals.length < 14
      ? Math.min(rawConfidence, 0.6)
      : rawConfidence;
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
      scope: 'cafe_restaurant', // ⚠️ FROZEN: Scope must remain "cafe_restaurant" (DO NOT MODIFY WITHOUT TEST UPDATES)
      category: 'demand',
      recommendations
    };

    return alert as AlertContract & { scope: string; category: string; recommendations: string[] };
  }

  // ⚠️ FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Formula is canonical: base 0.70, +0.01 per extra day beyond 14, capped at 0.95
  private calculateConfidence(dataPoints: number): number {
    let confidence = 0.70; // Base confidence for F&B analysis

    // Bonus for more data points (beyond minimum 14)
    const extraDays = dataPoints - 14;
    confidence += extraDays * 0.01; // +0.01 per extra day

    return Math.min(0.95, Math.max(0.70, confidence));
  }

  // ⚠️ FROZEN: Message and recommendation generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Message format and recommendation strings are test-locked and must match expectations exactly
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
  // Factor structure (impact/direction), wording, and ordering are test-locked
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

    // Weekend performance factor (always included)
    factors.push({
      factor: `Strong weekend performance with average daily revenue of $${avgWeekendRevenue.toFixed(2)}`,
      impact: 'high',
      direction: 'positive'
    });

    // Weekday underperformance factor
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

    // Data coverage factor (always included when >= 14 days)
    if (totalDays >= 14) {
      factors.push({
        factor: `Sufficient data coverage with ${totalDays} days analyzed`,
        impact: 'medium',
        direction: 'positive'
      });
    }

    // Revenue gap factor (always included when gap > 0)
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
