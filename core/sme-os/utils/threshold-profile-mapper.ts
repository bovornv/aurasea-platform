/**
 * Threshold Profile Mapper
 *
 * Maps business-type-based threshold profiles to specific alert thresholds.
 * Logging is dev-only and once per session; results are cached.
 */

import { THAI_SME_THRESHOLDS, getBusinessType, isThaiSMEMode } from '../config/threshold-profiles';
import { InputContract } from '../contracts/inputs';

const alertThresholdCache = new Map<string, Record<string, number> | null>();
const loggedAlertKeys = new Set<string>();

function logAlertThresholdOnce(businessType: string, alertName: string): void {
  if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'development') return;
  const key = `${businessType}:${alertName}`;
  if (loggedAlertKeys.has(key)) return;
  loggedAlertKeys.add(key);
  console.log(`Using THAI SME thresholds for: ${businessType} (alert: ${alertName})`);
}

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
 * Cached per (alertName, businessType).
 */
export function getAlertThresholds(
  alertName: string,
  input?: InputContract
): Record<string, number> | null {
  if (!shouldUseThaiSME(input)) {
    return null;
  }

  const businessType = getBusinessType(input);
  const cacheKey = `${alertName}:${businessType}`;
  const cached = alertThresholdCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const profile = THAI_SME_THRESHOLDS[businessType];
  const thresholdMap: Record<string, Record<string, number>> = {
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

  const thresholds = thresholdMap[alertName] ?? null;
  if (thresholds) {
    logAlertThresholdOnce(businessType, alertName);
  }
  alertThresholdCache.set(cacheKey, thresholds);
  return thresholds;
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

const allThresholdsCache = new Map<string, Record<string, number>>();
const loggedAllKeys = new Set<string>();

function logAllThresholdsOnce(businessType: string): void {
  if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'development') return;
  if (loggedAllKeys.has(businessType)) return;
  loggedAllKeys.add(businessType);
  console.log(`Using THAI SME thresholds for: ${businessType}`);
}

/**
 * Get all thresholds for a business type. Cached per businessType; log once per session (dev only).
 */
export function getAllThresholdsForBusinessType(input?: InputContract): Record<string, number> | null {
  if (!shouldUseThaiSME(input)) {
    return null;
  }

  const businessType = getBusinessType(input);
  const cached = allThresholdsCache.get(businessType);
  if (cached) {
    return cached;
  }
  const profile = THAI_SME_THRESHOLDS[businessType];
  logAllThresholdsOnce(businessType);
  const result = profile as unknown as Record<string, number>;
  allThresholdsCache.set(businessType, result);
  return result;
}
