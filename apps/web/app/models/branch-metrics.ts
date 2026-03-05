/**
 * Branch Metrics Models
 * 
 * Module-based metrics architecture for Hospitality AI
 * Supports Accommodation and F&B modules with shared financials
 */

// =============================
// ROOT BRANCH METRICS STRUCTURE
// =============================

export interface BranchMetrics {
  branchId: string;
  groupId: string;

  updatedAt: string; // ISO timestamp

  financials: FinancialMetrics;

  modules: {
    accommodation?: AccommodationMetrics;
    fnb?: FnbMetrics;
  };

  metadata: {
    dataConfidence: number; // 0–100
    lastUpdatedBy?: string;
  };

  /**
   * Daily history for trend calculations
   * Contains 40 days of daily metrics for performance movement analysis
   */
  dailyHistory?: {
    dates: string[]; // ISO date strings
    revenue: number[]; // Daily revenue in THB
    costs: number[]; // Daily costs in THB
    occupancy?: number[]; // Daily occupancy rate (0-1) for accommodation
    customers?: number[]; // Daily customer count for F&B
    cashBalance: number[]; // Daily cash balance in THB
  };
}

// =============================
// SHARED FINANCIALS (Required)
// =============================

export interface FinancialMetrics {
  cashBalanceTHB: number;

  revenueLast30DaysTHB: number;
  costsLast30DaysTHB: number;

  revenueLast7DaysTHB?: number;
  costsLast7DaysTHB?: number;
}

// =============================
// ACCOMMODATION MODULE
// =============================

export interface AccommodationMetrics {
  occupancyRateLast30DaysPct: number; // %
  averageDailyRoomRateTHB: number;

  totalRoomsAvailable: number; // property capacity
  totalStaffAccommodation: number;
}

// =============================
// F&B MODULE
// =============================

export interface FnbMetrics {
  totalCustomersLast7Days: number;
  averageTicketPerCustomerTHB: number;

  totalStaffFnb: number;

  top3MenuRevenueShareLast30DaysPct: number; // %
}

// =============================
// ALERT DEPENDENCY MAPPING
// =============================

export type AlertKey =
  | "capacity_utilization"
  | "weekend_weekday_imbalance"
  | "seasonal_mismatch"
  | "low_weekday_utilization"
  | "fnb_gap"
  | "menu_revenue_concentration"
  | "cash_runway"
  | "liquidity_runway"
  | "break_even_risk"
  | "margin_compression"
  | "cost_pressure"
  | "demand_drop"
  | "revenue_concentration"
  | "cash_flow_volatility"
  | "seasonality_risk"
  | "data_confidence_risk";

/**
 * Alert Dependency Map
 * 
 * Each alert declares required field paths in dot notation
 * Example: "modules.accommodation.occupancyRateLast30DaysPct"
 */
export const AlertDependencies: Record<AlertKey, string[]> = {
  capacity_utilization: [
    "modules.accommodation.occupancyRateLast30DaysPct",
    "modules.accommodation.totalRoomsAvailable",
  ],

  weekend_weekday_imbalance: [
    "financials.revenueLast30DaysTHB",
    "modules.accommodation.averageDailyRoomRateTHB",
  ],

  seasonal_mismatch: [
    "financials.revenueLast30DaysTHB",
    "financials.revenueLast7DaysTHB",
  ],

  low_weekday_utilization: [
    "financials.revenueLast30DaysTHB",
    "modules.accommodation.occupancyRateLast30DaysPct",
  ],

  fnb_gap: [
    "financials.revenueLast30DaysTHB",
    "modules.fnb.totalCustomersLast7Days",
  ],

  menu_revenue_concentration: [
    "modules.fnb.top3MenuRevenueShareLast30DaysPct",
  ],

  cash_runway: [
    "financials.cashBalanceTHB",
    "financials.costsLast30DaysTHB",
  ],

  liquidity_runway: [
    "financials.cashBalanceTHB",
    "financials.costsLast30DaysTHB",
    "financials.revenueLast30DaysTHB",
  ],

  break_even_risk: [
    "financials.revenueLast30DaysTHB",
    "financials.costsLast30DaysTHB",
  ],

  margin_compression: [
    "financials.revenueLast30DaysTHB",
    "financials.costsLast30DaysTHB",
  ],

  cost_pressure: [
    "financials.costsLast30DaysTHB",
    "financials.costsLast7DaysTHB",
  ],

  demand_drop: [
    "financials.revenueLast30DaysTHB",
    "financials.revenueLast7DaysTHB",
    "modules.fnb.totalCustomersLast7Days",
  ],

  revenue_concentration: [
    "financials.revenueLast30DaysTHB",
  ],

  cash_flow_volatility: [
    "financials.revenueLast30DaysTHB",
    "financials.costsLast30DaysTHB",
    "financials.revenueLast7DaysTHB",
    "financials.costsLast7DaysTHB",
  ],

  seasonality_risk: [
    "financials.revenueLast30DaysTHB",
    "financials.revenueLast7DaysTHB",
  ],

  data_confidence_risk: [
    "metadata.dataConfidence",
  ],
};

/**
 * Get value from metrics object using dot notation path
 */
function getValueByPath(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

/**
 * Check if a value exists and is valid (not null, undefined, or NaN)
 */
function isValidValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number' && isNaN(value)) return false;
  return true;
}

/**
 * Validate metrics for a specific alert
 * 
 * @param alertKey Alert key to validate
 * @param metrics BranchMetrics object
 * @returns Object with missingFields array and canEvaluate boolean
 */
export function validateMetricsForAlert(
  alertKey: AlertKey,
  metrics: BranchMetrics
): {
  missingFields: string[];
  canEvaluate: boolean;
} {
  const dependencies = AlertDependencies[alertKey];
  if (!dependencies || dependencies.length === 0) {
    return { missingFields: [], canEvaluate: true };
  }

  const missingFields: string[] = [];

  for (const fieldPath of dependencies) {
    const value = getValueByPath(metrics, fieldPath);
    if (!isValidValue(value)) {
      missingFields.push(fieldPath);
    }
  }

  return {
    missingFields,
    canEvaluate: missingFields.length === 0,
  };
}

/**
 * Calculate data confidence based on alert dependency satisfaction
 * 
 * @param metrics BranchMetrics object
 * @returns Confidence score 0-100
 */
/**
 * Calculate data confidence based on alert dependency satisfaction
 * NEVER returns NaN, undefined, null, or values outside 0-100
 * 
 * @param metrics BranchMetrics object
 * @returns Confidence score 0-100
 */
export function calculateDataConfidence(metrics: BranchMetrics | null | undefined): number {
  // Defensive: Handle null/undefined metrics
  if (!metrics) {
    return 0;
  }

  try {
    const allAlerts: AlertKey[] = Object.keys(AlertDependencies) as AlertKey[];
    if (!Array.isArray(allAlerts) || allAlerts.length === 0) {
      return 0;
    }

    let satisfiedCount = 0;
    let totalCount = 0;

    for (const alertKey of allAlerts) {
      try {
        const { canEvaluate } = validateMetricsForAlert(alertKey, metrics);
        if (canEvaluate) {
          satisfiedCount++;
        }
        totalCount++;
      } catch (e) {
        // Skip invalid alert keys, but still count them
        totalCount++;
      }
    }

    if (totalCount === 0) {
      return 0;
    }

    // Calculate percentage of alerts that can be evaluated
    const dependencyScore = Math.round((satisfiedCount / totalCount) * 100);
    
    // Ensure dependencyScore is valid
    if (isNaN(dependencyScore) || !isFinite(dependencyScore)) {
      return 0;
    }

    // Combine with existing metadata confidence (if available)
    const existingConfidence = Math.max(0, Math.min(100, metrics.metadata?.dataConfidence || 0));
    
    // Ensure existingConfidence is valid
    if (isNaN(existingConfidence) || !isFinite(existingConfidence)) {
      return Math.max(0, Math.min(100, dependencyScore));
    }
    
    // Weighted average: 60% dependency satisfaction, 40% existing confidence
    const combinedConfidence = Math.round(
      (dependencyScore * 0.6) + (existingConfidence * 0.4)
    );

    // Final validation - NEVER return NaN, undefined, null, or values outside 0-100
    if (isNaN(combinedConfidence) || !isFinite(combinedConfidence)) {
      return 0; // Safe fallback
    }

    return Math.max(0, Math.min(100, combinedConfidence));
  } catch (e) {
    // Ultimate fallback if any error occurs
    return 0;
  }
}
