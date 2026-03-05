/**
 * Scenario Validator
 * 
 * PART 5: Validates that organization data matches expected scenario behavior.
 */

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details: {
    healthScore: number;
    hasLiquidityRunwayAlert: boolean;
    hasDemandDropAlert: boolean;
    revenueExposure: number;
    alertCount: number;
  };
}

/**
 * Validate organization scenario
 */
export function validateOrganizationScenario(
  organizationId: string,
  healthScore: number,
  alerts: AlertContract[],
  revenueExposure: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const hasLiquidityRunwayAlert = alerts.some(alert =>
    String(alert.type) === 'liquidity_runway' ||
    alert.id?.includes('liquidity-runway')
  );
  
  const hasDemandDropAlert = alerts.some(alert =>
    String(alert.type) === 'demand_drop' ||
    alert.id?.includes('demand-drop')
  );

  const details = {
    healthScore,
    hasLiquidityRunwayAlert,
    hasDemandDropAlert,
    revenueExposure,
    alertCount: alerts.length,
  };

  // Expected behavior by organization
  if (organizationId === 'healthy_hotel') {
    if (healthScore <= 80) {
      errors.push(`Health score ${healthScore} is below expected minimum 80 for healthy scenario`);
    }
    if (hasLiquidityRunwayAlert) {
      errors.push('Unexpected liquidity_runway alert in healthy scenario');
    }
    if (hasDemandDropAlert) {
      errors.push('Unexpected demand_drop alert in healthy scenario');
    }
    if (revenueExposure > 10000) {
      warnings.push(`Revenue exposure ${revenueExposure} is higher than expected for healthy scenario`);
    }
  } else if (organizationId === 'stressed_hotel') {
    if (healthScore < 50 || healthScore > 80) {
      errors.push(`Health score ${healthScore} is outside expected range [50, 80] for stressed scenario`);
    }
    if (revenueExposure < 10000) {
      warnings.push(`Revenue exposure ${revenueExposure} is lower than expected for stressed scenario`);
    }
  } else if (organizationId === 'crisis_hotel') {
    if (healthScore >= 50) {
      errors.push(`Health score ${healthScore} is above expected maximum 50 for crisis scenario`);
    }
    if (!hasLiquidityRunwayAlert) {
      errors.push('Missing expected liquidity_runway alert in crisis scenario');
    }
    if (!hasDemandDropAlert) {
      errors.push('Missing expected demand_drop alert in crisis scenario');
    }
    if (revenueExposure < 50000) {
      errors.push(`Revenue exposure ${revenueExposure} is below minimum expected 50,000 for crisis scenario`);
    }
  }

  const passed = errors.length === 0;

  if (!passed) {
    console.error('[ENGINE_VALIDATION_FAILED]', {
      organizationId,
      errors,
      warnings,
      details,
    });
  } else if (warnings.length > 0) {
    console.warn('[ENGINE_VALIDATION_WARNINGS]', {
      organizationId,
      warnings,
      details,
    });
  }

  return {
    passed,
    errors,
    warnings,
    details,
  };
}
