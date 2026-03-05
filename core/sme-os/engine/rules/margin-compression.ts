import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Margin Compression Alert Rule
 * Detects shrinking profit margin despite stable revenue
 * Supports Thai SME threshold calibration
 */
export class MarginCompressionRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    revenue7Days: number;
    revenue30Days: number;
    costs7Days: number;
    costs30Days: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 2) {
      return null;
    }

    const today = new Date();
    const latest = operationalSignals[0];
    const previous = operationalSignals[1];

    // Calculate margins
    const previousMargin7Days = previous.revenue7Days > 0
      ? ((previous.revenue7Days - previous.costs7Days) / previous.revenue7Days) * 100
      : 0;

    const latestMargin7Days = latest.revenue7Days > 0
      ? ((latest.revenue7Days - latest.costs7Days) / latest.revenue7Days) * 100
      : 0;

    const previousMargin30Days = previous.revenue30Days > 0
      ? ((previous.revenue30Days - previous.costs30Days) / previous.revenue30Days) * 100
      : 0;

    const latestMargin30Days = latest.revenue30Days > 0
      ? ((latest.revenue30Days - latest.costs30Days) / latest.revenue30Days) * 100
      : 0;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(previousMargin7Days) || !isFinite(previousMargin7Days) ||
        isNaN(latestMargin7Days) || !isFinite(latestMargin7Days) ||
        isNaN(previousMargin30Days) || !isFinite(previousMargin30Days) ||
        isNaN(latestMargin30Days) || !isFinite(latestMargin30Days)) {
      return null;
    }

    // Check for margin compression (margin shrinking while revenue stable or growing slightly)
    const margin7DaysChange = latestMargin7Days - previousMargin7Days;
    const margin30DaysChange = latestMargin30Days - previousMargin30Days;
    
    // PART 3: Explicit NaN/Infinity protection for changes
    if (isNaN(margin7DaysChange) || !isFinite(margin7DaysChange) ||
        isNaN(margin30DaysChange) || !isFinite(margin30DaysChange)) {
      return null;
    }

    const revenueStable = previous.revenue7Days > 0 && 
      Math.abs(latest.revenue7Days - previous.revenue7Days) / previous.revenue7Days < 0.10;
    
    // Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let triggerThreshold7Day: number;
    let triggerThreshold30Day: number;
    let criticalThreshold7Day: number;
    let criticalThreshold30Day: number;
    let warningThreshold7Day: number;
    let warningThreshold30Day: number;
    
    if (useThaiSME) {
      // PART 1.4: Apply alert sensitivity adjustment if provided
      const sensitivity = input?.businessContext?.alertSensitivity;
      const thresholds = getThresholds(businessType, sensitivity);
      
      // marginCompressionWarning/Critical are percentage point drops (e.g., 0.08 = 8 percentage points)
      const m = thresholds as { marginCompressionCritical?: number; marginCompressionWarning?: number };
      const crit = m.marginCompressionCritical ?? 0.15;
      const warn = m.marginCompressionWarning ?? 0.08;
      criticalThreshold7Day = -crit * 100;
      criticalThreshold30Day = -crit * 100;
      warningThreshold7Day = -warn * 100;
      warningThreshold30Day = -warn * 100;
      triggerThreshold7Day = -3; // Keep trigger at default
      triggerThreshold30Day = -5; // Keep trigger at default
    } else {
      // Use default thresholds
      triggerThreshold7Day = -3;
      triggerThreshold30Day = -5;
      criticalThreshold7Day = -8;
      criticalThreshold30Day = -10;
      warningThreshold7Day = -5;
      warningThreshold30Day = -7;
    }

    // CRITICAL: Also trigger if margin goes negative (costs exceed revenue)
    // This handles crisis scenarios where revenue drops significantly
    const negativeMargin = latestMargin7Days < 0 || latestMargin30Days < 0;
    const marginCompression = negativeMargin || 
      ((margin7DaysChange < triggerThreshold7Day || margin30DaysChange < triggerThreshold30Day) && revenueStable);

    if (!marginCompression) {
      return null;
    }

    // Determine severity using calibrated thresholds
    // CRITICAL: Negative margins (costs > revenue) are always critical
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (latestMargin7Days < 0 || latestMargin30Days < 0 || 
        margin7DaysChange < criticalThreshold7Day || margin30DaysChange < criticalThreshold30Day) {
      severity = 'critical';
    } else if (margin7DaysChange < warningThreshold7Day || margin30DaysChange < warningThreshold30Day) {
      severity = 'warning';
    }

    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'near-term';
    if (margin7DaysChange < -8 || latestMargin7Days < 0) {
      timeHorizon = 'immediate';
    } else if (margin30DaysChange < -7) {
      timeHorizon = 'near-term';
    } else {
      timeHorizon = 'medium-term';
    }

    // Generate message
    let message: string;
    if (latestMargin7Days < 0 || latestMargin30Days < 0) {
      // Negative margin (costs exceed revenue)
      const lossAmount = latestMargin30Days < 0 
        ? Math.abs(latest.revenue30Days - latest.costs30Days)
        : Math.abs(latest.revenue7Days - latest.costs7Days) * (30/7);
      message = `Operating at a loss: costs exceed revenue by ฿${Math.round(lossAmount).toLocaleString()} per month`;
    } else {
      const marginDrop = Math.abs(Math.min(margin7DaysChange, margin30DaysChange));
      message = `Profit margin compressed by ${marginDrop.toFixed(1)}%${revenueStable ? ' despite stable revenue' : ''}`;
    }

    // Contributing factors
    const contributingFactors = [];
    if (margin7DaysChange < -3) {
      contributingFactors.push({
        factor: 'Recent margin compression',
        weight: Math.min(1.0, Math.abs(margin7DaysChange) / 10)
      });
    }
    if (margin30DaysChange < -5) {
      contributingFactors.push({
        factor: 'Sustained margin compression',
        weight: Math.min(1.0, Math.abs(margin30DaysChange) / 12)
      });
    }
    if (latestMargin7Days < 5) {
      contributingFactors.push({
        factor: 'Low margin threshold',
        weight: Math.min(1.0, (5 - latestMargin7Days) / 5)
      });
    }

    const alert: AlertContract = {
      id: `margin-compression-${Date.now()}`,
      timestamp: today,
      type: 'risk',
      severity,
      domain: 'risk',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence: 0.72,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Margin trend analysis', weight: 1.0 }
      ],
      conditions: [
        `7-day margin: ${latestMargin7Days.toFixed(1)}% (was ${previousMargin7Days.toFixed(1)}%)`,
        `30-day margin: ${latestMargin30Days.toFixed(1)}% (was ${previousMargin30Days.toFixed(1)}%)`,
        `Revenue stability: ${revenueStable ? 'Stable' : 'Changing'}`
      ]
    };

    return alert;
  }
}
