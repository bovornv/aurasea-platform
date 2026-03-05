/**
 * Decision Engine Test Fixtures
 * 
 * Provides mock generators for testing decision engine scenarios.
 * Covers healthy branches, risk cases, edge cases, and error conditions.
 */

import type { BranchMetrics } from '../../apps/web/app/models/branch-metrics';

export interface DecisionEngineScenario {
  metrics: BranchMetrics;
  expectedHealthScore: {
    min: number;
    max: number;
  };
  expectedAlerts: {
    critical: number;
    warning: number;
    informational: number;
  };
  expectedRevenueExposure?: {
    min: number;
    max: number;
  };
  description: string;
}

/**
 * Generate Healthy Branch (Low Risk) Scenario
 * 
 * Expected:
 * - Health score > 85
 * - Revenue exposure < 3%
 * - No critical alerts
 */
function generateHealthyBranch(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-healthy-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 5_000_000,
        revenueLast30DaysTHB: 2_000_000,
        costsLast30DaysTHB: 1_500_000,
        revenueLast7DaysTHB: 466_667, // Stable weekly revenue
        costsLast7DaysTHB: 350_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 78,
          averageDailyRoomRateTHB: 3_200,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 12,
        },
        fnb: {
          totalCustomersLast7Days: 850,
          averageTicketPerCustomerTHB: 450,
          totalStaffFnb: 8,
          top3MenuRevenueShareLast30DaysPct: 28, // Well diversified
        },
      },
      metadata: {
        dataConfidence: 95,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 85,
      max: 100,
    },
    expectedAlerts: {
      critical: 0,
      warning: 0,
      informational: 0,
    },
    expectedRevenueExposure: {
      min: 0,
      max: 3,
    },
    description: 'Healthy Branch - Low risk, stable operations, good margins',
  };
}

/**
 * Generate Margin Compression Case
 * 
 * Expected:
 * - Revenue leakage ~150,000+
 * - Health score 60-75
 * - Margin compression alert with heavy impact
 */
function generateMarginCompression(): DecisionEngineScenario {
  const now = new Date();
  const revenue30d = 2_000_000;
  const costs30d = 1_950_000;
  const margin = ((revenue30d - costs30d) / revenue30d) * 100; // 2.5% margin (down from ~25%)
  
  return {
    metrics: {
      branchId: 'test-margin-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 800_000,
        revenueLast30DaysTHB: revenue30d,
        costsLast30DaysTHB: costs30d,
        revenueLast7DaysTHB: 466_667,
        costsLast7DaysTHB: 455_000, // Costs rising faster than revenue
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 72,
          averageDailyRoomRateTHB: 3_200,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 12,
        },
        fnb: {
          totalCustomersLast7Days: 850,
          averageTicketPerCustomerTHB: 450,
          totalStaffFnb: 8,
          top3MenuRevenueShareLast30DaysPct: 32,
        },
      },
      metadata: {
        dataConfidence: 90,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 60,
      max: 75,
    },
    expectedAlerts: {
      critical: 1, // Margin compression alert
      warning: 0,
      informational: 0,
    },
    expectedRevenueExposure: {
      min: 150_000,
      max: 200_000, // Revenue leakage from margin compression
    },
    description: `Margin Compression - Margin down to ${margin.toFixed(1)}% (from ~25%), costs rising faster than revenue`,
  };
}

/**
 * Generate Capacity Underutilization Case
 * 
 * Expected:
 * - Revenue exposure significant
 * - Capacity alert drives health score drop
 */
function generateCapacityUnderutilization(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-capacity-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 3_500_000,
        revenueLast30DaysTHB: 1_800_000, // Stable but low for capacity
        costsLast30DaysTHB: 1_600_000,
        revenueLast7DaysTHB: 420_000,
        costsLast7DaysTHB: 373_333,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 42, // Low utilization
          averageDailyRoomRateTHB: 3_200, // ADR stable
          totalRoomsAvailable: 60, // Large capacity
          totalStaffAccommodation: 15,
        },
        fnb: {
          totalCustomersLast7Days: 750,
          averageTicketPerCustomerTHB: 420,
          totalStaffFnb: 8,
          top3MenuRevenueShareLast30DaysPct: 35,
        },
      },
      metadata: {
        dataConfidence: 85,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 50,
      max: 70,
    },
    expectedAlerts: {
      critical: 1, // Capacity utilization alert
      warning: 1, // Low weekday utilization
      informational: 0,
    },
    expectedRevenueExposure: {
      min: 500_000,
      max: 800_000, // Significant revenue exposure from underutilization
    },
    description: 'Capacity Underutilization - 42% occupancy with 60 rooms available, significant revenue opportunity loss',
  };
}

/**
 * Generate Cash Runway Risk Case
 * 
 * Expected:
 * - Critical runway alert
 * - High impact weighting
 */
function generateCashRunwayRisk(): DecisionEngineScenario {
  const now = new Date();
  const cashBalance = 300_000;
  const monthlyCosts = 900_000;
  const runwayMonths = cashBalance / monthlyCosts; // ~0.33 months
  
  return {
    metrics: {
      branchId: 'test-cash-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: cashBalance,
        revenueLast30DaysTHB: 1_200_000,
        costsLast30DaysTHB: monthlyCosts,
        revenueLast7DaysTHB: 280_000,
        costsLast7DaysTHB: 210_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 65,
          averageDailyRoomRateTHB: 2_800,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 12,
        },
        fnb: {
          totalCustomersLast7Days: 650,
          averageTicketPerCustomerTHB: 400,
          totalStaffFnb: 8,
          top3MenuRevenueShareLast30DaysPct: 38,
        },
      },
      metadata: {
        dataConfidence: 88,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 20,
      max: 50,
    },
    expectedAlerts: {
      critical: 1, // Cash runway alert
      warning: 0,
      informational: 0,
    },
    expectedRevenueExposure: {
      min: 0,
      max: 0, // Not revenue exposure, but cash risk
    },
    description: `Cash Runway Risk - Only ${runwayMonths.toFixed(2)} months of runway remaining (${cashBalance.toLocaleString()} THB / ${monthlyCosts.toLocaleString()} THB monthly costs)`,
  };
}

/**
 * Generate F&B Revenue Concentration Case
 * 
 * Expected:
 * - Medium risk but lower financial exposure than margin compression
 */
function generateFnbConcentration(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-fnb-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 2_500_000,
        revenueLast30DaysTHB: 1_800_000,
        costsLast30DaysTHB: 1_400_000,
        revenueLast7DaysTHB: 420_000,
        costsLast7DaysTHB: 326_667,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 70,
          averageDailyRoomRateTHB: 3_000,
          totalRoomsAvailable: 35,
          totalStaffAccommodation: 10,
        },
        fnb: {
          totalCustomersLast7Days: 900,
          averageTicketPerCustomerTHB: 467,
          totalStaffFnb: 10,
          top3MenuRevenueShareLast30DaysPct: 68, // High concentration
        },
      },
      metadata: {
        dataConfidence: 87,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 70,
      max: 85,
    },
    expectedAlerts: {
      critical: 0,
      warning: 1, // Menu revenue concentration alert
      informational: 0,
    },
    expectedRevenueExposure: {
      min: 50_000,
      max: 150_000, // Lower exposure than margin compression
    },
    description: 'F&B Revenue Concentration - 68% of revenue from top 3 menu items, medium risk',
  };
}

/**
 * Generate Missing Data Case
 * 
 * Expected:
 * - Health score = 0
 * - Confidence = 0
 * - No crash
 */
function generateMissingData(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-missing-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 0, // Missing/unknown
        revenueLast30DaysTHB: 0, // Missing/unknown
        costsLast30DaysTHB: 0, // Missing/unknown
        // revenueLast7DaysTHB and costsLast7DaysTHB are optional, so omitted
      },
      modules: {
        // Both accommodation and fnb modules are optional, so omitted
        // This represents a branch with no module data
      },
      metadata: {
        dataConfidence: 0, // No confidence due to missing data
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 0,
      max: 0,
    },
    expectedAlerts: {
      critical: 0,
      warning: 0,
      informational: 0, // No alerts can be evaluated without required data
    },
    description: 'Missing Data - Partial metrics with null/undefined fields, should return safe defaults without crashing',
  };
}

/**
 * Generate Extreme NaN Case
 * 
 * Expected:
 * - No crash
 * - safeNumber applied
 * - status: insufficient_data
 */
function generateCorruptedData(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-corrupted-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: NaN as any, // Corrupted
        revenueLast30DaysTHB: undefined as any, // Corrupted
        costsLast30DaysTHB: null as any, // Corrupted
        revenueLast7DaysTHB: Infinity as any, // Corrupted
        costsLast7DaysTHB: -Infinity as any, // Corrupted
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: NaN as any, // Corrupted
          averageDailyRoomRateTHB: undefined as any, // Corrupted
          totalRoomsAvailable: null as any, // Corrupted
          totalStaffAccommodation: Infinity as any, // Corrupted
        },
        fnb: {
          totalCustomersLast7Days: NaN as any, // Corrupted
          averageTicketPerCustomerTHB: undefined as any, // Corrupted
          totalStaffFnb: null as any, // Corrupted
          top3MenuRevenueShareLast30DaysPct: Infinity as any, // Corrupted
        },
      },
      metadata: {
        dataConfidence: NaN as any, // Corrupted
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 0,
      max: 0,
    },
    expectedAlerts: {
      critical: 0,
      warning: 0,
      informational: 0, // No alerts can be evaluated
    },
    description: 'Corrupted Data - Extreme NaN/undefined/Infinity values, should be handled safely without crashes',
  };
}

/**
 * Generate Decision Engine Scenario
 * 
 * @param type - Scenario type
 * @returns DecisionEngineScenario with metrics and expected outcomes
 */
export function generateDecisionEngineScenario(
  type: 'healthy' | 'margin' | 'capacity' | 'cash' | 'fnb_concentration' | 'missing' | 'corrupted' |
       'boundary_80' | 'boundary_60' | 'boundary_40' | 'zero_values' | 'max_penalty' | 'partial_module' | 'stale_data' | 'extreme_values' | 'multiple_issues'
): DecisionEngineScenario {
  switch (type) {
    case 'healthy':
      return generateHealthyBranch();
    
    case 'margin':
      return generateMarginCompression();
    
    case 'capacity':
      return generateCapacityUnderutilization();
    
    case 'cash':
      return generateCashRunwayRisk();
    
    case 'fnb_concentration':
      return generateFnbConcentration();
    
    case 'missing':
      return generateMissingData();
    
    case 'corrupted':
      return generateCorruptedData();
    
    case 'boundary_80':
      return generateBoundaryCase(80);
    
    case 'boundary_60':
      return generateBoundaryCase(60);
    
    case 'boundary_40':
      return generateBoundaryCase(40);
    
    case 'zero_values':
      return generateZeroValuesCase();
    
    case 'max_penalty':
      return generateMaximumPenaltyCase();
    
    case 'partial_module':
      return generatePartialModuleCase();
    
    case 'stale_data':
      return generateStaleDataCase();
    
    case 'extreme_values':
      return generateExtremeValuesCase();
    
    case 'multiple_issues':
      return generateMultipleIssuesCase();
    
    default:
      throw new Error(`Unknown scenario type: ${type}. Valid types: ${getAvailableScenarioTypes().join(', ')}`);
  }
}

/**
 * Generate Boundary Case: Exactly at Health Score Thresholds
 * Tests edge cases at score boundaries (80, 60, 40)
 */
function generateBoundaryCase(threshold: 80 | 60 | 40): DecisionEngineScenario {
  const now = new Date();
  
  // Calculate metrics that would result in exactly the threshold score
  // Score 80 = Healthy threshold
  // Score 60 = Stable threshold  
  // Score 40 = At Risk threshold
  
  let metrics: BranchMetrics;
  let expectedScore: { min: number; max: number };
  
  if (threshold === 80) {
    // Exactly at Healthy/Stable boundary - minimal penalties
    metrics = {
      branchId: 'test-boundary-80',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 3_000_000,
        revenueLast30DaysTHB: 1_800_000,
        costsLast30DaysTHB: 1_500_000,
        revenueLast7DaysTHB: 420_000,
        costsLast7DaysTHB: 350_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 70,
          averageDailyRoomRateTHB: 3_000,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 10,
        },
      },
      metadata: {
        dataConfidence: 85,
        lastUpdatedBy: 'test-user',
      },
    };
    expectedScore = { min: 78, max: 82 }; // Allow small variance
  } else if (threshold === 60) {
    // Exactly at Stable/At Risk boundary
    metrics = {
      branchId: 'test-boundary-60',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 1_200_000,
        revenueLast30DaysTHB: 1_500_000,
        costsLast30DaysTHB: 1_400_000,
        revenueLast7DaysTHB: 350_000,
        costsLast7DaysTHB: 326_667,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 55,
          averageDailyRoomRateTHB: 2_800,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 10,
        },
      },
      metadata: {
        dataConfidence: 75,
        lastUpdatedBy: 'test-user',
      },
    };
    expectedScore = { min: 58, max: 62 };
  } else {
    // Exactly at At Risk/Critical boundary (40)
    metrics = {
      branchId: 'test-boundary-40',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 600_000,
        revenueLast30DaysTHB: 1_200_000,
        costsLast30DaysTHB: 1_100_000,
        revenueLast7DaysTHB: 280_000,
        costsLast7DaysTHB: 256_667,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 45,
          averageDailyRoomRateTHB: 2_500,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 10,
        },
      },
      metadata: {
        dataConfidence: 65,
        lastUpdatedBy: 'test-user',
      },
    };
    expectedScore = { min: 38, max: 42 };
  }
  
  return {
    metrics,
    expectedHealthScore: expectedScore,
    expectedAlerts: {
      critical: threshold === 40 ? 1 : 0,
      warning: threshold === 60 || threshold === 40 ? 1 : 0,
      informational: 0,
    },
    description: `Boundary Case - Health score exactly at ${threshold} threshold (${threshold === 80 ? 'Healthy/Stable' : threshold === 60 ? 'Stable/At Risk' : 'At Risk/Critical'} boundary)`,
  };
}

/**
 * Generate Zero Values Case
 * Valid zeros (not missing, but actually zero)
 */
function generateZeroValuesCase(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-zero-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 0, // Valid zero (not missing)
        revenueLast30DaysTHB: 0, // Valid zero
        costsLast30DaysTHB: 0, // Valid zero
        revenueLast7DaysTHB: 0,
        costsLast7DaysTHB: 0,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 0, // Valid zero
          averageDailyRoomRateTHB: 0,
          totalRoomsAvailable: 0,
          totalStaffAccommodation: 0,
        },
        fnb: {
          totalCustomersLast7Days: 0,
          averageTicketPerCustomerTHB: 0,
          totalStaffFnb: 0,
          top3MenuRevenueShareLast30DaysPct: 0,
        },
      },
      metadata: {
        dataConfidence: 0,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 0,
      max: 20, // Minimum score is 20
    },
    expectedAlerts: {
      critical: 1, // Should trigger critical alerts
      warning: 0,
      informational: 0,
    },
    description: 'Zero Values - Valid zeros (not missing), should trigger alerts but not crash',
  };
}

/**
 * Generate Maximum Penalty Case
 * Multiple critical alerts pushing score to minimum (20)
 */
function generateMaximumPenaltyCase(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-max-penalty-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 100_000, // Very low
        revenueLast30DaysTHB: 800_000,
        costsLast30DaysTHB: 900_000, // Costs exceed revenue
        revenueLast7DaysTHB: 186_667,
        costsLast7DaysTHB: 210_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 25, // Very low
          averageDailyRoomRateTHB: 1_500,
          totalRoomsAvailable: 60, // Large capacity, low utilization
          totalStaffAccommodation: 15,
        },
        fnb: {
          totalCustomersLast7Days: 200, // Very low
          averageTicketPerCustomerTHB: 200,
          totalStaffFnb: 10,
          top3MenuRevenueShareLast30DaysPct: 75, // High concentration
        },
      },
      metadata: {
        dataConfidence: 50,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 20,
      max: 30, // Should be near minimum
    },
    expectedAlerts: {
      critical: 3, // Multiple critical alerts
      warning: 2,
      informational: 0,
    },
    description: 'Maximum Penalty - Multiple critical alerts, score should be near minimum (20)',
  };
}

/**
 * Generate Partial Module Data Case
 * Only accommodation module (no F&B)
 */
function generatePartialModuleCase(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-partial-module-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 2_500_000,
        revenueLast30DaysTHB: 1_500_000,
        costsLast30DaysTHB: 1_200_000,
        revenueLast7DaysTHB: 350_000,
        costsLast7DaysTHB: 280_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 65,
          averageDailyRoomRateTHB: 3_000,
          totalRoomsAvailable: 35,
          totalStaffAccommodation: 10,
        },
        // fnb module intentionally omitted
      },
      metadata: {
        dataConfidence: 80,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 70,
      max: 90,
    },
    expectedAlerts: {
      critical: 0,
      warning: 0,
      informational: 0,
    },
    description: 'Partial Module Data - Only accommodation module, no F&B data',
  };
}

/**
 * Generate Stale Data Case
 * Very old data (beyond freshness threshold)
 */
function generateStaleDataCase(): DecisionEngineScenario {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  return {
    metrics: {
      branchId: 'test-stale-001',
      groupId: 'test-group-001',
      updatedAt: thirtyDaysAgo.toISOString(), // 30 days old
      financials: {
        cashBalanceTHB: 2_000_000,
        revenueLast30DaysTHB: 1_800_000,
        costsLast30DaysTHB: 1_500_000,
        revenueLast7DaysTHB: 420_000,
        costsLast7DaysTHB: 350_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 70,
          averageDailyRoomRateTHB: 3_000,
          totalRoomsAvailable: 40,
          totalStaffAccommodation: 12,
        },
      },
      metadata: {
        dataConfidence: 30, // Low confidence due to stale data
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 70,
      max: 90,
    },
    expectedAlerts: {
      critical: 0,
      warning: 1, // Data confidence risk alert
      informational: 0,
    },
    description: 'Stale Data - Data older than 7 days, should have low confidence',
  };
}

/**
 * Generate Extreme Values Case
 * Very high but valid values
 */
function generateExtremeValuesCase(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-extreme-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 50_000_000, // Very high
        revenueLast30DaysTHB: 20_000_000, // Very high
        costsLast30DaysTHB: 15_000_000,
        revenueLast7DaysTHB: 4_666_667,
        costsLast7DaysTHB: 3_500_000,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 95, // Very high
          averageDailyRoomRateTHB: 10_000, // Very high
          totalRoomsAvailable: 200, // Large property
          totalStaffAccommodation: 50,
        },
        fnb: {
          totalCustomersLast7Days: 5000, // Very high
          averageTicketPerCustomerTHB: 1000, // Very high
          totalStaffFnb: 30,
          top3MenuRevenueShareLast30DaysPct: 25, // Well diversified
        },
      },
      metadata: {
        dataConfidence: 98,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 85,
      max: 100,
    },
    expectedAlerts: {
      critical: 0,
      warning: 0,
      informational: 0,
    },
    description: 'Extreme Values - Very high but valid values, should handle large numbers correctly',
  };
}

/**
 * Generate Multiple Simultaneous Issues Case
 * Multiple different alert types at once
 */
function generateMultipleIssuesCase(): DecisionEngineScenario {
  const now = new Date();
  
  return {
    metrics: {
      branchId: 'test-multiple-001',
      groupId: 'test-group-001',
      updatedAt: now.toISOString(),
      financials: {
        cashBalanceTHB: 500_000, // Low cash
        revenueLast30DaysTHB: 1_500_000,
        costsLast30DaysTHB: 1_600_000, // Costs exceed revenue
        revenueLast7DaysTHB: 350_000,
        costsLast7DaysTHB: 373_333,
      },
      modules: {
        accommodation: {
          occupancyRateLast30DaysPct: 38, // Low utilization
          averageDailyRoomRateTHB: 2_500,
          totalRoomsAvailable: 50, // Large capacity
          totalStaffAccommodation: 12,
        },
        fnb: {
          totalCustomersLast7Days: 600, // Low volume
          averageTicketPerCustomerTHB: 350,
          totalStaffFnb: 8,
          top3MenuRevenueShareLast30DaysPct: 65, // High concentration
        },
      },
      metadata: {
        dataConfidence: 70,
        lastUpdatedBy: 'test-user',
      },
    },
    expectedHealthScore: {
      min: 30,
      max: 50,
    },
    expectedAlerts: {
      critical: 2, // Cash runway + break-even risk
      warning: 2, // Capacity + menu concentration
      informational: 0,
    },
    description: 'Multiple Simultaneous Issues - Multiple different alert types triggering simultaneously',
  };
}

/**
 * Get all available scenario types
 */
export function getAvailableScenarioTypes(): Array<
  'healthy' | 'margin' | 'capacity' | 'cash' | 'fnb_concentration' | 'missing' | 'corrupted' |
  'boundary_80' | 'boundary_60' | 'boundary_40' | 'zero_values' | 'max_penalty' | 'partial_module' | 'stale_data' | 'extreme_values' | 'multiple_issues'
> {
  return [
    'healthy', 
    'margin', 
    'capacity', 
    'cash', 
    'fnb_concentration', 
    'missing', 
    'corrupted',
    'boundary_80',
    'boundary_60',
    'boundary_40',
    'zero_values',
    'max_penalty',
    'partial_module',
    'stale_data',
    'extreme_values',
    'multiple_issues',
  ];
}

/**
 * Generate multiple scenarios at once
 */
export function generateMultipleScenarios(
  types: Array<
    'healthy' | 'margin' | 'capacity' | 'cash' | 'fnb_concentration' | 'missing' | 'corrupted' |
    'boundary_80' | 'boundary_60' | 'boundary_40' | 'zero_values' | 'max_penalty' | 'partial_module' | 'stale_data' | 'extreme_values' | 'multiple_issues'
  >
): DecisionEngineScenario[] {
  return types.map(type => generateDecisionEngineScenario(type));
}

/**
 * Generate all scenarios
 */
export function generateAllScenarios(): DecisionEngineScenario[] {
  return generateMultipleScenarios(getAvailableScenarioTypes());
}
