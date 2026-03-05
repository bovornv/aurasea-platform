/**
 * Simulation Engine
 * 
 * Generates realistic 40-day datasets for interactive simulation mode.
 * Supports 3 business types with deterministic, seed-based generation.
 */

import type { BranchMetrics } from '../../apps/web/app/models/branch-metrics';
import { safeNumber, safeSum, safeAverage } from '../../apps/web/app/utils/safe-number';

export type SimulationType =
  | 'big_accommodation'
  | 'fnb_multi_branch'
  | 'accommodation_with_fnb';

export type SimulationScenario = 'healthy' | 'stressed' | 'crisis';

export interface SimulationControls {
  revenueMultiplier?: number; // 0.5 - 1.5
  costMultiplier?: number; // 0.5 - 1.5
  cashAdjustment?: number; // THB adjustment
}

export interface DailyMetrics {
  date: string; // ISO date
  revenue: number;
  occupancyRate?: number; // For accommodation
  averageDailyRoomRate?: number; // For accommodation
  customers?: number; // For F&B
  averageTicket?: number; // For F&B
}

export interface SimulationBranch {
  branchId: string;
  branchName: string;
  metrics: BranchMetrics;
  dailyMetrics: DailyMetrics[];
}

export interface SimulationDataset {
  type: SimulationType;
  scenario: SimulationScenario;
  branches: SimulationBranch[];
  groupMetrics: {
    totalRevenue30d: number;
    totalCosts30d: number;
    totalCashBalance: number;
  };
  dailyMetrics: DailyMetrics[];
  monthlySummary: {
    averageDailyRevenue: number;
    averageOccupancy?: number;
    averageCustomers?: number;
  };
}

/**
 * Deterministic random number generator (seed-based)
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

/**
 * Generate 40-day date array
 */
function generateDateArray(startDate: Date = new Date()): string[] {
  const dates: string[] = [];
  const date = new Date(startDate);
  date.setDate(date.getDate() - 39); // Start 39 days ago (40 days total)
  
  for (let i = 0; i < 40; i++) {
    dates.push(new Date(date).toISOString().split('T')[0]);
    date.setDate(date.getDate() + 1);
  }
  
  return dates;
}

/**
 * Check if date is weekend (Saturday = 5, Sunday = 6)
 */
function isWeekend(dateIndex: number): boolean {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 39);
  const checkDate = new Date(startDate);
  checkDate.setDate(checkDate.getDate() + dateIndex);
  const dayOfWeek = checkDate.getDay();
  return dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday (Thai weekend)
}

/**
 * Apply scenario multipliers
 */
function applyScenarioMultipliers(
  baseValue: number,
  scenario: SimulationScenario,
  isRevenue: boolean = true
): number {
  switch (scenario) {
    case 'healthy':
      return isRevenue ? baseValue * 1.1 : baseValue * 0.95;
    case 'stressed':
      return isRevenue ? baseValue * 0.88 : baseValue * 1.08; // -12% revenue, +8% cost
    case 'crisis':
      return isRevenue ? baseValue * 0.70 : baseValue * 1.15; // -30% revenue, +15% cost
    default:
      return baseValue;
  }
}

/**
 * Apply controls (live play adjustments)
 */
function applyControls(
  value: number,
  controls: SimulationControls,
  isRevenue: boolean = true
): number {
  let adjusted = value;
  
  if (isRevenue && controls.revenueMultiplier !== undefined) {
    adjusted *= safeNumber(controls.revenueMultiplier, 1);
  }
  
  if (!isRevenue && controls.costMultiplier !== undefined) {
    adjusted *= safeNumber(controls.costMultiplier, 1);
  }
  
  return adjusted;
}

/**
 * Generate Big Standalone Accommodation Dataset
 */
function generateBigAccommodation(
  scenario: SimulationScenario,
  controls: SimulationControls = {}
): SimulationDataset {
  const rng = new SeededRandom(1001);
  const dates = generateDateArray();
  const branchId = 'sim-big-accommodation-001';
  const groupId = 'sim-group-001';
  
  const totalRooms = 120;
  const baseADR = 3500; // Base ADR
  const baseOccupancy = 0.65; // Base 65% occupancy
  
  // Generate daily arrays
  const dailyMetrics: DailyMetrics[] = [];
  const occupancyRateDaily: number[] = [];
  const averageDailyRoomRateDaily: number[] = [];
  const dailyRevenue: number[] = [];
  
  let totalRevenue = 0;
  
  for (let i = 0; i < 40; i++) {
    const isWeekendDay = isWeekend(i);
    
    // Base occupancy with weekend boost
    let occupancy = baseOccupancy;
    if (isWeekendDay) {
      occupancy += 0.15; // Weekend boost
    }
    
    // Add volatility (-5% to +5%)
    occupancy += (rng.next() - 0.5) * 0.1;
    
    // Apply scenario
    occupancy = applyScenarioMultipliers(occupancy, scenario, true);
    
    // Clamp occupancy
    occupancy = Math.max(0.45, Math.min(0.85, occupancy));
    
    // ADR with slight variation
    let adr = baseADR;
    adr += (rng.next() - 0.5) * 400; // ±200 variation
    adr = Math.max(3200, Math.min(3800, adr));
    
    // Calculate daily revenue
    const roomsSold = Math.floor(totalRooms * occupancy);
    let revenue = roomsSold * adr;
    
    // Weekend boost for revenue
    if (isWeekendDay) {
      revenue *= 1.2;
    }
    
    // Apply scenario and controls
    revenue = applyScenarioMultipliers(revenue, scenario, true);
    revenue = applyControls(revenue, controls, true);
    
    occupancyRateDaily.push(Math.round(occupancy * 100 * 10) / 10);
    averageDailyRoomRateDaily.push(Math.round(adr));
    dailyRevenue.push(Math.round(revenue));
    totalRevenue += revenue;
    
    dailyMetrics.push({
      date: dates[i],
      revenue: Math.round(revenue),
      occupancyRate: Math.round(occupancy * 100 * 10) / 10,
      averageDailyRoomRate: Math.round(adr),
    });
  }
  
  // Calculate monthly costs
  const baseMonthlyCosts = totalRevenue * 0.65; // 65% cost ratio
  let monthlyCosts = applyScenarioMultipliers(baseMonthlyCosts, scenario, false);
  monthlyCosts = applyControls(monthlyCosts, controls, false);
  
  // Cash balance
  let cashBalance = totalRevenue * 2.5; // 2.5 months runway
  if (scenario === 'crisis') {
    cashBalance *= 0.75; // -25% cash
  }
  cashBalance = safeNumber(cashBalance + (controls.cashAdjustment || 0), totalRevenue * 2);
  
  const avgOccupancy = safeAverage(occupancyRateDaily, 65);
  const avgADR = safeAverage(averageDailyRoomRateDaily, baseADR);
  
  const metrics: BranchMetrics = {
    branchId,
    groupId,
    updatedAt: new Date().toISOString(),
    financials: {
      cashBalanceTHB: Math.round(cashBalance),
      revenueLast30DaysTHB: Math.round(totalRevenue),
      costsLast30DaysTHB: Math.round(monthlyCosts),
      revenueLast7DaysTHB: safeSum(dailyRevenue.slice(-7), 0),
      costsLast7DaysTHB: Math.round(monthlyCosts / 40 * 7),
    },
    modules: {
      accommodation: {
        occupancyRateLast30DaysPct: Math.round(avgOccupancy * 10) / 10,
        averageDailyRoomRateTHB: Math.round(avgADR),
        totalRoomsAvailable: totalRooms,
        totalStaffAccommodation: 25,
      },
    },
    metadata: {
      dataConfidence: 95,
      lastUpdatedBy: 'simulation',
    },
  };
  
  return {
    type: 'big_accommodation',
    scenario,
    branches: [{
      branchId,
      branchName: 'Big Standalone Accommodation',
      metrics,
      dailyMetrics,
    }],
    groupMetrics: {
      totalRevenue30d: Math.round(totalRevenue),
      totalCosts30d: Math.round(monthlyCosts),
      totalCashBalance: Math.round(cashBalance),
    },
    dailyMetrics,
    monthlySummary: {
      averageDailyRevenue: Math.round(totalRevenue / 40),
      averageOccupancy: Math.round(avgOccupancy * 10) / 10,
    },
  };
}

/**
 * Generate F&B Multi-Branch Dataset
 */
function generateFnbMultiBranch(
  scenario: SimulationScenario,
  controls: SimulationControls = {}
): SimulationDataset {
  const dates = generateDateArray();
  const groupId = 'sim-group-fnb-001';
  
  const branches: SimulationBranch[] = [];
  let totalGroupRevenue = 0;
  let totalGroupCosts = 0;
  let totalGroupCash = 0;
  
  // Branch 1: Stable
  const branch1 = generateFnbBranch(
    'sim-fnb-central-001',
    'Central Branch',
    groupId,
    dates,
    scenario,
    controls,
    { baseCustomers: 180, baseTicket: 420, personality: 'stable' }
  );
  branches.push(branch1);
  totalGroupRevenue += branch1.metrics.financials.revenueLast30DaysTHB;
  totalGroupCosts += branch1.metrics.financials.costsLast30DaysTHB;
  totalGroupCash += branch1.metrics.financials.cashBalanceTHB;
  
  // Branch 2: Underperforming weekday
  const branch2 = generateFnbBranch(
    'sim-fnb-riverside-001',
    'Riverside Branch',
    groupId,
    dates,
    scenario,
    controls,
    { baseCustomers: 150, baseTicket: 380, personality: 'weak_weekday' }
  );
  branches.push(branch2);
  totalGroupRevenue += branch2.metrics.financials.revenueLast30DaysTHB;
  totalGroupCosts += branch2.metrics.financials.costsLast30DaysTHB;
  totalGroupCash += branch2.metrics.financials.cashBalanceTHB;
  
  // Branch 3: Revenue concentration risk
  const branch3 = generateFnbBranch(
    'sim-fnb-oldtown-001',
    'Old Town Branch',
    groupId,
    dates,
    scenario,
    controls,
    { baseCustomers: 200, baseTicket: 350, personality: 'concentration_risk' }
  );
  branches.push(branch3);
  totalGroupRevenue += branch3.metrics.financials.revenueLast30DaysTHB;
  totalGroupCosts += branch3.metrics.financials.costsLast30DaysTHB;
  totalGroupCash += branch3.metrics.financials.cashBalanceTHB;
  
  // Aggregate daily metrics
  const groupDailyMetrics: DailyMetrics[] = dates.map((date, i) => ({
    date,
    revenue: branches.reduce((sum, b) => sum + (b.dailyMetrics[i]?.revenue || 0), 0),
    customers: branches.reduce((sum, b) => sum + (b.dailyMetrics[i]?.customers || 0), 0),
    averageTicket: safeAverage(
      branches.map(b => b.dailyMetrics[i]?.averageTicket).filter(Boolean) as number[],
      0
    ),
  }));
  
  return {
    type: 'fnb_multi_branch',
    scenario,
    branches,
    groupMetrics: {
      totalRevenue30d: Math.round(totalGroupRevenue),
      totalCosts30d: Math.round(totalGroupCosts),
      totalCashBalance: Math.round(totalGroupCash),
    },
    dailyMetrics: groupDailyMetrics,
    monthlySummary: {
      averageDailyRevenue: Math.round(totalGroupRevenue / 40),
      averageCustomers: Math.round(
        safeAverage(groupDailyMetrics.map(m => m.customers || 0), 0)
      ),
    },
  };
}

/**
 * Generate single F&B branch
 */
function generateFnbBranch(
  branchId: string,
  branchName: string,
  groupId: string,
  dates: string[],
  scenario: SimulationScenario,
  controls: SimulationControls,
  config: {
    baseCustomers: number;
    baseTicket: number;
    personality: 'stable' | 'weak_weekday' | 'concentration_risk';
  }
): SimulationBranch {
  const rng = new SeededRandom(branchId.charCodeAt(0) * 1000);
  const dailyMetrics: DailyMetrics[] = [];
  const dailyRevenue: number[] = [];
  const dailyCustomers: number[] = [];
  const dailyTickets: number[] = [];
  
  let totalRevenue = 0;
  
  for (let i = 0; i < 40; i++) {
    const isWeekendDay = isWeekend(i);
    
    // Base customers
    let customers = config.baseCustomers;
    
    // Weekend boost
    if (isWeekendDay) {
      customers *= 1.3;
    }
    
    // Personality adjustments
    if (config.personality === 'weak_weekday' && !isWeekendDay) {
      customers *= 0.75; // -25% on weekdays
    }
    
    // Add volatility
    customers += (rng.next() - 0.5) * 40;
    customers = Math.max(80, Math.min(300, customers));
    
    // Average ticket
    let ticket = config.baseTicket;
    ticket += (rng.next() - 0.5) * 60;
    ticket = Math.max(280, Math.min(500, ticket));
    
    // Calculate revenue
    let revenue = customers * ticket;
    
    // Weekend boost
    if (isWeekendDay) {
      revenue *= 1.2;
    }
    
    // Apply scenario and controls
    revenue = applyScenarioMultipliers(revenue, scenario, true);
    revenue = applyControls(revenue, controls, true);
    
    dailyRevenue.push(Math.round(revenue));
    dailyCustomers.push(Math.round(customers));
    dailyTickets.push(Math.round(ticket));
    totalRevenue += revenue;
    
    dailyMetrics.push({
      date: dates[i],
      revenue: Math.round(revenue),
      customers: Math.round(customers),
      averageTicket: Math.round(ticket),
    });
  }
  
  // Monthly costs
  const baseMonthlyCosts = totalRevenue * 0.70; // 70% cost ratio for F&B
  let monthlyCosts = applyScenarioMultipliers(baseMonthlyCosts, scenario, false);
  monthlyCosts = applyControls(monthlyCosts, controls, false);
  
  // Cash balance
  let cashBalance = totalRevenue * 1.8; // 1.8 months runway
  if (scenario === 'crisis') {
    cashBalance *= 0.75;
  }
  cashBalance = safeNumber(cashBalance + (controls.cashAdjustment || 0), totalRevenue * 1.5);
  
  // Menu concentration (for branch 3)
  let top3MenuShare = 35; // Normal
  if (config.personality === 'concentration_risk') {
    top3MenuShare = 68; // High concentration
  }
  
  const avgCustomers = safeAverage(dailyCustomers, config.baseCustomers);
  const avgTicket = safeAverage(dailyTickets, config.baseTicket);
  
  const metrics: BranchMetrics = {
    branchId,
    groupId,
    updatedAt: new Date().toISOString(),
    financials: {
      cashBalanceTHB: Math.round(cashBalance),
      revenueLast30DaysTHB: Math.round(totalRevenue),
      costsLast30DaysTHB: Math.round(monthlyCosts),
      revenueLast7DaysTHB: safeSum(dailyRevenue.slice(-7), 0),
      costsLast7DaysTHB: Math.round(monthlyCosts / 40 * 7),
    },
    modules: {
      fnb: {
        totalCustomersLast7Days: Math.round(safeSum(dailyCustomers.slice(-7), 0)),
        averageTicketPerCustomerTHB: Math.round(avgTicket),
        totalStaffFnb: 12,
        top3MenuRevenueShareLast30DaysPct: top3MenuShare,
      },
    },
    metadata: {
      dataConfidence: 92,
      lastUpdatedBy: 'simulation',
    },
  };
  
  return {
    branchId,
    branchName,
    metrics,
    dailyMetrics,
  };
}

/**
 * Generate Accommodation with F&B Dataset
 */
function generateAccommodationWithFnb(
  scenario: SimulationScenario,
  controls: SimulationControls = {}
): SimulationDataset {
  const rng = new SeededRandom(3001);
  const dates = generateDateArray();
  const branchId = 'sim-accommodation-fnb-001';
  const groupId = 'sim-group-accommodation-fnb-001';
  
  const totalRooms = 60;
  const baseADR = 3200;
  const baseOccupancy = 0.60;
  
  const dailyMetrics: DailyMetrics[] = [];
  const occupancyRateDaily: number[] = [];
  const averageDailyRoomRateDaily: number[] = [];
  const dailyRevenueAccommodation: number[] = [];
  const dailyRevenueFnb: number[] = [];
  const dailyCustomers: number[] = [];
  
  let totalRevenueAccommodation = 0;
  let totalRevenueFnb = 0;
  
  for (let i = 0; i < 40; i++) {
    const isWeekendDay = isWeekend(i);
    
    // Accommodation metrics
    let occupancy = baseOccupancy;
    if (isWeekendDay) {
      occupancy += 0.12;
    }
    occupancy += (rng.next() - 0.5) * 0.08;
    occupancy = Math.max(0.45, Math.min(0.75, occupancy));
    
    let adr = baseADR;
    adr += (rng.next() - 0.5) * 300;
    adr = Math.max(2900, Math.min(3600, adr));
    
    const roomsSold = Math.floor(totalRooms * occupancy);
    let revenueAccommodation = roomsSold * adr;
    if (isWeekendDay) {
      revenueAccommodation *= 1.2;
    }
    revenueAccommodation = applyScenarioMultipliers(revenueAccommodation, scenario, true);
    revenueAccommodation = applyControls(revenueAccommodation, controls, true);
    
    // F&B metrics (40% of guests dine)
    const guestsDining = Math.floor(roomsSold * 0.4);
    const walkInCustomers = Math.floor(guestsDining * 0.3); // 30% walk-ins
    const totalCustomers = guestsDining + walkInCustomers;
    
    const avgTicket = 450 + (rng.next() - 0.5) * 80;
    let revenueFnb = totalCustomers * avgTicket;
    if (isWeekendDay) {
      revenueFnb *= 1.25;
    }
    revenueFnb = applyScenarioMultipliers(revenueFnb, scenario, true);
    revenueFnb = applyControls(revenueFnb, controls, true);
    
    occupancyRateDaily.push(Math.round(occupancy * 100 * 10) / 10);
    averageDailyRoomRateDaily.push(Math.round(adr));
    dailyRevenueAccommodation.push(Math.round(revenueAccommodation));
    dailyRevenueFnb.push(Math.round(revenueFnb));
    dailyCustomers.push(totalCustomers);
    totalRevenueAccommodation += revenueAccommodation;
    totalRevenueFnb += revenueFnb;
    
    dailyMetrics.push({
      date: dates[i],
      revenue: Math.round(revenueAccommodation + revenueFnb),
      occupancyRate: Math.round(occupancy * 100 * 10) / 10,
      averageDailyRoomRate: Math.round(adr),
      customers: totalCustomers,
      averageTicket: Math.round(avgTicket),
    });
  }
  
  const totalRevenue = totalRevenueAccommodation + totalRevenueFnb;
  
  // Monthly costs (accommodation + F&B)
  const baseMonthlyCosts = totalRevenue * 0.68;
  let monthlyCosts = applyScenarioMultipliers(baseMonthlyCosts, scenario, false);
  monthlyCosts = applyControls(monthlyCosts, controls, false);
  
  // Cash balance
  let cashBalance = totalRevenue * 2.2;
  if (scenario === 'crisis') {
    cashBalance *= 0.75;
  }
  cashBalance = safeNumber(cashBalance + (controls.cashAdjustment || 0), totalRevenue * 2);
  
  const avgOccupancy = safeAverage(occupancyRateDaily, 60);
  const avgADR = safeAverage(averageDailyRoomRateDaily, baseADR);
  const avgCustomers = safeAverage(dailyCustomers, 0);
  const avgTicket = safeAverage(
    dailyMetrics.map(m => m.averageTicket || 0).filter(Boolean) as number[],
    450
  );
  
  const metrics: BranchMetrics = {
    branchId,
    groupId,
    updatedAt: new Date().toISOString(),
    financials: {
      cashBalanceTHB: Math.round(cashBalance),
      revenueLast30DaysTHB: Math.round(totalRevenue),
      costsLast30DaysTHB: Math.round(monthlyCosts),
      revenueLast7DaysTHB: safeSum(
        dailyMetrics.slice(-7).map(m => m.revenue),
        0
      ),
      costsLast7DaysTHB: Math.round(monthlyCosts / 40 * 7),
    },
    modules: {
      accommodation: {
        occupancyRateLast30DaysPct: Math.round(avgOccupancy * 10) / 10,
        averageDailyRoomRateTHB: Math.round(avgADR),
        totalRoomsAvailable: totalRooms,
        totalStaffAccommodation: 15,
      },
      fnb: {
        totalCustomersLast7Days: Math.round(safeSum(dailyCustomers.slice(-7), 0)),
        averageTicketPerCustomerTHB: Math.round(avgTicket),
        totalStaffFnb: 10,
        top3MenuRevenueShareLast30DaysPct: 42, // Moderate concentration
      },
    },
    metadata: {
      dataConfidence: 94,
      lastUpdatedBy: 'simulation',
    },
  };
  
  return {
    type: 'accommodation_with_fnb',
    scenario,
    branches: [{
      branchId,
      branchName: 'Accommodation with F&B',
      metrics,
      dailyMetrics,
    }],
    groupMetrics: {
      totalRevenue30d: Math.round(totalRevenue),
      totalCosts30d: Math.round(monthlyCosts),
      totalCashBalance: Math.round(cashBalance),
    },
    dailyMetrics,
    monthlySummary: {
      averageDailyRevenue: Math.round(totalRevenue / 40),
      averageOccupancy: Math.round(avgOccupancy * 10) / 10,
      averageCustomers: Math.round(avgCustomers),
    },
  };
}

/**
 * Generate Simulation Dataset
 * 
 * @param type - Simulation type
 * @param scenario - Scenario (healthy/stressed/crisis)
 * @param controls - Live play controls (optional)
 * @returns Complete simulation dataset
 */
export function generateSimulationDataset(
  type: SimulationType,
  scenario: SimulationScenario = 'healthy',
  controls: SimulationControls = {}
): SimulationDataset {
  // Validate controls
  const validatedControls: SimulationControls = {
    revenueMultiplier: safeNumber(controls.revenueMultiplier, 1),
    costMultiplier: safeNumber(controls.costMultiplier, 1),
    cashAdjustment: safeNumber(controls.cashAdjustment, 0),
  };
  
  // Clamp multipliers
  if (validatedControls.revenueMultiplier !== undefined) {
    validatedControls.revenueMultiplier = Math.max(0.5, Math.min(1.5, validatedControls.revenueMultiplier));
  }
  if (validatedControls.costMultiplier !== undefined) {
    validatedControls.costMultiplier = Math.max(0.5, Math.min(1.5, validatedControls.costMultiplier));
  }
  
  switch (type) {
    case 'big_accommodation':
      return generateBigAccommodation(scenario, validatedControls);
    
    case 'fnb_multi_branch':
      return generateFnbMultiBranch(scenario, validatedControls);
    
    case 'accommodation_with_fnb':
      return generateAccommodationWithFnb(scenario, validatedControls);
    
    default:
      throw new Error(`Unknown simulation type: ${type}`);
  }
}
