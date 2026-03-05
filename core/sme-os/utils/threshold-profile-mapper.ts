/**
 * Threshold Profile Mapper
 * 
 * Maps business-type-based threshold profiles to specific alert thresholds
 * Provides console logging for threshold usage audit
 */

import { THAI_SME_THRESHOLDS, getBusinessType, isThaiSMEMode } from '../config/threshold-profiles';
import { InputContract } from '../contracts/inputs';

/**
 * Check if Thai SME mode should be used
 */
function shouldUseThaiSME(input?: InputContract): boolean {
  return isThaiSMEMode() || 
    (input?.businessContext?.region === 'thailand' && input?.businessContext?.businessSize === 'sme');
}

/**
 * Get thresholds for a specific alert based on business type
 * Returns null if Thai SME mode is not enabled or alert not mapped
 */
export function getAlertThresholds(
  alertName: string,
  input?: InputContract
): Record<string, number> | null {
  if (!shouldUseThaiSME(input)) {
    return null; // Use default thresholds
  }
  
  const businessType = getBusinessType(input);
  const profile = THAI_SME_THRESHOLDS[businessType];
  
  // Map alert names to profile thresholds
  // Note: This maps the user's simplified structure to our 16 alerts
  const thresholdMap: Record<string, Record<string, number>> = {
    // Accommodation alerts
    'cost-pressure': {
      warning: profile.costRatioWarning,
      critical: profile.costRatioCritical,
    },
    'capacity-utilization': {
      warning: profile.occupancyWarning,
      critical: profile.occupancyCritical,
    },
    'revenue-concentration': {
      warning: profile.weekendDependencyWarning,
      critical: profile.weekendDependencyCritical,
    },
    'cash-runway': {
      warning: profile.cashRunwayWarningDays,
      critical: profile.cashRunwayCriticalDays,
    },
    'cash-flow-volatility': {
      warning: profile.revenueVolatilityWarning,
      critical: profile.revenueVolatilityCritical,
    },
    'margin-compression': {
      warning: profile.marginCompressionWarning,
      critical: profile.marginCompressionCritical,
    },
    
    // F&B alerts
    'menu-revenue-concentration': {
      warning: profile.top3RevenueWarning,
      critical: profile.top3RevenueCritical,
    },
    'demand-drop': {
      warning: profile.customerDropWarning,
      critical: profile.customerDropCritical,
    },
    'weekend-weekday-fnb-gap': {
      warning: profile.promoInefficiencyWarning,
      critical: profile.promoInefficiencyCritical,
    },
    'low-weekday-utilization': {
      warning: profile.revenueDeclineWarning,
      critical: profile.revenueDeclineCritical,
    },
  };
  
  const thresholds = thresholdMap[alertName];
  
  if (thresholds) {
    console.log(`Using THAI SME thresholds for: ${businessType} (alert: ${alertName})`);
    return thresholds;
  }
  
  return null; // Alert not in profile, use defaults
}

/**
 * Get threshold value for a specific alert and severity
 * Falls back to default if Thai SME mode not enabled or alert not mapped
 */
export function getThreshold(
  alertName: string,
  severity: 'warning' | 'critical' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const thresholds = getAlertThresholds(alertName, input);
  
  if (!thresholds) {
    return defaultValue;
  }
  
  // For informational, use warning threshold if available, otherwise default
  if (severity === 'informational' && !thresholds.informational) {
    return thresholds.warning || defaultValue;
  }
  
  return thresholds[severity] || defaultValue;
}

/**
 * Get all thresholds for a business type (for console audit)
 */
export function getAllThresholdsForBusinessType(input?: InputContract): Record<string, number> | null {
  if (!shouldUseThaiSME(input)) {
    return null;
  }
  
  const businessType = getBusinessType(input);
  const profile = THAI_SME_THRESHOLDS[businessType];
  
  console.log(`Using THAI SME thresholds for: ${businessType}`);
  
  return profile as any;
}
