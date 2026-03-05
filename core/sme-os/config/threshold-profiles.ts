/**
 * Regional Threshold Profiles
 * 
 * Calibrated thresholds for Thai SME business context, organized by business type.
 * These thresholds are more sensitive than default values to account for:
 * - Thinner margins (10-25% typical)
 * - Lower cash reserves (1-3 months typical)
 * - Higher volatility (tourism-dependent)
 * - Strong seasonality (Nov-Feb peak, May-Oct low)
 */

export const THAI_SME_THRESHOLDS = {
  accommodation: {
    costRatioWarning: 0.70,
    costRatioCritical: 0.80,
    occupancyWarning: 0.45,
    occupancyCritical: 0.35,
    weekendDependencyWarning: 0.60,
    weekendDependencyCritical: 0.70,
    cashRunwayWarningDays: 45,
    cashRunwayCriticalDays: 20,
    revenueVolatilityWarning: 0.25,
    revenueVolatilityCritical: 0.40,
    marginCompressionWarning: 0.08,
    marginCompressionCritical: 0.15
  },
  fnb: {
    costRatioWarning: 0.78,
    costRatioCritical: 0.88,
    top3RevenueWarning: 0.65,
    top3RevenueCritical: 0.75,
    customerDropWarning: 0.20,
    customerDropCritical: 0.35,
    promoInefficiencyWarning: 0.18,
    promoInefficiencyCritical: 0.30,
    revenueDeclineWarning: 0.15,
    revenueDeclineCritical: 0.30
  }
};

/**
 * Get business type from input contract or alert scope
 */
export function getBusinessType(input?: { businessType?: string; scope?: string; businessContext?: { region?: string; businessSize?: string } }, alertScope?: string): 'accommodation' | 'fnb' {
  // Check alert scope first (most reliable indicator)
  if (alertScope === 'cafe_restaurant') {
    return 'fnb';
  }
  
  if (input?.businessType) {
    return input.businessType === 'fnb' || input.businessType === 'cafe_restaurant' ? 'fnb' : 'accommodation';
  }
  
  if (input?.scope) {
    return input.scope === 'cafe_restaurant' ? 'fnb' : 'accommodation';
  }
  
  // Check businessContext for region/businessSize
  if (input?.businessContext) {
    const context = input.businessContext;
    if (context.region === 'thailand' && context.businessSize === 'sme') {
      // Default to accommodation for Thai SMEs unless specified otherwise
      return 'accommodation';
    }
  }
  
  // Default to accommodation if not specified
  return 'accommodation';
}

/**
 * Check if Thai SME mode is enabled
 */
export function isThaiSMEMode(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.THAI_SME_MODE === 'true' || 
           process.env.NEXT_PUBLIC_THAI_SME_MODE === 'true';
  }
  return false;
}

/**
 * Check if input indicates Thai SME context
 */
export function isThaiSMEContext(input?: { businessContext?: { region?: string; businessSize?: string } }): boolean {
  // Check businessContext if available
  if (input?.businessContext) {
    const context = input.businessContext;
    return context.region === 'thailand' && context.businessSize === 'sme';
  }
  
  // Fallback to environment variable
  return isThaiSMEMode();
}

/**
 * Alert sensitivity type
 */
export type AlertSensitivity = 'low' | 'medium' | 'high';

/**
 * Apply sensitivity adjustment to a threshold value
 * PART 1.4: Low = +10% tolerance (less sensitive), High = -10% tolerance (more sensitive)
 */
function applySensitivityAdjustment(threshold: number, sensitivity: AlertSensitivity = 'medium'): number {
  if (sensitivity === 'low') {
    // Low: Increase threshold tolerance by +10% (threshold becomes less strict)
    // For ratios < 1: multiply by 1.1 (e.g., 0.70 -> 0.77)
    // For ratios >= 1: multiply by 1.1 (e.g., 45 days -> 49.5 days)
    return threshold * 1.1;
  } else if (sensitivity === 'high') {
    // High: Reduce threshold tolerance by -10% (threshold becomes more strict)
    // For ratios < 1: multiply by 0.9 (e.g., 0.70 -> 0.63)
    // For ratios >= 1: multiply by 0.9 (e.g., 45 days -> 40.5 days)
    return threshold * 0.9;
  }
  // Medium: No adjustment (default thresholds)
  return threshold;
}

/**
 * Get thresholds for a business type and log usage
 * PART 1.4: Apply alert sensitivity adjustment if provided
 */
export function getThresholds(
  businessType: 'accommodation' | 'fnb',
  sensitivity?: AlertSensitivity
) {
  const baseThresholds = THAI_SME_THRESHOLDS[businessType];
  
  // PART 1.4: Apply sensitivity adjustment if provided
  if (sensitivity && sensitivity !== 'medium') {
    const adjustedThresholds = { ...baseThresholds };
    
    // Apply adjustment to all numeric threshold values
    Object.keys(adjustedThresholds).forEach(key => {
      const value = (adjustedThresholds as any)[key];
      if (typeof value === 'number') {
        (adjustedThresholds as any)[key] = applySensitivityAdjustment(value, sensitivity);
      }
    });
    
    // Console audit - log active thresholds with sensitivity
    console.log("Using THAI SME thresholds for:", businessType, "with sensitivity:", sensitivity);
    
    return adjustedThresholds;
  }
  
  // Console audit - log active thresholds per branch/alert
  console.log("Using THAI SME thresholds for:", businessType);
  
  return baseThresholds;
}
