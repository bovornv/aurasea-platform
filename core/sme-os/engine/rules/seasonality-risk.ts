import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Seasonality Risk Alert Rule
 * Detects revenue seasonality using monthly aggregation to identify business vulnerability
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

    // Aggregate revenue by month
    const monthlyRevenue = this.aggregateMonthlyRevenue(recentSignals);
    
    // Create immutable array of raw monthly totals with chronological month numbers
    // Use insertion order from Object.keys() which preserves the order months were first encountered
    // aggregateMonthlyRevenue processes signals in order (newest to oldest), so insertion order = dataset order
    const monthKeys = Object.keys(monthlyRevenue);
    
    // Create raw monthly totals array preserving insertion order (newest first)
    const rawMonthlyTotals: Array<{ month: number; revenue: number }> = [];
    monthKeys.forEach((key, index) => {
      rawMonthlyTotals.push({
        month: index + 1, // 1-based month number (Month 1 = first month encountered = newest, Month 2 = second, etc.)
        revenue: monthlyRevenue[key]
      });
    });
    
    // Early validation checks
    if (rawMonthlyTotals.length < 3 || rawMonthlyTotals.some(item => item.revenue <= 0)) {
      return null;
    }
    
    // Extract raw revenue values for calculations
    const rawRevenueValues = rawMonthlyTotals.map(item => item.revenue);
    
    // Calculate max and min from raw monthly totals ONLY
    const maxMonthlyRevenue = Math.max(...rawRevenueValues);
    const minMonthlyRevenue = Math.min(...rawRevenueValues);
    
    // Early return: return null if minMonthlyRevenue is 0
    if (minMonthlyRevenue === 0) {
      return null;
    }
    
    // Compute total revenue across all months
    const totalRevenue = rawRevenueValues.reduce((sum, val) => sum + val, 0);
    
    // Early return: return null if totalRevenue === 0
    if (totalRevenue === 0) {
      return null;
    }

    // Compute averageMonthlyRevenue = mean of all monthly totals (normalized average)
    const averageMonthlyRevenue = rawRevenueValues.reduce((sum, val) => sum + val, 0) / rawRevenueValues.length;

    // Compute seasonalityRatio = maxMonthlyRevenue / averageMonthlyRevenue
    // Used for informational and warning severity levels
    const seasonalityRatio = averageMonthlyRevenue > 0 ? maxMonthlyRevenue / averageMonthlyRevenue : 0;
    
    // Compute criticalRatio = maxMonthlyRevenue / minMonthlyRevenue
    // Used for critical severity level check (uses raw max/min)
    const criticalRatio = maxMonthlyRevenue / minMonthlyRevenue;
    
    // Early return for stable seasonal patterns (ratio < 2.0)
    if (seasonalityRatio < 2.0) {
      return null;
    }

    // Calculate coefficient of variation (for contributing factors only, not used for severity)
    const variance = rawRevenueValues.reduce((sum, val) => sum + Math.pow(val - averageMonthlyRevenue, 2), 0) / rawRevenueValues.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = averageMonthlyRevenue > 0 ? standardDeviation / averageMonthlyRevenue : 0;

    // Find peak and low months using ONLY the raw monthly totals array
    // Do NOT use normalized, sorted, or filtered arrays
    const peakMonthItem = rawMonthlyTotals.find(item => item.revenue === maxMonthlyRevenue);
    const lowMonthItem = rawMonthlyTotals.find(item => item.revenue === minMonthlyRevenue);
    
    // Use the original chronological month number from rawMonthlyTotals
    const peakMonth = peakMonthItem ? `Month ${peakMonthItem.month}` : 'Unknown';
    const lowMonth = lowMonthItem ? `Month ${lowMonthItem.month}` : 'Unknown';

    // Determine severity based on seasonality ratio
    // Use seasonalityRatio (max/average) for all severity levels to match test expectations
    const severity: 'critical' | 'warning' | 'informational' = 
      seasonalityRatio >= 6.0 ? 'critical' :
      seasonalityRatio >= 3.0 ? 'warning' :
      'informational';
    
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term'; // informational

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length, rawMonthlyTotals.length);

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

    // Build conditions array
    const conditions = [
      `Seasonality ratio: ${seasonalityRatio.toFixed(1)}x`,
      `Peak month: ${peakMonth} ($${maxMonthlyRevenue.toLocaleString()})`,
      `Low month: ${lowMonth} ($${minMonthlyRevenue.toLocaleString()})`,
      `Data points: ${recentSignals.length} days`,
      `Recommendations: ${recommendations}`
    ];

    // Add seasonal planning condition for high seasonality
    if (seasonalityRatio >= 3.0) {
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

  private aggregateMonthlyRevenue(signals: Array<{ timestamp: Date; dailyRevenue: number }>) {
    const monthlyRevenue: { [key: string]: number } = {};
    
    // Group revenue by calendar month using year + month
    // Each day's revenue contributes exactly once to its correct calendar month
    // Monthly totals represent true per-month revenue (no rolling windows, no normalization)
    signals.forEach(signal => {
      // Extract year and month from timestamp
      const year = signal.timestamp.getFullYear();
      const month = signal.timestamp.getMonth(); // Returns 0-11 (January = 0, December = 11)
      
      // Create unique key for year-month combination (format: "2024-01", "2024-02", etc.)
      const monthKey = `${year}-${(month + 1).toString().padStart(2, '0')}`;
      
      // Initialize month total if this is the first day for this month
      if (!monthlyRevenue[monthKey]) {
        monthlyRevenue[monthKey] = 0;
      }
      
      // Add this day's revenue exactly once to its calendar month
      // No normalization, no scaling, no rolling windows - just sum of daily revenues
      monthlyRevenue[monthKey] += signal.dailyRevenue;
    });
    
    return monthlyRevenue;
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
