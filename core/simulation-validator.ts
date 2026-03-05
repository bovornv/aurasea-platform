/**
 * Simulation Validator
 * 
 * Validates simulation outputs against expected results.
 * Used to ensure alerts, health scores, and revenue exposure match expectations.
 */

import type { AlertContract } from '../core/sme-os/contracts/alerts';
import type { SimulationExpected } from '../../lib/simulation/simulation-library';
import { getAlertType } from '../core/sme-os/engine/services/alert-health-score-mapper';

export interface ValidationResult {
  passed: boolean;
  errors: string[];
}

export interface ValidationInput {
  healthScore: number;
  alerts: AlertContract[];
  revenueExposure: number;
}

/**
 * Validate simulation results against expected outcomes
 */
export function validateSimulation(
  results: ValidationInput,
  expected: SimulationExpected
): ValidationResult {
  const errors: string[] = [];

  // Validate health score range
  if (
    results.healthScore < expected.healthScoreRange[0] ||
    results.healthScore > expected.healthScoreRange[1]
  ) {
    errors.push(
      `Health score ${results.healthScore} is outside expected range [${expected.healthScoreRange[0]}, ${expected.healthScoreRange[1]}]`
    );
  }

  // Check for expected alerts
  const alertTypes = results.alerts.map(alert => {
    const type = getAlertType(alert);
    // Normalize alert type (remove dashes, convert to lowercase)
    const normalized = type.toLowerCase().replace(/-/g, '_');
    // Also check alert ID directly for forced alerts
    const alertIdNormalized = alert.id.toLowerCase().replace(/-/g, '_');
    return { normalized, alertIdNormalized, originalType: type, alertId: alert.id };
  });

  expected.expectedAlerts.forEach(expectedAlertType => {
    const normalizedExpected = expectedAlertType.toLowerCase().replace(/-/g, '_');
    const found = alertTypes.some(({ normalized, alertIdNormalized }) => 
      normalized.includes(normalizedExpected) || 
      normalizedExpected.includes(normalized) ||
      alertIdNormalized.includes(normalizedExpected) ||
      normalizedExpected.includes(alertIdNormalized)
    );
    
    if (!found) {
      // Debug: log what alerts we have
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VALIDATION] Missing expected alert: ${expectedAlertType}`);
        console.log(`[VALIDATION] Available alert types:`, alertTypes.map(a => a.normalized));
        console.log(`[VALIDATION] Available alert IDs:`, alertTypes.map(a => a.alertId));
      }
      errors.push(`Missing expected alert: ${expectedAlertType}`);
    }
  });

  // Check for forbidden alerts
  if (expected.forbiddenAlerts) {
    expected.forbiddenAlerts.forEach(forbiddenAlertType => {
      const normalizedForbidden = forbiddenAlertType.toLowerCase().replace(/-/g, '_');
      if (alertTypes.some(type => type.includes(normalizedForbidden) || normalizedForbidden.includes(type))) {
        errors.push(`Unexpected alert found: ${forbiddenAlertType}`);
      }
    });
  }

  // Validate minimum revenue exposure
  if (
    expected.minRevenueExposure !== undefined &&
    results.revenueExposure < expected.minRevenueExposure
  ) {
    errors.push(
      `Revenue exposure ${results.revenueExposure.toLocaleString()} is below minimum expected ${expected.minRevenueExposure.toLocaleString()}`
    );
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}
