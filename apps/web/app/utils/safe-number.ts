/**
 * Safe Number Utility
 * 
 * Central utility for defensive numeric operations.
 * Prevents NaN, undefined, null, and invalid values in calculations.
 */

/**
 * Safely convert a value to a number with fallback
 * 
 * @param value - Value to convert (string, number, null, undefined, etc.)
 * @param fallback - Fallback value if conversion fails (default: 0)
 * @returns Valid number (never NaN, undefined, or null)
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number') {
    // Handle NaN and Infinity
    if (isNaN(value) || !isFinite(value)) {
      return fallback;
    }
    return value;
  }
  
  if (typeof value === 'string') {
    // Remove commas and whitespace
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') {
      return fallback;
    }
    
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || !isFinite(parsed)) {
      return fallback;
    }
    return parsed;
  }
  
  // For null, undefined, or other types
  return fallback;
}

/**
 * Safely divide two numbers, preventing division by zero
 * 
 * @param numerator - Numerator
 * @param denominator - Denominator
 * @param fallback - Fallback value if division fails (default: 0)
 * @returns Result of division or fallback
 */
export function safeDivide(numerator: unknown, denominator: unknown, fallback: number = 0): number {
  const num = safeNumber(numerator, 0);
  const den = safeNumber(denominator, 0);
  
  if (den === 0) {
    return fallback;
  }
  
  const result = num / den;
  if (isNaN(result) || !isFinite(result)) {
    return fallback;
  }
  
  return result;
}

/**
 * Clamp a number between min and max values
 * 
 * @param value - Value to clamp
 * @param min - Minimum value (default: 0)
 * @param max - Maximum value (default: 100)
 * @returns Clamped value
 */
export function safeClamp(value: unknown, min: number = 0, max: number = 100): number {
  const num = safeNumber(value, min);
  return Math.max(min, Math.min(max, num));
}

/**
 * Safely calculate percentage
 * 
 * @param part - Part value
 * @param total - Total value
 * @param fallback - Fallback percentage if calculation fails (default: 0)
 * @returns Percentage (0-100)
 */
export function safePercentage(part: unknown, total: unknown, fallback: number = 0): number {
  const percentage = safeDivide(part, total, fallback) * 100;
  return safeClamp(percentage, 0, 100);
}

/**
 * Safely calculate average
 * 
 * @param values - Array of values to average
 * @param fallback - Fallback value if calculation fails (default: 0)
 * @returns Average value
 */
export function safeAverage(values: unknown[], fallback: number = 0): number {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }
  
  const safeValues = values.map(v => safeNumber(v, 0));
  const sum = safeValues.reduce((acc, val) => acc + val, 0);
  
  if (sum === 0 && safeValues.length === 0) {
    return fallback;
  }
  
  const avg = sum / safeValues.length;
  if (isNaN(avg) || !isFinite(avg)) {
    return fallback;
  }
  
  return avg;
}

/**
 * Safely sum an array of values
 * 
 * @param values - Array of values to sum
 * @param fallback - Fallback value if calculation fails (default: 0)
 * @returns Sum of values
 */
export function safeSum(values: unknown[], fallback: number = 0): number {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }
  
  const sum = values.reduce((acc: number, val) => acc + safeNumber(val, 0), 0);
  
  if (isNaN(sum) || !isFinite(sum)) {
    return fallback;
  }
  
  return sum;
}
