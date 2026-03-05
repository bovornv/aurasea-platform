import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Demand/Occupancy Drop Alert Rule
 * Triggers when revenue, bookings, or demand proxy drops significantly vs recent baseline
 * Supports Thai SME threshold calibration
 */
export class DemandDropRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    revenue7Days: number;
    revenue30Days: number;
    occupancyRate?: number;
    customerVolume?: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 2) {
      return null;
    }

    const today = new Date();
    const latest = operationalSignals[0];
    const previous = operationalSignals[1];

    // Calculate revenue drop percentage
    const revenue7DaysChange = previous.revenue7Days > 0
      ? ((latest.revenue7Days - previous.revenue7Days) / previous.revenue7Days) * 100
      : 0;

    const revenue30DaysChange = previous.revenue30Days > 0
      ? ((latest.revenue30Days - previous.revenue30Days) / previous.revenue30Days) * 100
      : 0;

    // Check for occupancy/customer volume drop if available
    let occupancyDrop = 0;
    if (latest.occupancyRate !== undefined && previous.occupancyRate !== undefined && previous.occupancyRate > 0) {
      occupancyDrop = ((latest.occupancyRate - previous.occupancyRate) / previous.occupancyRate) * 100;
    }

    let customerVolumeDrop = 0;
    if (latest.customerVolume !== undefined && previous.customerVolume !== undefined) {
      customerVolumeDrop = previous.customerVolume > 0
        ? ((latest.customerVolume - previous.customerVolume) / previous.customerVolume) * 100
        : 0;
    }
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(revenue7DaysChange) || !isFinite(revenue7DaysChange) ||
        isNaN(revenue30DaysChange) || !isFinite(revenue30DaysChange) ||
        isNaN(occupancyDrop) || !isFinite(occupancyDrop) ||
        isNaN(customerVolumeDrop) || !isFinite(customerVolumeDrop)) {
      return null;
    }

    // Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let triggerThreshold7Day: number;
    let triggerThreshold30Day: number;
    let triggerThresholdOccupancy: number;
    let triggerThresholdCustomerVolume: number;
    let criticalThreshold7Day: number;
    let criticalThreshold30Day: number;
    let criticalThresholdOccupancy: number;
    let warningThreshold7Day: number;
    let warningThreshold30Day: number;
    let warningThresholdOccupancy: number;
    let criticalThresholdCustomerVolume: number;
    let warningThresholdCustomerVolume: number;
    
    if (useThaiSME) {
      // PART 1.4: Apply alert sensitivity adjustment if provided
      const sensitivity = input?.businessContext?.alertSensitivity;
      const thresholds = getThresholds(businessType, sensitivity);
      
      if (businessType === 'accommodation') {
        const acc = thresholds as { occupancyCritical?: number; occupancyWarning?: number };
        criticalThresholdOccupancy = -(acc.occupancyCritical ?? 0.35) * 100;
        warningThresholdOccupancy = -(acc.occupancyWarning ?? 0.45) * 100;
        triggerThresholdOccupancy = -10; // Keep trigger at default
        
        // Revenue thresholds (not in profile, use defaults)
        criticalThreshold7Day = -30;
        criticalThreshold30Day = -35;
        warningThreshold7Day = -20;
        warningThreshold30Day = -25;
        triggerThreshold7Day = -15;
        triggerThreshold30Day = -20;
        triggerThresholdCustomerVolume = -15; // Not used for accommodation
        criticalThresholdCustomerVolume = -40;
        warningThresholdCustomerVolume = -25;
      } else {
        const fnb = thresholds as { customerDropCritical?: number; customerDropWarning?: number; revenueDeclineCritical?: number; revenueDeclineWarning?: number };
        criticalThresholdCustomerVolume = -(fnb.customerDropCritical ?? 0.35) * 100;
        warningThresholdCustomerVolume = -(fnb.customerDropWarning ?? 0.20) * 100;
        triggerThresholdCustomerVolume = -15;

        criticalThreshold7Day = -(fnb.revenueDeclineCritical ?? 0.30) * 100;
        criticalThreshold30Day = -(fnb.revenueDeclineCritical ?? 0.30) * 100;
        warningThreshold7Day = -(fnb.revenueDeclineWarning ?? 0.15) * 100;
        warningThreshold30Day = -(fnb.revenueDeclineWarning ?? 0.15) * 100;
        triggerThreshold7Day = -15;
        triggerThreshold30Day = -20;
        
        // Occupancy not applicable for F&B
        criticalThresholdOccupancy = -20;
        warningThresholdOccupancy = -15;
        triggerThresholdOccupancy = -10;
      }
    } else {
      // Use default thresholds
      triggerThreshold7Day = -15;
      triggerThreshold30Day = -20;
      triggerThresholdOccupancy = -10;
      triggerThresholdCustomerVolume = -15;
      criticalThreshold7Day = -30;
      criticalThreshold30Day = -35;
      criticalThresholdOccupancy = -20;
      warningThreshold7Day = -20;
      warningThreshold30Day = -25;
      warningThresholdOccupancy = -15;
      criticalThresholdCustomerVolume = -40;
      warningThresholdCustomerVolume = -25;
    }

    // Determine if there's a significant drop
    const significantDrop = revenue7DaysChange < triggerThreshold7Day || 
                           revenue30DaysChange < triggerThreshold30Day || 
                           occupancyDrop < triggerThresholdOccupancy || 
                           customerVolumeDrop < triggerThresholdCustomerVolume;

    if (!significantDrop) {
      return null;
    }

    // Determine severity using calibrated thresholds
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (revenue7DaysChange < criticalThreshold7Day || 
        revenue30DaysChange < criticalThreshold30Day || 
        occupancyDrop < criticalThresholdOccupancy) {
      severity = 'critical';
    } else if (revenue7DaysChange < warningThreshold7Day || 
               revenue30DaysChange < warningThreshold30Day || 
               occupancyDrop < warningThresholdOccupancy) {
      severity = 'warning';
    }

    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'near-term';
    if (revenue7DaysChange < -25) {
      timeHorizon = 'immediate';
    } else if (revenue30DaysChange < -25) {
      timeHorizon = 'near-term';
    } else {
      timeHorizon = 'medium-term';
    }

    // Generate message
    const dropPercent = Math.abs(Math.min(revenue7DaysChange, revenue30DaysChange, occupancyDrop, customerVolumeDrop));
    const message = `Demand indicators show ${dropPercent.toFixed(1)}% decline compared to recent baseline`;

    // Contributing factors
    const contributingFactors = [];
    if (revenue7DaysChange < -15) {
      contributingFactors.push({
        factor: 'Recent revenue decline',
        weight: Math.min(1.0, Math.abs(revenue7DaysChange) / 30)
      });
    }
    if (revenue30DaysChange < -20) {
      contributingFactors.push({
        factor: 'Sustained revenue decline',
        weight: Math.min(1.0, Math.abs(revenue30DaysChange) / 35)
      });
    }
    if (occupancyDrop < -10) {
      contributingFactors.push({
        factor: 'Occupancy rate decline',
        weight: Math.min(1.0, Math.abs(occupancyDrop) / 20)
      });
    }
    if (customerVolumeDrop < -15) {
      contributingFactors.push({
        factor: 'Customer volume decline',
        weight: Math.min(1.0, Math.abs(customerVolumeDrop) / 25)
      });
    }

    const alert: AlertContract = {
      id: `demand-drop-${Date.now()}`,
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
      confidence: 0.70,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Demand trend analysis', weight: 1.0 }
      ],
      conditions: [
        `7-day revenue change: ${revenue7DaysChange.toFixed(1)}%`,
        `30-day revenue change: ${revenue30DaysChange.toFixed(1)}%`,
        occupancyDrop !== 0 ? `Occupancy change: ${occupancyDrop.toFixed(1)}%` : '',
        customerVolumeDrop !== 0 ? `Customer volume change: ${customerVolumeDrop.toFixed(1)}%` : ''
      ].filter(Boolean)
    };

    return alert;
  }
}
