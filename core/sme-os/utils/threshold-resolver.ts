/**
 * Threshold Resolver Utility
 * 
 * Resolves alert thresholds based on business context (Thai SME vs default)
 * Supports gradual migration without breaking existing tests
 * 
 * Integrates with threshold-profiles.ts for business-type-based calibration
 */

import { InputContract } from '../contracts/inputs';
import { THAI_SME_THRESHOLDS, isThaiSMEMode } from '../config/thai-sme-thresholds';
import { getAlertThresholds } from './threshold-profile-mapper';

/**
 * Check if input indicates Thai SME context
 */
export function isThaiSMEContext(input?: InputContract): boolean {
  // Check businessContext if available
  if (input?.businessContext) {
    const context = input.businessContext as any;
    return context.region === 'thailand' && context.businessSize === 'sme';
  }
  
  // Fallback to environment variable
  return isThaiSMEMode();
}

/**
 * Get threshold from profile-based system first, then fall back to alert-based system
 * This allows using the simpler threshold-profiles.ts structure when available
 */
function getThresholdFromProfile(
  alertName: string,
  severity: 'warning' | 'critical' | 'informational',
  defaultValue: number,
  input?: InputContract
): number | null {
  const profileThresholds = getAlertThresholds(alertName, input);
  if (profileThresholds && profileThresholds[severity] !== undefined) {
    return profileThresholds[severity];
  }
  return null; // Not found in profile, use alert-based system
}

/**
 * Resolve threshold for demand drop alert
 */
export function resolveDemandDropThreshold(
  thresholdType: 'critical' | 'warning' | 'trigger',
  metric: 'sevenDay' | 'thirtyDay' | 'occupancy' | 'customerVolume',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.demandDrop[thresholdType][metric];
}

/**
 * Resolve threshold for cost pressure alert
 * Checks threshold-profiles.ts first, then falls back to alert-based system
 */
export function resolveCostPressureThreshold(
  thresholdType: 'critical' | 'warning' | 'trigger',
  metric: 'costRevenueGap' | 'staffChange' | 'revenueChange',
  defaultValue: number,
  input?: InputContract
): number {
  // Try profile-based system first (for costRatioWarning/Critical)
  if (metric === 'costRevenueGap' && (thresholdType === 'warning' || thresholdType === 'critical')) {
    const profileThreshold = getThresholdFromProfile('cost-pressure', thresholdType, defaultValue, input);
    if (profileThreshold !== null) {
      return profileThreshold;
    }
  }
  
  // Fall back to alert-based system
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.costPressure[thresholdType][metric];
}

/**
 * Resolve threshold for margin compression alert
 */
export function resolveMarginCompressionThreshold(
  thresholdType: 'critical' | 'warning' | 'trigger',
  period: 'sevenDay' | 'thirtyDay',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.marginCompression[thresholdType][period];
}

/**
 * Resolve threshold for seasonal mismatch alert
 */
export function resolveSeasonalMismatchThreshold(
  thresholdType: 'critical' | 'warning' | 'trigger',
  metric?: 'peakSeason' | 'lowSeason' | 'other',
  defaultValue?: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue ?? 0;
  }
  
  if (thresholdType === 'trigger' && metric) {
    return THAI_SME_THRESHOLDS.seasonalMismatch.trigger[metric];
  }
  
  return THAI_SME_THRESHOLDS.seasonalMismatch[thresholdType];
}

/**
 * Resolve threshold for data confidence risk alert
 */
export function resolveDataConfidenceThreshold(
  thresholdType: 'critical' | 'warning',
  metric: 'confidence' | 'dataAge',
  businessType?: 'cafe' | 'resort' | 'default',
  defaultValue?: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue ?? 0;
  }
  
  if (metric === 'confidence') {
    return THAI_SME_THRESHOLDS.dataConfidenceRisk[thresholdType].confidence;
  }
  
  // dataAge
  const businessTypeKey = businessType ?? 'default';
  return THAI_SME_THRESHOLDS.dataConfidenceRisk[thresholdType].dataAge[businessTypeKey];
}

/**
 * Resolve threshold for menu revenue concentration alert
 */
export function resolveMenuRevenueConcentrationThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.menuRevenueConcentration[thresholdType];
}

/**
 * Resolve threshold for liquidity runway risk alert
 */
export function resolveLiquidityRunwayThreshold(
  thresholdType: 'critical' | 'warning' | 'informational' | 'healthy',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.liquidityRunwayRisk[thresholdType];
}

/**
 * Resolve threshold for break-even risk alert
 */
export function resolveBreakEvenRiskThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  metric?: 'min' | 'max',
  defaultValue?: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue ?? 0;
  }
  
  if (thresholdType === 'informational' && metric) {
    return THAI_SME_THRESHOLDS.breakEvenRisk.informational[metric];
  }
  
  return THAI_SME_THRESHOLDS.breakEvenRisk[thresholdType];
}

/**
 * Resolve threshold for cash flow volatility alert
 */
export function resolveCashFlowVolatilityThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.cashFlowVolatility[thresholdType];
}

/**
 * Resolve threshold for cash runway alert
 */
export function resolveCashRunwayThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.cashRunway[thresholdType];
}

/**
 * Resolve threshold for low weekday utilization alert
 */
export function resolveLowWeekdayUtilizationThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.lowWeekdayUtilization[thresholdType];
}

/**
 * Resolve threshold for capacity utilization alert
 */
export function resolveCapacityUtilizationThreshold(
  thresholdType: 'critical' | 'warning',
  metric: 'underutilized' | 'overutilized' | 'peakDays',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.capacityUtilization[thresholdType][metric];
}

/**
 * Resolve threshold for weekend-weekday F&B gap alert
 */
export function resolveWeekendWeekdayFnbGapThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.weekendWeekdayFnbGap[thresholdType];
}

/**
 * Resolve threshold for revenue concentration alert
 */
export function resolveRevenueConcentrationThreshold(
  thresholdType: 'critical' | 'warning',
  metric: 'weekendShare' | 'top5Days',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.revenueConcentration[thresholdType][metric];
}

/**
 * Resolve threshold for seasonality risk alert
 */
export function resolveSeasonalityRiskThreshold(
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.seasonalityRisk[thresholdType];
}

/**
 * Resolve threshold for weekend-weekday imbalance alert
 */
export function resolveWeekendWeekdayImbalanceThreshold(
  thresholdType: 'critical' | 'warning',
  metric: 'occupancy' | 'premiumRatio' | 'weekdayAdvantage',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  return THAI_SME_THRESHOLDS.weekendWeekdayImbalance[thresholdType][metric];
}

/**
 * Generic threshold resolver (fallback)
 */
export function resolveThreshold(
  alertName: keyof typeof THAI_SME_THRESHOLDS,
  thresholdType: 'critical' | 'warning' | 'informational' | 'trigger',
  defaultValue: number,
  input?: InputContract
): number {
  const useThaiSME = isThaiSMEContext(input);
  if (!useThaiSME) {
    return defaultValue;
  }
  
  // Try to get threshold from config
  const config = THAI_SME_THRESHOLDS[alertName];
  if (!config) {
    return defaultValue;
  }
  
  // Handle different threshold structures
  if (thresholdType === 'critical' && 'critical' in config) {
    const critical = (config as any).critical;
    if (typeof critical === 'number') {
      return critical;
    }
  }
  
  if (thresholdType === 'warning' && 'warning' in config) {
    const warning = (config as any).warning;
    if (typeof warning === 'number') {
      return warning;
    }
  }
  
  if (thresholdType === 'informational' && 'informational' in config) {
    const informational = (config as any).informational;
    if (typeof informational === 'number') {
      return informational;
    }
  }
  
  return defaultValue;
}
