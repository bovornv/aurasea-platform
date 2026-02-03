import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Weekend-Weekday Imbalance Alert Rule (Revenue Opportunity)
 * Detects strong weekend demand but weak weekday occupancy for Thai hotels/resorts
 * This is an OPPORTUNITY alert, not a risk alert
 */
export class WeekendWeekdayImbalanceRule {
  evaluate(
    input: InputContract,
    operationalSignals?: Array<{
      timestamp: Date;
      revenue7Days: number;
      revenue30Days: number;
      occupancyRate?: number;
    }>,
    businessType?: 'cafe' | 'resort' | 'restaurant' | 'hotel'
  ): AlertContract | null {
    // Only applies to hotels and resorts
    if (businessType !== 'hotel' && businessType !== 'resort') {
      return null;
    }

    if (!operationalSignals || operationalSignals.length < 2) {
      return null;
    }

    const today = new Date();
    const latest = operationalSignals[0];
    const previous = operationalSignals[1];

    // Need occupancy rate data for this alert
    if (latest.occupancyRate === undefined || previous.occupancyRate === undefined) {
      return null;
    }

    // Calculate average occupancy
    const avgOccupancy = latest.occupancyRate;
    
    // Heuristic: If occupancy is moderate-high (50%+) but revenue per day is inconsistent,
    // it suggests weekend/weekday imbalance
    // For 7-day revenue, weekends typically account for 40-50% of weekly revenue
    // If we see high occupancy but revenue doesn't scale linearly, it suggests imbalance
    
    const revenuePerDay7Days = latest.revenue7Days / 7;
    const revenuePerDay30Days = latest.revenue30Days / 30;
    
    // Calculate revenue efficiency (revenue per occupancy point)
    // Lower efficiency suggests weekday underutilization
    const revenueEfficiency = avgOccupancy > 0 
      ? revenuePerDay7Days / (avgOccupancy * 100) 
      : 0;

    // Detect pattern: High occupancy (>60%) but revenue efficiency suggests weekday gaps
    // This indicates strong weekends but weak weekdays
    const highOccupancy = avgOccupancy >= 0.60; // 60%+ occupancy
    const moderateOccupancy = avgOccupancy >= 0.45; // 45%+ occupancy
    
    // Revenue efficiency threshold: if efficiency is low relative to occupancy,
    // it suggests weekday underutilization
    const lowEfficiency = revenueEfficiency < 0.8 && avgOccupancy > 0.50;
    
    // Revenue variance: if 7-day vs 30-day per-day revenue differs significantly,
    // it suggests weekly patterns (weekend/weekday)
    const revenueVariance = revenuePerDay30Days > 0
      ? Math.abs(revenuePerDay7Days - revenuePerDay30Days) / revenuePerDay30Days
      : 0;
    
    const hasImbalance = (highOccupancy || moderateOccupancy) && 
                        (lowEfficiency || revenueVariance > 0.15);

    if (!hasImbalance) {
      return null;
    }

    // Determine severity (for opportunity alerts, higher occupancy = higher opportunity)
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (avgOccupancy >= 0.70 && lowEfficiency) {
      severity = 'warning'; // High opportunity
    } else if (avgOccupancy >= 0.60) {
      severity = 'informational';
    }

    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'medium-term';
    if (avgOccupancy >= 0.70) {
      timeHorizon = 'near-term';
    }

    // Generate message
    const occupancyPercent = Math.round(avgOccupancy * 100);
    const message = `Occupancy at ${occupancyPercent}% suggests strong weekend demand with weekday underutilization opportunity`;

    // Contributing factors
    const contributingFactors = [];
    if (highOccupancy) {
      contributingFactors.push({
        factor: 'High overall occupancy rate',
        weight: Math.min(1.0, avgOccupancy)
      });
    }
    if (lowEfficiency) {
      contributingFactors.push({
        factor: 'Revenue efficiency suggests weekday gaps',
        weight: Math.min(1.0, (0.8 - revenueEfficiency) / 0.8)
      });
    }
    if (revenueVariance > 0.15) {
      contributingFactors.push({
        factor: 'Weekly revenue patterns detected',
        weight: Math.min(1.0, revenueVariance / 0.3)
      });
    }

    const alert: AlertContract = {
      id: `weekend-weekday-imbalance-${Date.now()}`,
      timestamp: today,
      type: 'opportunity', // This is an opportunity alert, not a risk
      severity,
      domain: 'forecast', // Revenue opportunity domain
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000) // 60 days
      },
      message,
      confidence: 0.68, // Moderate confidence - pattern detection
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Occupancy pattern analysis', weight: 1.0 }
      ],
      conditions: [
        `Current occupancy rate: ${occupancyPercent}%`,
        `7-day revenue per day: ${revenuePerDay7Days.toLocaleString()}`,
        `30-day revenue per day: ${revenuePerDay30Days.toLocaleString()}`,
        `Revenue efficiency: ${revenueEfficiency.toFixed(2)}`,
        `Business type: ${businessType}`
      ]
    };

    return alert;
  }
}
