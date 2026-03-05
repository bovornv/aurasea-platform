/**
 * Test Fixture Loader - Loads test data from fixtures when TEST_MODE is enabled
 * 
 * Only works in development mode (NODE_ENV !== 'production')
 * Loads data from core/sme-os/tests/fixtures based on ?scenario= query parameter
 */

'use client';

import type { HospitalityInput } from '../adapters/hospitality-adapter';
import type { OperationalSignal } from './operational-signals-service';
import { 
  type ScenarioKey, 
  getFixtureFileName, 
  parseScenarioKey,
  type FixtureBundle 
} from './scenario-registry';
// Import v2 loader functions
import {
  clearFixtureCache as clearFixtureCacheV2,
  isTestModeEnabled as isTestModeEnabledV2,
  getTestScenarioKey,
  preloadTestFixture as preloadTestFixtureV2,
  loadTestOperationalSignals as loadTestOperationalSignalsV2,
  loadTestHospitalityInput as loadTestHospitalityInputV2,
} from './test-fixture-loader-v2';

// TEST_MODE is enabled when:
// 1. Running in browser (client-side)
// 2. Not in production
// 3. NEXT_PUBLIC_TEST_MODE env var is 'true' OR we're in development mode
// 4. NOT explicitly disabled via NEXT_PUBLIC_DISABLE_TEST_MODE
const TEST_MODE_ENABLED = typeof window !== 'undefined' && 
  process.env.NODE_ENV !== 'production' && 
  process.env.NEXT_PUBLIC_DISABLE_TEST_MODE !== 'true' &&
  (process.env.NEXT_PUBLIC_TEST_MODE === 'true' || process.env.NODE_ENV === 'development');

/**
 * Get scenarioKey from URL query parameters
 * Supports both old format (?scenario=) and new format (?businessType= & ?scenario=)
 */
function getScenarioKeyFromURL(): ScenarioKey | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  
  // New format: businessType + scenario
  const businessType = params.get('businessType');
  const scenario = params.get('scenario');
  
  if (businessType && scenario) {
    const scenarioKey = `${businessType}:${scenario}` as ScenarioKey;
    if (getFixtureFileName(scenarioKey)) {
      return scenarioKey;
    }
  }
  
  // Legacy format: single scenario param (supports both colon and double underscore)
  const legacyScenario = params.get('scenario');
  if (legacyScenario && (legacyScenario.includes(':') || legacyScenario.includes('__'))) {
    const parsed = parseScenarioKey(legacyScenario);
    if (parsed) {
      // Normalize to colon format
      return `${parsed.businessType}:${parsed.scenario}` as ScenarioKey;
    }
  }
  
  return null;
}

/**
 * Get scenario from URL query parameter (legacy support)
 * Delegates to getScenarioKeyFromURL for new format, falls back to legacy
 */
function getScenarioFromURL(): string | null {
  // Try new format first (scenarioKey)
  const scenarioKey = getScenarioKeyFromURL();
  if (scenarioKey) {
    return scenarioKey;
  }
  
  // Fall back to legacy format (single scenario param)
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('scenario');
}

// Fixture cache to avoid reloading
// Cache is cleared when scenario changes (via page reload)
let fixtureCache: Map<string, any> = new Map();

/**
 * Clear fixture cache (useful when switching scenarios)
 * Delegates to v2 loader
 */
export function clearFixtureCache(): void {
  fixtureCache.clear();
  clearFixtureCacheV2();
}

/**
 * Static import map for fixtures (Next.js can resolve these at build time)
 * Supports both legacy format and new scenarioKey format
 */
async function loadFixtureAsync(scenario: string): Promise<any> {
  // Check cache first
  if (fixtureCache.has(scenario)) {
    return fixtureCache.get(scenario);
  }

  // If it's a scenarioKey format, delegate to v2 loader
  const parsed = parseScenarioKey(scenario as ScenarioKey);
  if (parsed) {
    await preloadTestFixtureV2(scenario as ScenarioKey);
    const { getFixtureBundle } = await import('./test-fixture-loader-v2');
    const v2Result = getFixtureBundle();
    if (v2Result) {
      return v2Result;
    }
  }

  try {
    // Legacy format - handle old scenario names
    let fixtureData: any = null;

    switch (scenario) {
      // Original fixtures
      case 'hotel-only':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-only-single.json')).default;
        break;
      case 'cafe-standalone':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-standalone.json')).default;
        break;
      case 'hotel-restaurant':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-with-restaurant.json')).default;
        break;
      case 'hotel-multi-restaurant':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-multiple-restaurants.json')).default;
        break;
      case 'group-hotels':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/group-hotels-revenue.json')).default;
        break;
      case 'group-cafes':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/group-cafes-revenue.json')).default;
        break;
      case 'mixed-group':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/mixed-group-revenue.json')).default;
        break;
      // Quality variant fixtures
      case 'cafe-good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-good.json')).default;
        break;
      case 'cafe-bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-bad.json')).default;
        break;
      case 'cafe-mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-mixed.json')).default;
        break;
      case 'hotel-good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-good.json')).default;
        break;
      case 'hotel-bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-bad.json')).default;
        break;
      case 'hotel-mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-mixed.json')).default;
        break;
      case 'group-good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/group-good.json')).default;
        break;
      case 'group-bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/group-bad.json')).default;
        break;
      case 'group-mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/group-mixed.json')).default;
        break;
      default:
        console.warn(`[TEST_MODE] Unknown scenario: ${scenario}`);
        return null;
    }

    if (fixtureData) {
      fixtureCache.set(scenario, fixtureData);
      return fixtureData;
    }

    return null;
  } catch (error) {
    console.error(`[TEST_MODE] Failed to load fixture for scenario "${scenario}":`, error);
    console.error(`[TEST_MODE] Make sure fixtures exist in core/sme-os/tests/fixtures/`);
    return null;
  }
}

/**
 * Load fixture synchronously (uses cache if available, otherwise returns null)
 * This allows TEST_MODE to work without breaking synchronous getAllSignals calls
 */
function loadFixture(scenario: string): any {
  // Check if it's a scenarioKey and try v2 loader first
  const parsed = parseScenarioKey(scenario as ScenarioKey);
  if (parsed) {
    const { getFixtureBundle } = require('./test-fixture-loader-v2');
    const v2Result = getFixtureBundle();
    if (v2Result) return v2Result;
  }
  
  // Fall back to legacy cache
  return fixtureCache.get(scenario) || null;
}

/**
 * Convert fixture dailyRevenue to OperationalSignal format
 * Creates signals for each day with rolling 7-day and 30-day windows
 */
function convertFixtureToOperationalSignals(fixtureData: any, branchId: string): OperationalSignal[] {
  if (!fixtureData?.branches) return [];

  // Find target branch or use first branch
  let branch = fixtureData.branches.find((b: any) => b.branchId === branchId);
  if (!branch) {
    // If branchId is "__all__" or null, aggregate all branches
    if (!branchId || branchId === '__all__') {
      // Aggregate all branches' revenue
      const allDailyRevenues: Array<{ timestamp: string; dailyRevenue: number }> = [];
      const branchMap = new Map<string, any>();
      
      fixtureData.branches.forEach((b: any) => {
        branchMap.set(b.branchId, b);
        if (b.dailyRevenue) {
          b.dailyRevenue.forEach((r: any) => {
            const existing = allDailyRevenues.find(d => d.timestamp === r.timestamp);
            if (existing) {
              existing.dailyRevenue += r.dailyRevenue;
            } else {
              allDailyRevenues.push({ ...r });
            }
          });
        }
      });
      
      // Sort by timestamp
      allDailyRevenues.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      
      // Create aggregated branch for processing
      branch = {
        branchId: '__all__',
        branchType: fixtureData.branches[0]?.branchType || 'hotel',
        dailyRevenue: allDailyRevenues,
      };
    } else {
      branch = fixtureData.branches[0];
    }
  }
  
  if (!branch?.dailyRevenue || branch.dailyRevenue.length === 0) return [];

  const signals: OperationalSignal[] = [];
  const dailyRevenues = branch.dailyRevenue;

  // Group by 7-day and 30-day windows
  for (let i = 0; i < dailyRevenues.length; i++) {
    const currentDate = new Date(dailyRevenues[i].timestamp);
    
    // Calculate 7-day revenue (rolling window)
    const revenue7Days = dailyRevenues
      .slice(Math.max(0, i - 6), i + 1)
      .reduce((sum: number, r: any) => sum + r.dailyRevenue, 0);
    
    // Calculate 30-day revenue (rolling window)
    const revenue30Days = dailyRevenues
      .slice(Math.max(0, i - 29), i + 1)
      .reduce((sum: number, r: any) => sum + r.dailyRevenue, 0);
    
    // Estimate costs (assume 60% of revenue as costs)
    const costs7Days = revenue7Days * 0.6;
    const costs30Days = revenue30Days * 0.6;
    
    // Estimate cash balance (start with 100k, adjust based on cumulative revenue - costs)
    const baseBalance = 100000;
    const cumulativeRevenue = dailyRevenues
      .slice(0, i + 1)
      .reduce((sum: number, r: any) => sum + r.dailyRevenue, 0);
    const cumulativeCosts = cumulativeRevenue * 0.6;
    const cashBalance = Math.max(0, baseBalance + cumulativeRevenue - cumulativeCosts);

    signals.push({
      timestamp: currentDate,
      cashBalance,
      revenue7Days,
      revenue30Days,
      costs7Days,
      costs30Days,
      staffCount: branch.branchType === 'hotel' ? 25 : 8,
      occupancyRate: branch.branchType === 'hotel' ? 0.75 : undefined,
      customerVolume: branch.branchType === 'cafe' ? Math.round(revenue7Days / 50) : undefined,
      branchId: branch.branchId === '__all__' ? undefined : branch.branchId,
    });
  }

  return signals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Convert fixture data to HospitalityInput format
 */
function convertFixtureToHospitalityInput(fixtureData: any, branchId: string): HospitalityInput | null {
  if (!fixtureData?.branches) return null;

  const branch = fixtureData.branches.find((b: any) => b.branchId === branchId) || fixtureData.branches[0];
  if (!branch?.dailyRevenue || branch.dailyRevenue.length === 0) return null;

  const dailyRevenues = branch.dailyRevenue;
  const latestRevenue = dailyRevenues[dailyRevenues.length - 1];
  const firstRevenue = dailyRevenues[0];

  // Calculate average daily revenue
  const totalRevenue = dailyRevenues.reduce((sum: number, r: any) => sum + r.dailyRevenue, 0);
  const avgDailyRevenue = totalRevenue / dailyRevenues.length;

  // Estimate cash balance
  const baseBalance = 100000;
  const estimatedCosts = totalRevenue * 0.6;
  const cashBalance = Math.max(0, baseBalance + totalRevenue - estimatedCosts);

  // Split revenue based on branch type
  const isHotel = branch.branchType === 'hotel';
  const roomRevenue = isHotel ? Math.round(avgDailyRevenue * 0.6) : 0;
  const foodRevenue = Math.round(avgDailyRevenue * 0.25);
  const beverageRevenue = Math.round(avgDailyRevenue * 0.1);
  const otherRevenue = Math.round(avgDailyRevenue * 0.05);

  // Create expense entries (simplified - one per week)
  const expenses: Array<{ date: Date; amount: number; category: string }> = [];
  for (let i = 0; i < dailyRevenues.length; i += 7) {
    expenses.push({
      date: new Date(dailyRevenues[i].timestamp),
      amount: avgDailyRevenue * 0.6 * 7,
      category: 'operational',
    });
  }

  return {
    financial: {
      currentBalance: cashBalance,
      expenses,
    },
    revenue: {
      roomRevenue,
      foodRevenue,
      beverageRevenue,
      otherRevenue,
      dates: dailyRevenues.map((r: any) => new Date(r.timestamp)),
    },
    operations: {
      occupancyRate: isHotel ? 0.75 : undefined,
      averageDailyRate: isHotel ? 150 : undefined,
      staffShifts: [],
    },
    timePeriod: {
      start: new Date(firstRevenue.timestamp),
      end: new Date(latestRevenue.timestamp),
    },
  };
}

/**
 * Check if TEST_MODE is enabled and scenario is available
 * Delegates to v2 loader
 */
export function isTestModeEnabled(): boolean {
  return TEST_MODE_ENABLED && isTestModeEnabledV2();
}

/**
 * Get current scenario from URL
 */
export function getTestScenario(): string | null {
  if (!TEST_MODE_ENABLED) return null;
  return getScenarioFromURL();
}

/**
 * Preload fixture data (call this early to populate cache)
 * Supports both legacy format and new scenarioKey format
 */
export async function preloadTestFixture(scenario: string): Promise<void> {
  if (!TEST_MODE_ENABLED) return;
  
  // Check if it's a scenarioKey format
  const parsed = parseScenarioKey(scenario as ScenarioKey);
  if (parsed) {
    // Use v2 loader
    await preloadTestFixtureV2(scenario as ScenarioKey);
    return;
  }
  
  // If it's just a scenario name without business type (e.g., "bad", "good", "mixed"),
  // skip loading - we need both businessType and scenario
  if (scenario === 'good' || scenario === 'bad' || scenario === 'mixed') {
    console.log(`[TEST_MODE] Scenario "${scenario}" requires a business type to load fixtures`);
    return;
  }
  
  // Legacy format - use old loader (for old scenario names like "cafe-good", "hotel-bad")
  await loadFixtureAsync(scenario);
}

/**
 * Load operational signals from test fixture (synchronous, uses cache)
 * Supports both legacy format and new scenarioKey format
 */
export function loadTestOperationalSignals(branchId?: string): OperationalSignal[] | null {
  if (!TEST_MODE_ENABLED) return null;

  const scenario = getScenarioFromURL();
  if (!scenario) return null;

  // Check if it's a scenarioKey format
  const parsed = parseScenarioKey(scenario as ScenarioKey);
  if (parsed) {
    // Use v2 loader
    return loadTestOperationalSignalsV2(branchId);
  }

  // Legacy format - use old loader
  const fixtureData = loadFixture(scenario);
  if (!fixtureData) {
    // Try to load asynchronously and cache for next time
    loadFixtureAsync(scenario).catch(() => {});
    return null;
  }

  // Use first branch if branchId not provided
  const targetBranchId = branchId || fixtureData.branches[0]?.branchId;
  return convertFixtureToOperationalSignals(fixtureData, targetBranchId);
}

/**
 * Load hospitality input from test fixture (synchronous, uses cache)
 * Supports both legacy format and new scenarioKey format
 */
export function loadTestHospitalityInput(branchId?: string): HospitalityInput | null {
  if (!TEST_MODE_ENABLED) return null;

  const scenario = getScenarioFromURL();
  if (!scenario) return null;

  // Check if it's a scenarioKey format
  const parsed = parseScenarioKey(scenario as ScenarioKey);
  if (parsed) {
    // Use v2 loader
    return loadTestHospitalityInputV2(branchId);
  }

  // Legacy format - use old loader
  const fixtureData = loadFixture(scenario);
  if (!fixtureData) {
    // Try to load asynchronously and cache for next time
    loadFixtureAsync(scenario).catch(() => {});
    return null;
  }

  // Use first branch if branchId not provided
  const targetBranchId = branchId || fixtureData.branches[0]?.branchId;
  return convertFixtureToHospitalityInput(fixtureData, targetBranchId);
}
