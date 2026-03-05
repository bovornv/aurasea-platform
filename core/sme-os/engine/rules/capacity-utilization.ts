import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Capacity Utilization Alert Rule
 * Detects underutilization and overutilization of room capacity in hotels/resorts
 */
export class CapacityUtilizationRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    occupancyRate: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 21) {
      return null;
    }

    const today = new Date();
    const twentyEightDaysAgo = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);

    // Filter to 28-day rolling window
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= twentyEightDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 21) {
      return null;
    }

    // Calculate key metrics
    const occupancyRates = recentSignals.map(s => s.occupancyRate).filter(r => !isNaN(r) && isFinite(r));
    
    if (occupancyRates.length === 0) {
      return null;
    }
    
    const avgOccupancy = occupancyRates.reduce((sum, rate) => sum + rate, 0) / occupancyRates.length;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(avgOccupancy) || !isFinite(avgOccupancy)) {
      return null;
    }
    
    const peakDays = occupancyRates.filter(rate => rate >= 0.95).length;
    const lowDays = occupancyRates.filter(rate => rate < 0.40).length;
    const variance = this.calculateVariance(occupancyRates, avgOccupancy);
    
    // PART 3: Explicit NaN/Infinity protection for variance
    if (isNaN(variance) || !isFinite(variance)) {
      return null;
    }

    // Detect utilization issues
    const utilizationType = this.detectUtilizationType(avgOccupancy, peakDays);
    
    if (utilizationType === 'normal') {
      return null;
    }

    // Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    // Determine severity using profile thresholds
    const severity = this.determineSeverity(avgOccupancy, peakDays, utilizationType, useThaiSME, businessType);

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length, variance);

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      utilizationType,
      avgOccupancy,
      peakDays,
      lowDays
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      utilizationType,
      avgOccupancy,
      peakDays,
      lowDays,
      variance
    );

    const alert: AlertContract = {
      id: `capacity-utilization-${Date.now()}`,
      timestamp: today,
      type: utilizationType === 'underutilized' ? 'opportunity' : 'risk',
      severity,
      domain: utilizationType === 'underutilized' ? 'forecast' : 'risk',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence,
      contributingFactors,
      conditions: [
        `Average occupancy: ${(avgOccupancy * 100).toFixed(1)}%`,
        `Peak days (≥95%): ${peakDays} days`,
        `Low days (<40%): ${lowDays} days`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  private detectUtilizationType(avgOccupancy: number, peakDays: number): 'underutilized' | 'overutilized' | 'normal' {
    // Check for overutilization first (higher priority)
    if (avgOccupancy > 0.80 || peakDays >= 3) {
      return 'overutilized';
    }

    // Check for underutilization
    if (avgOccupancy < 0.60) {
      return 'underutilized';
    }

    return 'normal';
  }

  private determineSeverity(
    avgOccupancy: number,
    peakDays: number,
    utilizationType: string,
    useThaiSME?: boolean,
    businessType?: 'accommodation' | 'fnb'
  ): 'critical' | 'warning' | 'informational' {
    if (utilizationType === 'overutilized') {
      // Critical: Very high average OR many peak days
      if (avgOccupancy > 0.90 || peakDays >= 7) {
        return 'critical';
      }
      // Warning: High average OR several peak days
      if (avgOccupancy > 0.85 || peakDays >= 5) {
        return 'warning';
      }
      return 'informational';
    }

    if (utilizationType === 'underutilized') {
      if (useThaiSME && businessType === 'accommodation') {
        const thresholds = getThresholds('accommodation') as { occupancyCritical?: number; occupancyWarning?: number };
        const criticalOccupancy = thresholds.occupancyCritical ?? 0.35;
        const warningOccupancy = thresholds.occupancyWarning ?? 0.45;
        
        // Critical: Very low average (more sensitive)
        if (avgOccupancy < criticalOccupancy) {
          return 'critical';
        }
        // Warning: Low average (more sensitive)
        if (avgOccupancy < warningOccupancy) {
          return 'warning';
        }
        return 'informational';
      }
      
      // Default thresholds
      // Critical: Very low average
      if (avgOccupancy < 0.40) {
        return 'critical';
      }
      // Warning: Low average
      if (avgOccupancy < 0.50) {
        return 'warning';
      }
      return 'informational';
    }

    return 'informational';
  }

  private calculateConfidence(dataPoints: number, variance: number): number {
    let confidence = 0.70; // Base confidence

    // Bonus for more data points (beyond minimum 21)
    const extraDays = Math.min(7, dataPoints - 21);
    confidence += extraDays * 0.02; // +0.02 per extra day, max +0.14

    // Bonus for consistent pattern (low variance)
    if (variance < 0.15) {
      confidence += 0.10;
    }

    // Penalty for high variance (inconsistent pattern)
    if (variance > 0.30) {
      confidence -= 0.10;
    }

    return Math.min(0.95, Math.max(0.50, confidence));
  }

  private calculateVariance(occupancyRates: number[], mean: number): number {
    if (occupancyRates.length === 0) {
      return 0;
    }
    
    const squaredDiffs = occupancyRates.map(rate => Math.pow(rate - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / occupancyRates.length;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(variance) || !isFinite(variance) || variance < 0) {
      return 0;
    }
    
    const stdDev = Math.sqrt(variance);
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(stdDev) || !isFinite(stdDev)) {
      return 0;
    }
    
    return stdDev; // Return standard deviation
  }

  private generateMessageAndRecommendations(
    utilizationType: string,
    avgOccupancy: number,
    peakDays: number,
    lowDays: number
  ): { message: string; recommendations: string } {
    if (utilizationType === 'overutilized') {
      const message = peakDays >= 5 
        ? `High capacity strain: ${peakDays} days at ≥95% occupancy with ${(avgOccupancy * 100).toFixed(1)}% average`
        : `High average occupancy: ${(avgOccupancy * 100).toFixed(1)}% may impact service quality`;

      const recommendations = peakDays >= 7
        ? 'Implement demand management: increase rates, restrict availability'
        : avgOccupancy > 0.85
        ? 'Consider rate increases and capacity optimization'
        : 'Monitor service quality and consider premium positioning';

      return { message, recommendations };
    }

    if (utilizationType === 'underutilized') {
      const message = lowDays >= 10
        ? `Severe underutilization: ${lowDays} days below 40% occupancy, ${(avgOccupancy * 100).toFixed(1)}% average`
        : `Low capacity utilization: ${(avgOccupancy * 100).toFixed(1)}% average occupancy indicates revenue opportunity`;

      const recommendations = avgOccupancy < 0.40
        ? 'Implement aggressive pricing strategy and marketing campaigns'
        : avgOccupancy < 0.50
        ? 'Review pricing strategy and increase marketing efforts'
        : 'Consider promotional packages and market expansion';

      return { message, recommendations };
    }

    return {
      message: 'Capacity utilization within normal range',
      recommendations: 'Continue monitoring occupancy patterns'
    };
  }

  private generateContributingFactors(
    utilizationType: string,
    avgOccupancy: number,
    peakDays: number,
    lowDays: number,
    variance: number
  ) {
    const factors = [];

    if (utilizationType === 'overutilized') {
      if (avgOccupancy > 0.85) {
        factors.push({
          factor: 'Consistently high average occupancy',
          weight: Math.min(1.0, (avgOccupancy - 0.80) / 0.15)
        });
      }

      if (peakDays >= 3) {
        factors.push({
          factor: `Multiple peak occupancy days: ${peakDays} days ≥95%`,
          weight: Math.min(1.0, peakDays / 10)
        });
      }

      if (variance < 0.10) {
        factors.push({
          factor: 'Consistently high occupancy pattern',
          weight: 0.8
        });
      }
    }

    if (utilizationType === 'underutilized') {
      if (avgOccupancy < 0.50) {
        factors.push({
          factor: 'Low average occupancy rate',
          weight: Math.min(1.0, (0.60 - avgOccupancy) / 0.20)
        });
      }

      if (lowDays >= 7) {
        factors.push({
          factor: `Multiple low occupancy days: ${lowDays} days <40%`,
          weight: Math.min(1.0, lowDays / 15)
        });
      }

      if (variance < 0.15) {
        factors.push({
          factor: 'Consistently low occupancy pattern',
          weight: 0.7
        });
      }
    }

    return factors.length > 0 ? factors : [
      { factor: 'Capacity utilization pattern analysis', weight: 1.0 }
    ];
  }
}
