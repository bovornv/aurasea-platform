/**
 * Simulation Library
 * 
 * Static presets for simulation mode.
 * Contains only aggregated metrics (no daily arrays).
 * Pure, deterministic, hook-safe.
 */

import type { BranchMetrics } from '../../apps/web/app/models/branch-metrics';

export type SimulationPreset = 'big_accommodation' | 'fnb_multi_branch' | 'accommodation_with_fnb';
export type SimulationScenario = 'healthy' | 'stressed' | 'crisis';

/**
 * Expected validation results for each preset/scenario combination
 */
export interface SimulationExpected {
  healthScoreRange: [number, number];
  expectedAlerts: string[];
  forbiddenAlerts?: string[];
  minRevenueExposure?: number;
}

/**
 * Expected results by preset and scenario
 */
export const SIMULATION_EXPECTED: Record<SimulationPreset, Record<SimulationScenario, SimulationExpected>> = {
  big_accommodation: {
    healthy: {
      healthScoreRange: [80, 100],
      expectedAlerts: [],
      forbiddenAlerts: ['liquidity_runway', 'cash_runway', 'demand_drop'],
    },
    stressed: {
      healthScoreRange: [50, 80],
      expectedAlerts: [],
      forbiddenAlerts: ['liquidity_runway'], // Should not have critical liquidity issues yet
    },
    crisis: {
      healthScoreRange: [0, 50],
      expectedAlerts: ['liquidity_runway', 'demand_drop'],
      minRevenueExposure: 50000,
    },
  },
  fnb_multi_branch: {
    healthy: {
      healthScoreRange: [80, 100],
      expectedAlerts: [],
      forbiddenAlerts: ['liquidity_runway', 'cash_runway', 'demand_drop'],
    },
    stressed: {
      healthScoreRange: [50, 80],
      expectedAlerts: [],
      forbiddenAlerts: ['liquidity_runway'],
    },
    crisis: {
      healthScoreRange: [0, 50],
      expectedAlerts: ['liquidity_runway', 'demand_drop'],
      minRevenueExposure: 30000,
    },
  },
  accommodation_with_fnb: {
    healthy: {
      healthScoreRange: [80, 100],
      expectedAlerts: [],
      forbiddenAlerts: ['liquidity_runway', 'cash_runway', 'demand_drop'],
    },
    stressed: {
      healthScoreRange: [50, 80],
      expectedAlerts: [],
      forbiddenAlerts: ['liquidity_runway'],
    },
    crisis: {
      healthScoreRange: [0, 50],
      expectedAlerts: ['liquidity_runway', 'demand_drop'],
      minRevenueExposure: 40000,
    },
  },
};

/**
 * Base metrics for Big Standalone Accommodation
 */
const BIG_ACCOMMODATION_BASE: Omit<BranchMetrics, 'branchId' | 'groupId' | 'updatedAt'> = {
  financials: {
    cashBalanceTHB: 8_000_000,
    revenueLast30DaysTHB: 9_600_000, // 320k/day avg
    costsLast30DaysTHB: 6_720_000, // 70% of revenue
    revenueLast7DaysTHB: 2_240_000,
    costsLast7DaysTHB: 1_568_000,
  },
  modules: {
    accommodation: {
      occupancyRateLast30DaysPct: 68,
      averageDailyRoomRateTHB: 3_500,
      totalRoomsAvailable: 120,
      totalStaffAccommodation: 45,
    },
  },
  metadata: {
    dataConfidence: 95,
  },
};

/**
 * Base metrics for F&B Multi-Branch (3 branches)
 */
const FNB_MULTI_BRANCH_BASE: Array<Omit<BranchMetrics, 'branchId' | 'groupId' | 'updatedAt'>> = [
  {
    financials: {
      cashBalanceTHB: 2_500_000,
      revenueLast30DaysTHB: 1_800_000, // 60k/day avg
      costsLast30DaysTHB: 1_260_000, // 70% of revenue
      revenueLast7DaysTHB: 420_000,
      costsLast7DaysTHB: 294_000,
    },
    modules: {
      fnb: {
        totalCustomersLast7Days: 1000,
        averageTicketPerCustomerTHB: 420,
        totalStaffFnb: 12,
        top3MenuRevenueShareLast30DaysPct: 35,
      },
    },
    metadata: {
      dataConfidence: 92,
    },
  },
  {
    financials: {
      cashBalanceTHB: 1_800_000,
      revenueLast30DaysTHB: 1_500_000, // 50k/day avg
      costsLast30DaysTHB: 1_050_000,
      revenueLast7DaysTHB: 350_000,
      costsLast7DaysTHB: 245_000,
    },
    modules: {
      fnb: {
        totalCustomersLast7Days: 833,
        averageTicketPerCustomerTHB: 420,
        totalStaffFnb: 10,
        top3MenuRevenueShareLast30DaysPct: 45, // Higher concentration
      },
    },
    metadata: {
      dataConfidence: 88,
    },
  },
  {
    financials: {
      cashBalanceTHB: 1_200_000,
      revenueLast30DaysTHB: 1_200_000, // 40k/day avg
      costsLast30DaysTHB: 840_000,
      revenueLast7DaysTHB: 280_000,
      costsLast7DaysTHB: 196_000,
    },
    modules: {
      fnb: {
        totalCustomersLast7Days: 667,
        averageTicketPerCustomerTHB: 420,
        totalStaffFnb: 8,
        top3MenuRevenueShareLast30DaysPct: 55, // Highest concentration risk
      },
    },
    metadata: {
      dataConfidence: 85,
    },
  },
];

/**
 * Base metrics for Accommodation with F&B
 */
const ACCOMMODATION_WITH_FNB_BASE: Omit<BranchMetrics, 'branchId' | 'groupId' | 'updatedAt'> = {
  financials: {
    cashBalanceTHB: 5_000_000,
    revenueLast30DaysTHB: 7_200_000, // 240k/day avg (60% accommodation, 40% F&B)
    costsLast30DaysTHB: 5_040_000, // 70% of revenue
    revenueLast7DaysTHB: 1_680_000,
    costsLast7DaysTHB: 1_176_000,
  },
  modules: {
    accommodation: {
      occupancyRateLast30DaysPct: 65,
      averageDailyRoomRateTHB: 3_200,
      totalRoomsAvailable: 60,
      totalStaffAccommodation: 22,
    },
    fnb: {
      totalCustomersLast7Days: 800, // 40% of guests dine
      averageTicketPerCustomerTHB: 380,
      totalStaffFnb: 8,
      top3MenuRevenueShareLast30DaysPct: 42,
    },
  },
  metadata: {
    dataConfidence: 90,
  },
};

/**
 * Scenario multipliers
 */
const SCENARIO_MULTIPLIERS: Record<SimulationScenario, {
  revenue: number;
  costs: number;
  cash: number;
  occupancy?: number;
  adr?: number; // Average Daily Rate multiplier
  fnbCustomers?: number; // F&B customer volume multiplier
  fnbTicket?: number; // F&B average ticket multiplier
}> = {
  healthy: {
    revenue: 1.0,
    costs: 1.0,
    cash: 1.0,
    occupancy: 1.0,
    adr: 1.0,
    fnbCustomers: 1.0,
    fnbTicket: 1.0,
  },
  stressed: {
    revenue: 0.88, // -12% weekday revenue
    costs: 1.08, // +8% costs
    cash: 0.75, // -25% cash
    occupancy: 0.85, // -15% occupancy
    adr: 0.95, // -5% ADR
    fnbCustomers: 0.85, // -15% customer volume
    fnbTicket: 0.96, // -4% average ticket
  },
  crisis: {
    revenue: 0.65, // -35% revenue (more severe)
    costs: 1.15, // +15% costs
    cash: 0.50, // -50% cash
    occupancy: 0.70, // -30% occupancy (base 100% -> 70%)
    adr: 0.90, // -10% ADR
    fnbCustomers: 0.70, // -30% customer volume
    fnbTicket: 0.92, // -8% average ticket
  },
};

/**
 * Simulation Library
 * Static presets - no daily arrays, only aggregated metrics
 */
export const SIMULATION_LIBRARY: Record<
  SimulationPreset,
  {
    branches: Array<{
      branchName: string;
      baseMetrics: Omit<BranchMetrics, 'branchId' | 'groupId' | 'updatedAt'>;
    }>;
  }
> = {
  big_accommodation: {
    branches: [
      {
        branchName: 'Grand Hotel Bangkok',
        baseMetrics: BIG_ACCOMMODATION_BASE,
      },
    ],
  },
  fnb_multi_branch: {
    branches: FNB_MULTI_BRANCH_BASE.map((base, index) => ({
      branchName: ['Central Branch', 'Riverside Branch', 'Old Town Branch'][index] || `F&B Branch ${index + 1}`,
      baseMetrics: base,
    })),
  },
  accommodation_with_fnb: {
    branches: [
      {
        branchName: 'Boutique Hotel & Restaurant',
        baseMetrics: ACCOMMODATION_WITH_FNB_BASE,
      },
    ],
  },
};

/**
 * Get scenario multipliers
 */
export function getScenarioMultipliers(scenario: SimulationScenario) {
  return SCENARIO_MULTIPLIERS[scenario];
}
