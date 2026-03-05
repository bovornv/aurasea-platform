import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Seasonal Mismatch Alert Rule
 * Compares current demand trends to same period last year (Thailand-specific seasonality)
 * Supports Thai SME threshold calibration
 */
export class SeasonalMismatchRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    revenue7Days: number;
    revenue30Days: number;
    occupancyRate?: number;
    customerVolume?: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 1) {
      return null;
    }

    const today = new Date();
    const latest = operationalSignals[0];
    const currentMonth = today.getMonth(); // 0-11
    const currentYear = today.getFullYear();

    // For MVP, we'll use a simplified approach:
    // Compare current period to expected seasonal patterns
    // Thailand peak season: Nov-Feb (cool season), low season: May-Oct (rainy season)
    
    const isPeakSeason = currentMonth >= 10 || currentMonth <= 1; // Nov-Feb
    const isLowSeason = currentMonth >= 4 && currentMonth <= 9; // May-Oct
    
    // Get signals from same period last year (if available)
    // For MVP, we'll use a baseline comparison
    const oneYearAgo = new Date(currentYear - 1, currentMonth, today.getDate());
    const signalsOneYearAgo = operationalSignals.filter(s => {
      const signalDate = new Date(s.timestamp);
      return signalDate.getMonth() === currentMonth && 
             signalDate.getFullYear() === currentYear - 1;
    });

    // If we have historical data, compare directly
    if (signalsOneYearAgo.length > 0) {
      const lastYearSignal = signalsOneYearAgo[0];
      // PART 1: Safe division guard
      if (!lastYearSignal.revenue30Days || lastYearSignal.revenue30Days <= 0) {
        return null;
      }
      
      const revenueChange = ((latest.revenue30Days - lastYearSignal.revenue30Days) / lastYearSignal.revenue30Days) * 100;
      
      // PART 3: Explicit NaN/Infinity protection
      if (isNaN(revenueChange) || !isFinite(revenueChange)) {
        return null;
      }

      // Determine business type and load thresholds
      const businessType = getBusinessType(input);
      const useThaiSME = isThaiSMEContext(input);
      
      let triggerPeakSeason: number;
      let triggerLowSeason: number;
      let triggerOther: number;
      let criticalThreshold: number;
      let warningThreshold: number;
      
      if (useThaiSME) {
        // PART 1.4: Apply alert sensitivity adjustment if provided
        const sensitivity = input?.businessContext?.alertSensitivity;
        const thresholds = getThresholds(businessType, sensitivity);
        
        // Seasonal mismatch thresholds (accommodation-focused)
        if (businessType === 'accommodation') {
          // Note: Profile doesn't have trigger thresholds, use defaults
          triggerPeakSeason = -20;
          triggerLowSeason = 30;
          triggerOther = 25;
          criticalThreshold = 35; // Use default (not in profile)
          warningThreshold = 25;  // Use default (not in profile)
        } else {
          // F&B uses same defaults
          triggerPeakSeason = -20;
          triggerLowSeason = 30;
          triggerOther = 25;
          criticalThreshold = 35;
          warningThreshold = 25;
        }
      } else {
        // Use default thresholds
        triggerPeakSeason = -20;
        triggerLowSeason = 30;
        triggerOther = 25;
        criticalThreshold = 35;
        warningThreshold = 25;
      }

      // Alert if significant deviation from last year
      const significantDeviation = (isPeakSeason && revenueChange < triggerPeakSeason) || 
                                  (isLowSeason && revenueChange > triggerLowSeason) ||
                                  (!isPeakSeason && !isLowSeason && Math.abs(revenueChange) > triggerOther);

      if (!significantDeviation) {
        return null;
      }

      // Determine severity using calibrated thresholds
      let severity: 'critical' | 'warning' | 'informational' = 'informational';
      if (Math.abs(revenueChange) > criticalThreshold) {
        severity = 'critical';
      } else if (Math.abs(revenueChange) > warningThreshold) {
        severity = 'warning';
      }

      const message = isPeakSeason && revenueChange < -20
        ? `Revenue ${Math.abs(revenueChange).toFixed(1)}% below same period last year during peak season`
        : isLowSeason && revenueChange > 30
        ? `Revenue ${revenueChange.toFixed(1)}% above same period last year during low season`
        : `Revenue ${Math.abs(revenueChange).toFixed(1)}% different from same period last year`;

      const alert: AlertContract = {
        id: `seasonal-mismatch-${Date.now()}`,
        timestamp: today,
        type: 'anomaly',
        severity,
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: today,
          end: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)
        },
        message,
        confidence: 0.65, // Lower confidence due to seasonal variability
        contributingFactors: [
          {
            factor: 'Year-over-year comparison',
            weight: (() => {
              const weight = 40 > 0 ? Math.min(1.0, Math.abs(revenueChange) / 40) : 1.0;
              // PART 3: Explicit NaN/Infinity protection
              return (!isNaN(weight) && isFinite(weight)) ? weight : 1.0;
            })()
          }
        ],
        conditions: [
          `Current period: ${isPeakSeason ? 'Peak season' : isLowSeason ? 'Low season' : 'Shoulder season'}`,
          `Revenue change vs last year: ${revenueChange.toFixed(1)}%`,
          `Current 30-day revenue: ${latest.revenue30Days.toLocaleString()}`,
          `Last year 30-day revenue: ${lastYearSignal.revenue30Days.toLocaleString()}`
        ]
      };

      return alert;
    }

    // Fallback: Compare to expected seasonal pattern
    // For MVP, we'll use a simple heuristic
    const expectedRevenue = isPeakSeason 
      ? latest.revenue30Days * 1.2 // Peak should be 20% higher
      : isLowSeason
      ? latest.revenue30Days * 0.8 // Low should be 20% lower
      : latest.revenue30Days;

    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(expectedRevenue) || !isFinite(expectedRevenue) ||
        isNaN(latest.revenue30Days) || !isFinite(latest.revenue30Days)) {
      return null;
    }

    // This is a simplified check - in production, use actual historical data
    return null; // Skip if no historical comparison available
  }
}
