import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Cost Pressure Alert Rule
 * Triggers when operating costs rise faster than revenue or staffing increases without demand growth
 * Supports Thai SME threshold calibration
 */
export class CostPressureRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    revenue7Days: number;
    revenue30Days: number;
    costs7Days: number;
    costs30Days: number;
    staffCount: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 2) {
      return null;
    }

    const today = new Date();
    const latest = operationalSignals[0];
    const previous = operationalSignals[1];

    // Calculate cost vs revenue changes
    const revenue7DaysChange = previous.revenue7Days > 0
      ? ((latest.revenue7Days - previous.revenue7Days) / previous.revenue7Days) * 100
      : 0;

    const costs7DaysChange = previous.costs7Days > 0
      ? ((latest.costs7Days - previous.costs7Days) / previous.costs7Days) * 100
      : 0;

    const revenue30DaysChange = previous.revenue30Days > 0
      ? ((latest.revenue30Days - previous.revenue30Days) / previous.revenue30Days) * 100
      : 0;

    const costs30DaysChange = previous.costs30Days > 0
      ? ((latest.costs30Days - previous.costs30Days) / previous.costs30Days) * 100
      : 0;

    // Check staff count increase without revenue growth
    const staffChange = previous.staffCount > 0
      ? ((latest.staffCount - previous.staffCount) / previous.staffCount) * 100
      : 0;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(revenue7DaysChange) || !isFinite(revenue7DaysChange) ||
        isNaN(costs7DaysChange) || !isFinite(costs7DaysChange) ||
        isNaN(revenue30DaysChange) || !isFinite(revenue30DaysChange) ||
        isNaN(costs30DaysChange) || !isFinite(costs30DaysChange) ||
        isNaN(staffChange) || !isFinite(staffChange)) {
      return null;
    }

    // Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let triggerCostRevenueGap: number;
    let triggerStaffChange: number;
    let triggerRevenueChange: number;
    let criticalCostRevenueGap: number;
    let criticalStaffChange: number;
    let warningCostRevenueGap: number;
    let warningStaffChange: number;
    let warningRevenueChange: number;
    
    if (useThaiSME) {
      // PART 1.4: Apply alert sensitivity adjustment if provided
      const sensitivity = input?.businessContext?.alertSensitivity;
      const thresholds = getThresholds(businessType, sensitivity) as { costRatioCritical?: number; costRatioWarning?: number };
      criticalCostRevenueGap = (1 - (thresholds.costRatioCritical ?? 0.80)) * 100;
      warningCostRevenueGap = (1 - (thresholds.costRatioWarning ?? 0.70)) * 100;
      triggerCostRevenueGap = 10; // Keep trigger at default
      
      criticalStaffChange = 20; // Keep at default (not in profile)
      warningStaffChange = 15;  // Keep at default
      triggerStaffChange = 10;   // Keep at default
      
      warningRevenueChange = 5;  // Keep at default
      triggerRevenueChange = 5;  // Keep at default
    } else {
      // Use default thresholds
      triggerCostRevenueGap = 10;
      triggerStaffChange = 10;
      triggerRevenueChange = 5;
      criticalCostRevenueGap = 25;
      criticalStaffChange = 20;
      warningCostRevenueGap = 15;
      warningStaffChange = 15;
      warningRevenueChange = 5;
    }

    // Determine if costs are rising faster than revenue
    const costPressure = (costs7DaysChange > revenue7DaysChange + triggerCostRevenueGap) || 
                        (costs30DaysChange > revenue30DaysChange + triggerCostRevenueGap + 5) ||
                        (staffChange > triggerStaffChange && revenue7DaysChange < triggerRevenueChange);

    if (!costPressure) {
      return null;
    }

    // Determine severity using calibrated thresholds
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    const costRevenueGap = Math.max(
      costs7DaysChange - revenue7DaysChange,
      costs30DaysChange - revenue30DaysChange
    );

    if (costRevenueGap > criticalCostRevenueGap || 
        (staffChange > criticalStaffChange && revenue7DaysChange < 0)) {
      severity = 'critical';
    } else if (costRevenueGap > warningCostRevenueGap || 
               (staffChange > warningStaffChange && revenue7DaysChange < warningRevenueChange)) {
      severity = 'warning';
    }

    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'near-term';
    if (costRevenueGap > 20) {
      timeHorizon = 'immediate';
    } else if (costRevenueGap > 15) {
      timeHorizon = 'near-term';
    } else {
      timeHorizon = 'medium-term';
    }

    // Generate message
    let message = '';
    if (costs7DaysChange > revenue7DaysChange + 10) {
      message = `Operating costs rising ${(costRevenueGap).toFixed(1)}% faster than revenue`;
    } else if (staffChange > 10 && revenue7DaysChange < 5) {
      message = `Staffing increased ${staffChange.toFixed(1)}% without corresponding revenue growth`;
    } else {
      message = `Cost pressure detected: costs rising faster than revenue`;
    }

    // Contributing factors
    const contributingFactors = [];
    if (costs7DaysChange > revenue7DaysChange) {
      contributingFactors.push({
        factor: 'Cost growth exceeding revenue growth',
        weight: Math.min(1.0, (costs7DaysChange - revenue7DaysChange) / 30)
      });
    }
    if (staffChange > 10 && revenue7DaysChange < 5) {
      contributingFactors.push({
        factor: 'Staffing increase without demand growth',
        weight: Math.min(1.0, staffChange / 25)
      });
    }
    if (costs30DaysChange > revenue30DaysChange) {
      contributingFactors.push({
        factor: 'Sustained cost pressure',
        weight: Math.min(1.0, (costs30DaysChange - revenue30DaysChange) / 35)
      });
    }

    const alert: AlertContract = {
      id: `cost-pressure-${Date.now()}`,
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
      confidence: 0.75,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Cost trend analysis', weight: 1.0 }
      ],
      conditions: [
        `7-day cost change: ${costs7DaysChange.toFixed(1)}%`,
        `7-day revenue change: ${revenue7DaysChange.toFixed(1)}%`,
        `30-day cost change: ${costs30DaysChange.toFixed(1)}%`,
        `30-day revenue change: ${revenue30DaysChange.toFixed(1)}%`,
        `Staff change: ${staffChange.toFixed(1)}%`
      ]
    };

    return alert;
  }
}
