// Validation utilities for form inputs and data integrity

/**
 * Validate that a number is non-negative
 */
export function validateNonNegative(value: number | null, fieldName: string): string | null {
  if (value === null) {
    return `${fieldName} is required`;
  }
  if (value < 0) {
    return `${fieldName} cannot be negative`;
  }
  return null;
}

/**
 * Validate that a number is within a reasonable range
 */
export function validateRange(
  value: number | null,
  min: number,
  max: number,
  fieldName: string
): string | null {
  if (value === null) {
    return `${fieldName} is required`;
  }
  if (value < min || value > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }
  return null;
}

/**
 * Validate percentage value (0-100)
 */
export function validatePercentage(value: number | null, fieldName: string): string | null {
  return validateRange(value, 0, 100, fieldName);
}

/**
 * Validate that longer period value is >= shorter period value
 */
export function validatePeriodComparison(
  shorterPeriod: number | null,
  longerPeriod: number | null,
  shorterLabel: string,
  longerLabel: string
): string | null {
  if (shorterPeriod === null || longerPeriod === null) {
    return null; // Let required field validation handle nulls
  }
  if (longerPeriod < shorterPeriod) {
    return `${longerLabel} should be greater than or equal to ${shorterLabel}`;
  }
  return null;
}

/**
 * Sanitize number input - remove non-numeric characters except commas and decimals
 */
export function sanitizeNumberInput(input: string): string {
  // Remove all characters except digits, commas, and single decimal point
  let cleaned = input.replace(/[^\d,.]/g, '');
  
  // Ensure only one decimal point
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  
  return cleaned;
}

/**
 * Format large numbers with appropriate precision
 */
export function formatLargeNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}
