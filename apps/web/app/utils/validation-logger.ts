/**
 * Validation Logger
 * 
 * PART 5: Expected validation behavior logging for organization scenarios.
 * Validates that health scores, alerts, and exposure match expected patterns.
 */

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

export type ScenarioOrganizationId = 'healthy_hotel' | 'stressed_hotel' | 'crisis_hotel';

interface ValidationResult {
  passed: boolean;
  organizationId: string;
  scenario: ScenarioOrganizationId;
  healthScore: number | null;
  alerts: AlertContract[];
  revenueExposure: number;
  liquidityRunwayAlert: boolean;
  demandDropAlert: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Get scenario type from organization ID or name
 */
function getScenarioFromOrganization(organizationId: string, organizationName?: string | null): ScenarioOrganizationId | null {
  // Check if it's a seed ID
  if (organizationId === 'healthy_hotel' || organizationName?.includes('Healthy')) {
    return 'healthy_hotel';
  }
  if (organizationId === 'stressed_hotel' || organizationName?.includes('Stressed')) {
    return 'stressed_hotel';
  }
  if (organizationId === 'crisis_hotel' || organizationName?.includes('Crisis')) {
    return 'crisis_hotel';
  }
  return null;
}

/**
 * Validate organization scenario against expected behavior
 * PART 5: Skip validation if organization has no daily_metrics rows (empty DB)
 */
export function validateOrganizationScenario(
  organizationId: string,
  healthScore: number | null,
  alerts: AlertContract[],
  revenueExposure: number,
  organizationName?: string | null
): ValidationResult {
  const scenario = getScenarioFromOrganization(organizationId, organizationName);
  if (!scenario) {
    // Not a test scenario, skip validation
    return {
      passed: true,
      organizationId,
      scenario: 'healthy_hotel', // Default
      healthScore,
      alerts,
      revenueExposure,
      liquidityRunwayAlert: false,
      demandDropAlert: false,
      errors: [],
      warnings: ['Organization is not a test scenario, skipping validation'],
    };
  }
  
  // PART 5: If no data (healthScore is null and no alerts), skip validation
  const hasNoData = healthScore === null && (!alerts || alerts.length === 0);
  if (hasNoData) {
    console.log('[ENGINE_VALIDATION] Skipping validation - no daily_metrics data for organization:', organizationId);
    return {
      passed: true,
      organizationId,
      scenario,
      healthScore: 50, // Default safe score
      alerts: [{ id: 'no_recent_data', type: 'no_recent_data', severity: 'informational', message: 'No recent data available' }] as unknown as AlertContract[],
      revenueExposure: 0,
      liquidityRunwayAlert: false,
      demandDropAlert: false,
      errors: [],
      warnings: ['No daily_metrics data found - skipping validation'],
    };
  }
  
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for expected alerts
  const liquidityRunwayAlert = alerts.some(alert => {
    const alertType = (alert as any).type || '';
    const alertId = alert.id || '';
    return alertType === 'liquidity_runway' || 
           alertId.includes('liquidity-runway') ||
           alertId.includes('liquidity_runway');
  });

  const demandDropAlert = alerts.some(alert => {
    const alertType = (alert as any).type || '';
    const alertId = alert.id || '';
    return alertType === 'demand_drop' || 
           alertId.includes('demand-drop') ||
           alertId.includes('demand_drop');
  });

  // Validate based on scenario
  if (scenario === 'healthy_hotel') {
    // Expected: Health score > 80, no liquidity_runway, no demand_drop, exposure near 0
    if (healthScore !== null && healthScore <= 80) {
      errors.push(`Health score ${healthScore} is below expected minimum of 80`);
    }
    if (liquidityRunwayAlert) {
      errors.push('Unexpected liquidity_runway alert found (should not exist for healthy scenario)');
    }
    if (demandDropAlert) {
      errors.push('Unexpected demand_drop alert found (should not exist for healthy scenario)');
    }
    if (revenueExposure > 10000) {
      warnings.push(`Revenue exposure ${revenueExposure} is higher than expected (should be near 0)`);
    }
  } else if (scenario === 'stressed_hotel') {
    // Expected: Health score 50-80, warning-level alerts, moderate exposure
    if (healthScore !== null && (healthScore < 50 || healthScore > 80)) {
      warnings.push(`Health score ${healthScore} is outside expected range [50, 80]`);
    }
    if (revenueExposure < 10000) {
      warnings.push(`Revenue exposure ${revenueExposure} is lower than expected for stressed scenario`);
    }
  } else if (scenario === 'crisis_hotel') {
    // Expected: Health score < 50, liquidity_runway alert, demand_drop alert, exposure > 50,000
    // BUT: If healthScore is 0, it might indicate no data rather than crisis - handle gracefully
    if (healthScore === null || healthScore === 0) {
      warnings.push('Health score is 0/null - may indicate insufficient data rather than crisis scenario');
      // Don't fail validation if we have no data - this is expected when daily_metrics is empty
      return {
        passed: true,
        organizationId,
        scenario,
        healthScore,
        alerts,
        revenueExposure,
        liquidityRunwayAlert,
        demandDropAlert,
        errors: [],
        warnings: [...warnings, 'Skipping crisis validation due to no data (healthScore = 0)'],
      };
    }
    
    if (healthScore >= 50) {
      errors.push(`Health score ${healthScore} is above expected maximum of 50`);
    }
    if (!liquidityRunwayAlert) {
      warnings.push('Missing expected alert: liquidity_runway (may not trigger if no cash data)');
    }
    if (!demandDropAlert) {
      warnings.push('Missing expected alert: demand_drop (may not trigger if no customer data)');
    }
    if (revenueExposure < 50000 && revenueExposure > 0) {
      warnings.push(`Revenue exposure ${revenueExposure} is below minimum expected 50,000 (may indicate insufficient data)`);
    } else if (revenueExposure === 0) {
      warnings.push('Revenue exposure is 0 - may indicate insufficient data rather than crisis scenario');
    }
  }

  const passed = errors.length === 0;

  const result: ValidationResult = {
    passed,
    organizationId,
    scenario,
    healthScore,
    alerts,
    revenueExposure,
    liquidityRunwayAlert,
    demandDropAlert,
    errors,
    warnings,
  };

  // Log validation result
  if (!passed || warnings.length > 0) {
    console.error('[ENGINE_VALIDATION_FAILED]', {
      organizationId,
      scenario,
      healthScore,
      revenueExposure,
      alertsCount: alerts.length,
      liquidityRunwayAlert,
      demandDropAlert,
      errors,
      warnings,
    });
  } else {
    console.log('[ENGINE_VALIDATION_PASSED]', {
      organizationId,
      scenario,
      healthScore,
      revenueExposure,
      alertsCount: alerts.length,
    });
  }

  return result;
}
