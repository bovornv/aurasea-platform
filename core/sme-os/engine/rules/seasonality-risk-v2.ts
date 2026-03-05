import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Seasonality Risk Alert Rule V2
 * Detects revenue seasonality using monthly aggregation to identify business vulnerability
 * 
 * V2 Changes: Supports Thai SME threshold calibration
 * All other logic remains identical to V1 (frozen)
 */
export class SeasonalityRiskRuleV2 {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 90) {
      return null;
    }

    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= ninetyDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 90) {
      return null;
    }

    const monthlyValues = this.aggregateMonthlyRevenue(recentSignals);
    
    if (monthlyValues.length < 3 || monthlyValues.some(val => val <= 0)) {
      return null;
    }

    const maxMonthlyRevenue = Math.max(...monthlyValues);
    const minMonthlyRevenue = Math.min(...monthlyValues);
    const averageMonthlyRevenue = monthlyValues.reduce((sum, val) => sum + val, 0) / monthlyValues.length;
    
    if (!averageMonthlyRevenue || averageMonthlyRevenue <= 0) {
      return null;
    }
    
    const seasonalityRatio = maxMonthlyRevenue / averageMonthlyRevenue;
    
    if (isNaN(seasonalityRatio) || !isFinite(seasonalityRatio)) {
      return null;
    }

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    const stableThreshold = 1.2; // Always 1.2 (frozen)
    let informationalThreshold: number;
    let warningThreshold: number;
    let criticalThreshold: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { seasonalityWarning?: number; seasonalityCritical?: number };
      informationalThreshold = 1.2;
      warningThreshold = thresholds.seasonalityWarning ?? 1.4;
      criticalThreshold = thresholds.seasonalityCritical ?? 1.8;
    } else {
      // Use default thresholds
      informationalThreshold = 1.2;
      warningThreshold = 1.5;
      criticalThreshold = 2.0;
    }

    // Early exit for stable patterns
    if (seasonalityRatio < stableThreshold) {
      return null;
    }

    const variance = monthlyValues.reduce((sum, val) => sum + Math.pow(val - averageMonthlyRevenue, 2), 0) / monthlyValues.length;
    
    if (isNaN(variance) || !isFinite(variance) || variance < 0) {
      return null;
    }
    
    const standardDeviation = Math.sqrt(variance);
    
    if (isNaN(standardDeviation) || !isFinite(standardDeviation)) {
      return null;
    }
    
    const coefficientOfVariation = standardDeviation / averageMonthlyRevenue;
    
    if (isNaN(coefficientOfVariation) || !isFinite(coefficientOfVariation)) {
      return null;
    }

    const peakIndex = monthlyValues.indexOf(maxMonthlyRevenue);
    const lowIndex = monthlyValues.indexOf(minMonthlyRevenue);
    
    const peakMonth = peakIndex >= 0 ? `Month ${peakIndex + 1}` : 'Unknown';
    const lowMonth = lowIndex >= 0 ? `Month ${lowIndex + 1}` : 'Unknown';

    // Determine severity using resolved thresholds
    const severity: 'critical' | 'warning' | 'informational' = 
      seasonalityRatio >= criticalThreshold ? 'critical' :
      seasonalityRatio >= warningThreshold ? 'warning' :
      'informational'; // ratio >= informationalThreshold and < warningThreshold
    
    const timeHorizon: 'immediate' | 'near-term' | 'medium-term' = 
      severity === 'critical' ? 'immediate' :
      severity === 'warning' ? 'near-term' :
      'medium-term';

    const confidence = this.calculateConfidence(recentSignals.length, monthlyValues.length);

    const { message, recommendations } = this.generateMessageAndRecommendations(
      seasonalityRatio,
      peakMonth,
      lowMonth,
      severity
    );

    const contributingFactors = this.generateContributingFactors(
      seasonalityRatio,
      peakMonth,
      lowMonth,
      maxMonthlyRevenue,
      minMonthlyRevenue
    );

    const conditions = [
      `Seasonality ratio: ${seasonalityRatio.toFixed(1)}x`,
      `Peak month: ${peakMonth} ($${maxMonthlyRevenue.toLocaleString()})`,
      `Low month: ${lowMonth} ($${minMonthlyRevenue.toLocaleString()})`,
      `Data points: ${recentSignals.length} days`,
      `Recommendations: ${recommendations}`
    ];

    if (severity === 'warning' || severity === 'critical') {
      conditions.push('Requires seasonal planning to mitigate risk');
    }

    const alert: AlertContract = {
      id: `seasonality-risk-v2-${Date.now()}`,
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
    const monthlyBuckets: number[] = [];
    const daysPerBucket = 30;
    const maxDays = 90;
    
    signals.slice(0, maxDays).forEach((signal, index) => {
      const bucketIndex = Math.floor(index / daysPerBucket);
      
      if (!monthlyBuckets[bucketIndex]) {
        monthlyBuckets[bucketIndex] = 0;
      }
      
      monthlyBuckets[bucketIndex] += signal.dailyRevenue;
    });
    
    return monthlyBuckets.filter(val => val > 0);
  }

  private calculateConfidence(dataPoints: number, monthCount: number): number {
    let confidence = 0.75;

    const extraDays = Math.min(30, dataPoints - 90);
    confidence += extraDays * 0.005;

    if (monthCount >= 4) {
      confidence += 0.10;
    } else if (monthCount >= 3) {
      confidence += 0.05;
    }

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

    factors.push({
      factor: `Monthly revenue variation: ${peakMonth} to ${lowMonth}`,
      weight: Math.min(1.0, (seasonalityRatio - 1) / 5)
    });

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
