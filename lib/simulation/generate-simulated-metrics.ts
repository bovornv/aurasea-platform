/**
 * Generate Simulated Metrics
 * 
 * Pure, synchronous function to generate BranchMetrics from simulation presets.
 * No React imports, no side effects, no async operations.
 * 
 * This function:
 * - Takes preset, scenario, and adjustments
 * - Returns a new BranchMetrics object
 * - Never mutates input
 * - Always returns valid metrics (no NaN, no undefined)
 */

import type { BranchMetrics } from '../../apps/web/app/models/branch-metrics';
import type { SimulationPreset, SimulationScenario } from './simulation-library';
import { SIMULATION_LIBRARY, getScenarioMultipliers } from './simulation-library';

export interface SimulationAdjustments {
  revenueMultiplier?: number; // 0.5 - 1.5
  costMultiplier?: number; // 0.5 - 1.5
  cashAdjustment?: number; // THB adjustment
}

/**
 * Cache for generated metrics to avoid redundant calculations
 * Key: JSON string of (preset, scenario, adjustments, businessGroupId)
 */
let metricsCache: Map<string, Array<{ branchId: string; branchName: string; metrics: BranchMetrics }>> = new Map();

/**
 * Generate cache key from function parameters
 */
function getCacheKey(
  preset: SimulationPreset | null,
  scenario: SimulationScenario,
  adjustments: SimulationAdjustments,
  businessGroupId: string
): string {
  return JSON.stringify({
    preset,
    scenario,
    adjustments: {
      revenueMultiplier: adjustments.revenueMultiplier ?? null,
      costMultiplier: adjustments.costMultiplier ?? null,
      cashAdjustment: adjustments.cashAdjustment ?? null,
    },
    businessGroupId,
  });
}

/**
 * Clear the metrics cache (useful for testing or when simulation parameters change)
 */
export function clearMetricsCache(): void {
  metricsCache.clear();
}

/**
 * Safe number coercion - ensures no NaN or undefined
 */
function safeNumber(value: number | undefined | null, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return fallback;
  }
  return value;
}

/**
 * Apply multiplier with bounds
 */
function applyMultiplier(value: number, multiplier: number | undefined, min: number = 0, max: number = Infinity): number {
  const mult = safeNumber(multiplier, 1);
  const result = value * mult;
  return Math.max(min, Math.min(max, result));
}

/**
 * Generate simulated metrics for a single branch
 */
function generateBranchMetrics(
  baseMetrics: Omit<BranchMetrics, 'branchId' | 'groupId' | 'updatedAt'>,
  scenario: SimulationScenario,
  adjustments: SimulationAdjustments,
  branchId: string,
  groupId: string
): BranchMetrics {
  const scenarioMultipliers = getScenarioMultipliers(scenario);
  const isCrisis = scenario === 'crisis';
  
  // STEP 1: For crisis scenario, enforce proper degradation
  let revenue30d: number;
  let costs30d: number;
  let cashBalance: number;
  
  if (isCrisis) {
    // Revenue drops 40-60% (random between 0.4 and 0.6)
    const revenueDropMultiplier = 0.4 + (Math.random() * 0.2); // 0.4 to 0.6
    // Costs increase 15-25% (random between 1.15 and 1.25)
    const costIncreaseMultiplier = 1.15 + (Math.random() * 0.1); // 1.15 to 1.25
    
    // Apply crisis multipliers
    revenue30d = baseMetrics.financials.revenueLast30DaysTHB * revenueDropMultiplier;
    costs30d = baseMetrics.financials.costsLast30DaysTHB * costIncreaseMultiplier;
    
    // Cash balance declines - calculate burn rate and ensure runway < 1 month
    const monthlyBurnRate = costs30d - revenue30d;
    const targetRunwayMonths = 0.5 + (Math.random() * 0.4); // 0.5 to 0.9 months
    cashBalance = Math.max(0, monthlyBurnRate * targetRunwayMonths);
    
    // Apply user adjustments on top of crisis base
    revenue30d = applyMultiplier(revenue30d, adjustments.revenueMultiplier, 0);
    costs30d = applyMultiplier(costs30d, adjustments.costMultiplier, 0);
    cashBalance = safeNumber(cashBalance) + safeNumber(adjustments.cashAdjustment);
    
    if (process.env.NODE_ENV === 'development') {
      const finalBurnRate = costs30d - revenue30d;
      const runwayMonths = finalBurnRate > 0 ? cashBalance / finalBurnRate : Infinity;
      console.log(`[CRISIS DEBUG] Crisis metrics enforced:`, {
        branchId,
        revenueDrop: `${((1 - revenueDropMultiplier) * 100).toFixed(1)}%`,
        costIncrease: `${((costIncreaseMultiplier - 1) * 100).toFixed(1)}%`,
        monthlyBurnRate: Math.round(finalBurnRate).toLocaleString('en-US'),
        cashBalance: Math.round(cashBalance).toLocaleString('en-US'),
        runwayMonths: runwayMonths.toFixed(2),
        margin: revenue30d > 0 ? `${(((revenue30d - costs30d) / revenue30d) * 100).toFixed(1)}%` : 'N/A',
      });
    }
  } else {
    // Apply scenario multipliers for non-crisis scenarios
    revenue30d = baseMetrics.financials.revenueLast30DaysTHB * scenarioMultipliers.revenue;
    costs30d = baseMetrics.financials.costsLast30DaysTHB * scenarioMultipliers.costs;
    cashBalance = baseMetrics.financials.cashBalanceTHB * scenarioMultipliers.cash;
    
    // Apply user adjustments
    revenue30d = applyMultiplier(revenue30d, adjustments.revenueMultiplier, 0);
    costs30d = applyMultiplier(costs30d, adjustments.costMultiplier, 0);
    cashBalance = safeNumber(cashBalance) + safeNumber(adjustments.cashAdjustment);
  }
  
  // Apply user adjustments
  revenue30d = applyMultiplier(revenue30d, adjustments.revenueMultiplier, 0);
  costs30d = applyMultiplier(costs30d, adjustments.costMultiplier, 0);
  cashBalance = safeNumber(cashBalance) + safeNumber(adjustments.cashAdjustment);
  
  // Calculate 7-day values (proportional to 30-day)
  const revenue7d = (revenue30d / 30) * 7;
  const costs7d = (costs30d / 30) * 7;
  
  // Build new metrics object (never mutate input)
  // IMPORTANT: Preserve modules from baseMetrics to ensure correct module detection
  const metrics: BranchMetrics = {
    branchId,
    groupId,
    updatedAt: new Date().toISOString(),
    financials: {
      cashBalanceTHB: Math.max(0, safeNumber(cashBalance)),
      revenueLast30DaysTHB: Math.max(0, safeNumber(revenue30d)),
      costsLast30DaysTHB: Math.max(0, safeNumber(costs30d)),
      revenueLast7DaysTHB: Math.max(0, safeNumber(revenue7d)),
      costsLast7DaysTHB: Math.max(0, safeNumber(costs7d)),
    },
    modules: {}, // Initialize empty, will populate below
    metadata: {
      dataConfidence: safeNumber(baseMetrics.metadata?.dataConfidence, 0),
    },
  };
  
  // Apply occupancy multiplier if accommodation module exists
  // CRITICAL: Only copy if baseMetrics has accommodation module
  // Check explicitly for existence and that it's not an empty object
  if (baseMetrics.modules.accommodation && 
      typeof baseMetrics.modules.accommodation === 'object' &&
      Object.keys(baseMetrics.modules.accommodation).length > 0) {
    const baseOccupancy = baseMetrics.modules.accommodation.occupancyRateLast30DaysPct;
    const occupancyMultiplier = scenarioMultipliers.occupancy || 1.0;
    const adjustedOccupancy = Math.max(0, Math.min(100, baseOccupancy * occupancyMultiplier));
    
    // Apply ADR multiplier for crisis scenario
    const adrMultiplier = scenarioMultipliers.adr || 1.0;
    const baseADR = safeNumber(baseMetrics.modules.accommodation.averageDailyRoomRateTHB);
    const adjustedADR = baseADR * adrMultiplier;
    
    metrics.modules.accommodation = {
      occupancyRateLast30DaysPct: safeNumber(adjustedOccupancy),
      averageDailyRoomRateTHB: safeNumber(adjustedADR),
      totalRoomsAvailable: safeNumber(baseMetrics.modules.accommodation.totalRoomsAvailable),
      totalStaffAccommodation: safeNumber(baseMetrics.modules.accommodation.totalStaffAccommodation),
    };
  }
  
  // Apply F&B scenario multipliers (customer volume and ticket size)
  // CRITICAL: Only copy if baseMetrics has F&B module
  // Check explicitly for existence and that it's not an empty object
  if (baseMetrics.modules.fnb &&
      typeof baseMetrics.modules.fnb === 'object' &&
      Object.keys(baseMetrics.modules.fnb).length > 0) {
    const fnbCustomersMultiplier = scenarioMultipliers.fnbCustomers || 1.0;
    const fnbTicketMultiplier = scenarioMultipliers.fnbTicket || 1.0;
    
    const baseCustomers = safeNumber(baseMetrics.modules.fnb.totalCustomersLast7Days);
    const baseTicket = safeNumber(baseMetrics.modules.fnb.averageTicketPerCustomerTHB);
    
    metrics.modules.fnb = {
      totalCustomersLast7Days: safeNumber(baseCustomers * fnbCustomersMultiplier),
      averageTicketPerCustomerTHB: safeNumber(baseTicket * fnbTicketMultiplier),
      totalStaffFnb: safeNumber(baseMetrics.modules.fnb.totalStaffFnb),
      top3MenuRevenueShareLast30DaysPct: safeNumber(baseMetrics.modules.fnb.top3MenuRevenueShareLast30DaysPct),
    };
  }
  
  // Generate 40 days of daily history for trend calculations
  const dates: string[] = [];
  const revenue: number[] = [];
  const costs: number[] = [];
  const occupancy: number[] = [];
  const customers: number[] = [];
  const cashBalanceHistory: number[] = [];
  
  const today = new Date();
  const baseDailyRevenue = safeNumber(revenue30d) / 30;
  const baseDailyCosts = safeNumber(costs30d) / 30;
  const baseCashBalanceValue = safeNumber(cashBalance);
  
  // Scenario-specific daily history generation
  // Each scenario shows distinct trends over 40 days
  const isStressed = scenario === 'stressed';
  const isHealthy = scenario === 'healthy';
  
  // Define scenario-specific trend parameters
  let revenueStartMultiplier: number;
  let revenueEndMultiplier: number;
  let costStartMultiplier: number;
  let costEndMultiplier: number;
  
  if (isCrisis) {
    // Crisis: Revenue continues to deteriorate (100% → 95%), costs continue increasing (100% → 103%)
    revenueStartMultiplier = 1.0;
    revenueEndMultiplier = 0.95;
    costStartMultiplier = 1.0;
    costEndMultiplier = 1.03;
  } else if (isStressed) {
    // Stressed: Revenue declines slightly (100% → 96%), costs increase (100% → 102%)
    revenueStartMultiplier = 1.0;
    revenueEndMultiplier = 0.96;
    costStartMultiplier = 1.0;
    costEndMultiplier = 1.02;
  } else {
    // Healthy: Revenue improves (95% → 100%), costs improve slightly (100% → 98%)
    revenueStartMultiplier = 0.95;
    revenueEndMultiplier = 1.0;
    costStartMultiplier = 1.0;
    costEndMultiplier = 0.98;
  }
  
  // Generate 40 days with realistic variation
  for (let i = 0; i < 40; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (39 - i)); // Day 0 = 39 days ago, Day 39 = today
    dates.push(date.toISOString().split('T')[0]);
    
    // Progress from start (0) to end (1) over 40 days
    const progress = i / 39;
    
    // Revenue trend multiplier (interpolates from start to end)
    const revenueTrendMultiplier = revenueStartMultiplier + (progress * (revenueEndMultiplier - revenueStartMultiplier));
    
    // Cost trend multiplier (interpolates from start to end)
    const costTrendMultiplier = costStartMultiplier + (progress * (costEndMultiplier - costStartMultiplier));
    
    // Add day-of-week variation (±10%)
    const dayOfWeek = date.getDay();
    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.1 : 0.95;
    
    // Daily revenue with variation
    const dailyRev = baseDailyRevenue * revenueTrendMultiplier * weekendMultiplier * (0.9 + (Math.random() * 0.2));
    revenue.push(Math.max(0, safeNumber(dailyRev)));
    
    // Daily costs with variation
    const dailyCost = baseDailyCosts * costTrendMultiplier * (0.95 + (Math.random() * 0.1));
    costs.push(Math.max(0, safeNumber(dailyCost)));
    
    // Cash balance (cumulative effect)
    // STEP 1: For crisis, ensure cash declines each day (burn rate negative)
    let currentCashBalance: number;
    if (isCrisis) {
      // Daily burn = daily costs - daily revenue (should be positive in crisis)
      const dailyBurn = dailyCost - dailyRev;
      // Cash declines by daily burn - start from baseCashBalanceValue and decline
      if (i === 0) {
        currentCashBalance = baseCashBalanceValue;
      } else {
        const previousCash = cashBalanceHistory[i - 1] || baseCashBalanceValue;
        currentCashBalance = Math.max(0, previousCash - dailyBurn);
      }
    } else {
      // For non-crisis, use cumulative calculation
      const cumulativeRevenue = revenue.slice(0, i + 1).reduce((sum, r) => sum + r, 0);
      const cumulativeCosts = costs.slice(0, i + 1).reduce((sum, c) => sum + c, 0);
      currentCashBalance = baseCashBalanceValue + cumulativeRevenue - cumulativeCosts;
    }
    
    cashBalanceHistory.push(Math.max(0, safeNumber(currentCashBalance)));
    
    // Occupancy (if accommodation)
    // Scenario-aware: follows revenue trend pattern
    if (metrics.modules.accommodation) {
      const baseOccupancyRate = safeNumber(metrics.modules.accommodation.occupancyRateLast30DaysPct) / 100;
      const occupancyMultiplier = revenueTrendMultiplier; // Follows revenue trend
      const dailyOccupancy = baseOccupancyRate * occupancyMultiplier * weekendMultiplier * (0.9 + (Math.random() * 0.2));
      occupancy.push(Math.max(0, Math.min(1, safeNumber(dailyOccupancy))));
    }
    
    // Customers (if F&B)
    // Scenario-aware: follows revenue trend pattern
    if (metrics.modules.fnb) {
      const baseDailyCustomers = safeNumber(metrics.modules.fnb.totalCustomersLast7Days) / 7;
      const customerMultiplier = revenueTrendMultiplier; // Follows revenue trend
      const dailyCustomers = baseDailyCustomers * customerMultiplier * weekendMultiplier * (0.9 + (Math.random() * 0.2));
      customers.push(Math.max(0, Math.round(safeNumber(dailyCustomers))));
    }
  }
  
  // Add dailyHistory to metrics
  metrics.dailyHistory = {
    dates,
    revenue,
    costs,
    cashBalance: cashBalanceHistory,
    ...(metrics.modules.accommodation ? { occupancy } : {}),
    ...(metrics.modules.fnb ? { customers } : {}),
  };
  
  // STEP 1: Debug console logging for simulation data validation
  if (process.env.NODE_ENV === 'development') {
    const hasAccommodation = !!metrics.modules.accommodation && Object.keys(metrics.modules.accommodation).length > 0;
    const hasFnb = !!metrics.modules.fnb && Object.keys(metrics.modules.fnb).length > 0;
    console.log(`[SIMULATION] Generated metrics for ${branchId}: accommodation=${hasAccommodation}, fnb=${hasFnb}`);
    console.log(`[SIMULATION]   Daily history: ${metrics.dailyHistory.dates.length} days`);
    
    // SIMULATION DATA CHECK
    console.log('SIMULATION DATA CHECK:', {
      scenario,
      branchId,
      revenueFirst7: metrics.dailyHistory.revenue.slice(0, 7),
      costFirst7: metrics.dailyHistory.costs.slice(0, 7),
      occupancyFirst7: metrics.dailyHistory.occupancy?.slice(0, 7),
      cashFirst7: metrics.dailyHistory.cashBalance.slice(0, 7),
      revenueLast7: metrics.dailyHistory.revenue.slice(-7),
      costLast7: metrics.dailyHistory.costs.slice(-7),
      occupancyLast7: metrics.dailyHistory.occupancy?.slice(-7),
      cashLast7: metrics.dailyHistory.cashBalance.slice(-7),
      monthlyRevenue: metrics.financials.revenueLast30DaysTHB,
      monthlyCosts: metrics.financials.costsLast30DaysTHB,
      cashBalance: metrics.financials.cashBalanceTHB,
    });
    
    if (hasAccommodation) {
      console.log(`[SIMULATION]   Accommodation data:`, metrics.modules.accommodation);
    }
    if (hasFnb) {
      console.log(`[SIMULATION]   F&B data:`, metrics.modules.fnb);
    }
  }
  
  // STEP 1 & 7: Sanity check validator and debug logging for crisis scenario
  if (scenario === 'crisis') {
    const revenue30d = metrics.financials.revenueLast30DaysTHB;
    const costs30d = metrics.financials.costsLast30DaysTHB;
    const cashBalance = metrics.financials.cashBalanceTHB;
    const margin = revenue30d > 0 ? ((revenue30d - costs30d) / revenue30d) * 100 : 0;
    const revenueDrop = baseMetrics.financials.revenueLast30DaysTHB > 0
      ? ((baseMetrics.financials.revenueLast30DaysTHB - revenue30d) / baseMetrics.financials.revenueLast30DaysTHB) * 100
      : 0;
    
    // Calculate liquidity runway
    const monthlyBurnRate = costs30d - revenue30d;
    const runwayMonths = monthlyBurnRate > 0 ? cashBalance / monthlyBurnRate : 0;
    
    // Check if crisis degradation is actually applied
    const revenueDropValid = revenueDrop >= 40 && revenueDrop <= 60; // 40-60% drop
    const costIncreaseValid = costs30d >= baseMetrics.financials.costsLast30DaysTHB * 1.15 && 
                              costs30d <= baseMetrics.financials.costsLast30DaysTHB * 1.25; // 15-25% increase
    const runwayValid = runwayMonths < 1; // Must be < 1 month
    const burnRateValid = monthlyBurnRate > 0; // Must be negative (burning cash)
    
    // STEP 7: Debug logging
    console.log('[CRISIS DEBUG] Metrics:', {
      branchId,
      revenue30d: Math.round(revenue30d).toLocaleString(),
      costs30d: Math.round(costs30d).toLocaleString(),
      cashBalance: Math.round(cashBalance).toLocaleString(),
      revenueDrop: revenueDrop.toFixed(1) + '%',
      costIncrease: baseMetrics.financials.costsLast30DaysTHB > 0 
        ? (((costs30d - baseMetrics.financials.costsLast30DaysTHB) / baseMetrics.financials.costsLast30DaysTHB) * 100).toFixed(1) + '%'
        : 'N/A',
      margin: margin.toFixed(1) + '%',
      monthlyBurnRate: Math.round(monthlyBurnRate).toLocaleString(),
      runwayMonths: runwayMonths.toFixed(2),
      revenueDropValid,
      costIncreaseValid,
      runwayValid,
      burnRateValid,
    });
    
    if (!revenueDropValid || !costIncreaseValid || !runwayValid || !burnRateValid) {
      console.warn('[CRISIS] Scenario conditions not met properly', {
        revenueDropValid: `Expected 40-60%, got ${revenueDrop.toFixed(1)}%`,
        costIncreaseValid: `Expected 15-25%, got ${baseMetrics.financials.costsLast30DaysTHB > 0 ? (((costs30d - baseMetrics.financials.costsLast30DaysTHB) / baseMetrics.financials.costsLast30DaysTHB) * 100).toFixed(1) : 'N/A'}%`,
        runwayValid: `Expected <1 month, got ${runwayMonths.toFixed(2)} months`,
        burnRateValid: `Expected >0, got ${monthlyBurnRate.toFixed(0)}`,
      });
    }
  }
  
  return metrics;
}

/**
 * Generate simulated metrics for all branches in a preset
 * 
 * Pure function - no side effects, no async, no React dependencies
 * Uses caching to avoid redundant calculations
 */
export function generateSimulatedMetrics(
  preset: SimulationPreset | null,
  scenario: SimulationScenario,
  adjustments: SimulationAdjustments,
  businessGroupId: string
): Array<{ branchId: string; branchName: string; metrics: BranchMetrics }> | null {
  // Guard: if preset is null, return null safely
  if (!preset) {
    return null;
  }
  
  // Check cache first
  const cacheKey = getCacheKey(preset, scenario, adjustments, businessGroupId);
  const cached = metricsCache.get(cacheKey);
  if (cached) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SIMULATION] Using cached metrics for preset=${preset}, scenario=${scenario}`);
    }
    // Return deep copy to prevent mutation
    return cached.map(branch => ({
      ...branch,
      metrics: { ...branch.metrics },
    }));
  }
  
  // Guard: if preset not in library, return null safely
  const presetData = SIMULATION_LIBRARY[preset];
  if (!presetData) {
    return null;
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SIMULATION] Generating new metrics for preset=${preset}, scenario=${scenario}`);
  }
  
  // Generate metrics for each branch
  // Use consistent branch IDs that match expected format from old simulation-engine.ts
  const result = presetData.branches.map((branch, index) => {
    // Generate branch IDs that match the expected format
    // For fnb_multi_branch: match old system IDs (central, riverside, oldtown)
    let branchId: string;
    if (preset === 'fnb_multi_branch') {
      // Match the old simulation-engine.ts branch IDs
      // Branch 0: Central Branch -> sim-fnb-central-001
      // Branch 1: Riverside Branch -> sim-fnb-riverside-001  
      // Branch 2: Old Town Branch -> sim-fnb-oldtown-001
      const branchIds = ['sim-fnb-central-001', 'sim-fnb-riverside-001', 'sim-fnb-oldtown-001'];
      branchId = branchIds[index] || `sim-fnb-branch${index + 1}-001`;
    } else if (preset === 'big_accommodation') {
      branchId = 'sim-big-accommodation-001';
    } else if (preset === 'accommodation_with_fnb') {
      branchId = 'sim-accommodation-fnb-001';
    } else {
      branchId = `sim-${preset}-${index + 1}`;
    }
    
    const metrics = generateBranchMetrics(
      branch.baseMetrics,
      scenario,
      adjustments,
      branchId,
      businessGroupId
    );
    
    // Defensive: ensure all critical fields are valid
    if (isNaN(metrics.financials.revenueLast30DaysTHB) || 
        isNaN(metrics.financials.costsLast30DaysTHB) ||
        isNaN(metrics.financials.cashBalanceTHB)) {
      // Return safe fallback - but preserve modules from baseMetrics
      const fallbackModules: BranchMetrics['modules'] = {};
      if (branch.baseMetrics.modules.accommodation) {
        fallbackModules.accommodation = {
          occupancyRateLast30DaysPct: 0,
          averageDailyRoomRateTHB: 0,
          totalRoomsAvailable: 0,
          totalStaffAccommodation: 0,
        };
      }
      if (branch.baseMetrics.modules.fnb) {
        fallbackModules.fnb = {
          totalCustomersLast7Days: 0,
          averageTicketPerCustomerTHB: 0,
          totalStaffFnb: 0,
          top3MenuRevenueShareLast30DaysPct: 0,
        };
      }
      
      return {
        branchId,
        branchName: branch.branchName,
        metrics: {
          branchId,
          groupId: businessGroupId,
          updatedAt: new Date().toISOString(),
          financials: {
            cashBalanceTHB: 0,
            revenueLast30DaysTHB: 0,
            costsLast30DaysTHB: 0,
            revenueLast7DaysTHB: 0,
            costsLast7DaysTHB: 0,
          },
          modules: fallbackModules, // Preserve module structure even in fallback
          metadata: {
            dataConfidence: 0,
          },
        },
      };
    }
    
    return {
      branchId,
      branchName: branch.branchName,
      metrics,
    };
  });
  
  // Cache the result
  metricsCache.set(cacheKey, result);
  
  return result;
}
