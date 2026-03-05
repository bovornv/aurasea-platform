/**
 * Safe Math Utilities
 * 
 * PART 4: Global numeric safety utility for alert engine
 * Provides safe division and numeric validation functions
 */

/**
 * Safe division function
 * Returns null if division is unsafe (denominator is 0 or invalid)
 * Also checks for NaN and Infinity in result
 */
export function safeDivide(numerator: number, denominator: number): number | null {
  // Guard against invalid denominator
  if (!denominator || denominator <= 0 || isNaN(denominator) || !isFinite(denominator)) {
    return null;
  }
  
  // Guard against invalid numerator
  if (isNaN(numerator) || !isFinite(numerator)) {
    return null;
  }
  
  const result = numerator / denominator;
  
  // Guard against NaN and Infinity in result
  if (isNaN(result) || !isFinite(result)) {
    return null;
  }
  
  return result;
}

/**
 * Safe percentage calculation
 * Calculates (numerator / denominator) * 100 safely
 */
export function safePercentage(numerator: number, denominator: number): number | null {
  const ratio = safeDivide(numerator, denominator);
  if (ratio === null) {
    return null;
  }
  
  const percentage = ratio * 100;
  
  // Guard against NaN and Infinity
  if (isNaN(percentage) || !isFinite(percentage)) {
    return null;
  }
  
  return percentage;
}

/**
 * Validate numeric value
 * Returns true if value is a valid finite number
 */
export function isValidNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Safe numeric operation wrapper
 * Executes a numeric operation and validates the result
 */
export function safeNumericOperation<T>(
  operation: () => T,
  fallback: T
): T {
  try {
    const result = operation();
    
    // If result is a number, validate it
    if (typeof result === 'number') {
      if (isNaN(result) || !isFinite(result)) {
        return fallback;
      }
    }
    
    return result;
  } catch (e) {
    return fallback;
  }
}
