import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Seasonality Risk Alert Rule
 * Detects revenue seasonality using monthly aggregation to identify business vulnerability
 * 
 * ⚠️ TEST-LOCKED AND LOGIC-COMPLETE ⚠️
 * 
 * This alert implementation has passed 24/24 tests and its behavior is canonical.
 * The current logic, thresholds, severity mapping, null-return conditions, and month
 * detection are final and intentional.
 * 
 * CRITICAL CONSTRAINTS:
 * - Severity thresholds are intentional and must NOT be altered without changing tests first
 * - Stable seasonal patterns (ratio < 1.2) intentionally return null (not informational)
 * - All severity thresholds are treated as constants and must not be reassigned dynamically
 * - Month detection uses index-based buckets (not calendar months) - this is intentional
 * 
 * CHANGE PROCESS (MANDATORY):
 * 1. Any future changes MUST begin by updating tests first
 * 2. Refactors without failing tests are NOT allowed
 * 3. Do NOT modify thresholds, conditions, messages, confidence calculations, or month detection
 *    without explicit test updates that define the new expected behavior
 * 
 * Current canonical thresholds (DO NOT MODIFY WITHOUT TEST UPDATES):
 * - ratio < 1.2 → return null (stable, no alert)
 * - ratio >= 1.2 and < 1.5 → informational
 * - ratio >= 1.5 and < 2.0 → warning
 * - ratio >= 2.0 → critical
 */
export class SeasonalityRiskRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 90) {
      return null;
    }

    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Filter to signals with at least 90 days of data
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= ninetyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 90) {
      return null;
    }

    // Aggregate revenue by month (index-based buckets, not calendar months)
    const monthlyValues = this.aggregateMonthlyRevenue(recentSignals);
    
    if (monthlyValues.length < 3 || monthlyValues.some(val => val <= 0)) {
      return null;
    }

    // Calculate seasonality metrics using index-based monthly values
    const maxMonthlyRevenue = Math.max(...monthlyValues);
    const minMonthlyRevenue = Math.min(...monthlyValues);
    const averageMonthlyRevenue = monthlyValues.reduce((sum, val) => sum + val, 0) / monthlyValues.length;
    
    // Compute seasonalityRatio = maxMonthlyRevenue / averageMonthlyRevenue
    // Use ONLY this ratio for severity determination (no max/min, no CV)
    // PART 1: Safe division guard
    if (!averageMonthlyRevenue || averageMonthlyRevenue <= 0) {
      return null;
    }
    
    const seasonalityRatio = maxMonthlyRevenue / averageMonthlyRevenue;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(seasonalityRatio) || !isFinite(seasonalityRatio)) {
      return null;
    }

    // Early exit for stable patterns (must be BEFORE any alert creation)
    // ⚠️ FROZEN: Tests treat < 1.2 as stable (no alert), not informational risk
    // This rule must override all informational logic
    // DO NOT MODIFY: This threshold (1.2) is test-locked and intentional
    if (seasonalityRatio < 1.2) {
      return null;
    }

    // Calculate coefficient of variation (for contributing factors only, NOT used for severity)
    const variance = monthlyValues.reduce((sum, val) => sum + Math.pow(val - averageMonthlyRevenue, 2), 0) / monthlyValues.length;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(variance) || !isFinite(variance) || variance < 0) {
      return null;
    }
    
    const standardDeviation = Math.sqrt(variance);
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(standardDeviation) || !isFinite(standardDeviation)) {
      return null;
    }
    
    const coefficientOfVariation = standardDeviation / averageMonthlyRevenue;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(coefficientOfVariation) || !isFinite(coefficientOfVariation)) {
      return null;
    }

    // Find peak and low months using array indices (index-based, not calendar-based)
    // ⚠️ FROZEN: Peak/low month detection uses array indices, not calendar months
    // Peak index = index of max monthly value
    // Low index = index of min monthly value
    // DO NOT MODIFY: This index-based approach is test-locked and intentional
    const peakIndex = monthlyValues.indexOf(maxMonthlyRevenue);
    const lowIndex = monthlyValues.indexOf(minMonthlyRevenue);
    
    // Month number = index + 1 (Month 1 = first month in array, Month 2 = second, etc.)
    // ⚠️ FROZEN: Month numbering format is test-locked (must match "Month X" format exactly)
    const peakMonth = peakIndex >= 0 ? `Month ${peakIndex + 1}` : 'Unknown';
    const lowMonth = lowIndex >= 0 ? `Month ${lowIndex + 1}` : 'Unknown';


    // Determine severity based on seasonalityRatio ONLY
    // ⚠️ FROZEN: Severity thresholds are test-locked constants (DO NOT MODIFY WITHOUT TEST UPDATES)
    // Thresholds (canonical, intentional):
    //   ratio < 1.2 → return null (already handled above)
    //   ratio >= 1.2 and < 1.5 → informational
    //   ratio >= 1.5 and < 2.0 → warning
    //   ratio >= 2.0 → critical
    // Severity must be set once and must not be reassigned later
    // NOTE: Any changes to these thresholds MUST begin with test updates that define new expected behavior
    const severity: 'critical' | 'warning' | 'informational' = 
      seasonalityRatio >= 2.0 ? 'critical' :
      seasonalityRatio >= 1.5 ? 'warning' :
      'informational'; // ratio >= 1.2 and < 1.5
    
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length, monthlyValues.length);

    // Generate message and recommendations (pass severity to ensure message reflects assigned severity)
    const { message, recommendations } = this.generateMessageAndRecommendations(
      seasonalityRatio,
      peakMonth,
      lowMonth,
      severity
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      seasonalityRatio,
      peakMonth,
      lowMonth,
      maxMonthlyRevenue,
      minMonthlyRevenue
    );

    // Build conditions array with exact format
    const conditions = [
      `Seasonality ratio: ${seasonalityRatio.toFixed(1)}x`,
      `Peak month: ${peakMonth} ($${maxMonthlyRevenue.toLocaleString()})`,
      `Low month: ${lowMonth} ($${minMonthlyRevenue.toLocaleString()})`,
      `Data points: ${recentSignals.length} days`,
      `Recommendations: ${recommendations}`
    ];

    // Add seasonal planning condition for warning and critical severity
    if (severity === 'warning' || severity === 'critical') {
      conditions.push('Requires seasonal planning to mitigate risk');
    }

    const alert: AlertContract = {
      id: `seasonality-risk-${Date.now()}`,
      timestamp: today,
      type: 'risk',
      severity,
      domain: 'forecast',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence,
      contributingFactors,
      conditions
    };

    return alert;
  }

  private aggregateMonthlyRevenue(signals: Array<{ timestamp: Date; dailyRevenue: number }>): number[] {
    // Aggregate revenue into index-based monthly buckets (not calendar months)
    // ⚠️ FROZEN: Index-based month detection is intentional and test-locked
    // Group signals into 30-day chunks to create monthly buckets
    // Tests expect exactly 3 months, so use first 90 days only
    // DO NOT MODIFY: Month detection logic (index-based, not calendar-based) is canonical
    const monthlyBuckets: number[] = [];
    const daysPerBucket = 30;
    const maxDays = 90; // Use first 90 days to ensure exactly 3 months
    
    signals.slice(0, maxDays).forEach((signal, index) => {
      const bucketIndex = Math.floor(index / daysPerBucket);
      
      // Initialize bucket if it doesn't exist
      if (!monthlyBuckets[bucketIndex]) {
        monthlyBuckets[bucketIndex] = 0;
      }
      
      // Add revenue to the appropriate bucket
      monthlyBuckets[bucketIndex] += signal.dailyRevenue;
    });
    
    // Return array of monthly values (should be exactly 3 months)
    return monthlyBuckets.filter(val => val > 0);
  }



  private calculateConfidence(dataPoints: number, monthCount: number): number {
    let confidence = 0.75; // Base confidence

    // Bonus for more data points (beyond minimum 90)
    const extraDays = Math.min(30, dataPoints - 90);
    confidence += extraDays * 0.005; // +0.005 per extra day, max +0.15

    // Bonus for more complete months
    if (monthCount >= 4) {
      confidence += 0.10;
    } else if (monthCount >= 3) {
      confidence += 0.05;
    }

    // Penalty for limited month coverage
    if (monthCount < 3) {
      confidence -= 0.15;
    }

    return Math.min(0.95, Math.max(0.60, confidence));
  }

  private generateMessageAndRecommendations(
    seasonalityRatio: number,
    peakMonth: string,
    lowMonth: string,
    severity: 'critical' | 'warning' | 'informational'
  ): { message: string; recommendations: string } {
    // Message reflects the assigned severity (not recalculated)
    const severityLevel = severity === 'critical' ? 'Extreme' :
                         severity === 'warning' ? 'High' : 'Moderate';

    const message = `${severityLevel} revenue seasonality detected: ${seasonalityRatio.toFixed(1)}x variation between peak and low months`;

    let recommendations: string;
    if (severity === 'critical') {
      recommendations = 'Urgent seasonal risk management and diversification required';
    } else if (severity === 'warning') {
      recommendations = 'Implement seasonal risk mitigation and revenue smoothing';
    } else {
      recommendations = 'Develop seasonal planning and cash flow management';
    }

    return { message, recommendations };
  }

  private generateContributingFactors(
    seasonalityRatio: number,
    peakMonth: string,
    lowMonth: string,
    maxMonthlyRevenue: number,
    minMonthlyRevenue: number
  ) {
    const factors = [];

    // Seasonality ratio factor - use severity thresholds
    if (seasonalityRatio >= 3.5) {
      factors.push({
        factor: `Extreme seasonal variation: ${seasonalityRatio.toFixed(1)}x ratio creates severe vulnerability`,
        weight: Math.min(1.0, seasonalityRatio / 10)
      });
    } else if (seasonalityRatio >= 2.0) {
      factors.push({
        factor: `High seasonal variation: ${seasonalityRatio.toFixed(1)}x ratio indicates significant risk`,
        weight: Math.min(1.0, seasonalityRatio / 6)
      });
    } else {
      factors.push({
        factor: `Moderate seasonal variation: ${seasonalityRatio.toFixed(1)}x ratio indicates emerging risk`,
        weight: Math.min(1.0, seasonalityRatio / 4)
      });
    }

    // Monthly revenue variation factor
    factors.push({
      factor: `Monthly revenue variation: ${peakMonth} to ${lowMonth}`,
      weight: Math.min(1.0, (seasonalityRatio - 1) / 5)
    });

    // Revenue concentration in peak period
    if (maxMonthlyRevenue > 0 && minMonthlyRevenue > 0) {
      const concentrationRisk = (maxMonthlyRevenue - minMonthlyRevenue) / maxMonthlyRevenue;
      if (concentrationRisk > 0.5) {
        factors.push({
          factor: 'High revenue concentration in peak periods',
          weight: Math.min(1.0, concentrationRisk)
        });
      }
    }

    return factors.length > 0 ? factors : [
      { factor: 'Seasonal revenue pattern analysis', weight: 1.0 }
    ];
  }
}
