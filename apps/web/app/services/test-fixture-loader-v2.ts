/**
 * Test Fixture Loader V2 - Business Scenario Testing System
 * 
 * Loads test data from fixtures using scenarioKey format: businessType__scenario
 * Only works in development mode (NODE_ENV !== 'production')
 */

'use client';

import type { HospitalityInput } from '../adapters/hospitality-adapter';
import type { OperationalSignal } from './operational-signals-service';
import { businessGroupService } from './business-group-service';
import { BranchBusinessType } from '../models/business-group';
import { 
  type ScenarioKey, 
  getFixtureFileName, 
  parseScenarioKey,
  type FixtureBundle,
  getBusinessTypes,
  getScenarios,
} from './scenario-registry';

// TEST_MODE is enabled when:
// 1. Running in browser (client-side)
// 2. Not in production
// 3. NEXT_PUBLIC_TEST_MODE env var is 'true' OR we're in development mode
// 4. NOT explicitly disabled via NEXT_PUBLIC_DISABLE_TEST_MODE
const TEST_MODE_ENABLED = typeof window !== 'undefined' && 
  process.env.NODE_ENV !== 'production' && 
  process.env.NEXT_PUBLIC_DISABLE_TEST_MODE !== 'true' &&
  (process.env.NEXT_PUBLIC_TEST_MODE === 'true' || process.env.NODE_ENV === 'development');

// Fixture cache - cleared when scenarioKey changes
let fixtureCache: Map<ScenarioKey, FixtureBundle> = new Map();
let currentScenarioKey: ScenarioKey | null = null;

/**
 * Clear fixture cache (called when scenario changes)
 */
export function clearFixtureCache(): void {
  fixtureCache.clear();
  currentScenarioKey = null;
  console.log('[TEST_MODE] Fixture cache cleared');
}

/**
 * Get scenarioKey from URL query parameters
 * Supports format: ?businessType=X&scenario=Y
 */
function getScenarioKeyFromURL(): ScenarioKey | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  
  const businessType = params.get('businessType');
  const scenario = params.get('scenario');
  
  // TEST_MODE is disabled if businessType is empty/null (set to "None (Production)")
  if (!businessType || businessType === '') {
    return null;
  }
  
  if (businessType && scenario) {
    const scenarioKey = `${businessType}:${scenario}` as ScenarioKey;
    if (getFixtureFileName(scenarioKey)) {
      return scenarioKey;
    }
    // Fallback to Mixed if fixture missing
    console.warn(`[TEST_MODE] Fixture not found for ${scenarioKey}, falling back to Mixed`);
    const fallbackKey = `${businessType}:mixed` as ScenarioKey;
    if (getFixtureFileName(fallbackKey)) {
      return fallbackKey;
    }
  }
  
  // Legacy format support: single scenario param (with colon or double underscore)
  // Only if businessType is not explicitly set (backward compatibility)
  if (!businessType) {
    const legacyScenario = params.get('scenario');
    if (legacyScenario && (legacyScenario.includes(':') || legacyScenario.includes('__'))) {
      const parsed = parseScenarioKey(legacyScenario);
      if (parsed) {
        // Normalize to colon format
        return `${parsed.businessType}:${parsed.scenario}` as ScenarioKey;
      }
    }
  }
  
  return null;
}

/**
 * Load fixture bundle for scenarioKey
 * Uses static imports that Next.js can resolve at build time
 */
async function loadFixtureBundleAsync(scenarioKey: ScenarioKey): Promise<FixtureBundle | null> {
  // Check cache first
  if (fixtureCache.has(scenarioKey)) {
    return fixtureCache.get(scenarioKey)!;
  }

  // Clear cache if scenarioKey changed
  if (currentScenarioKey && currentScenarioKey !== scenarioKey) {
    clearFixtureCache();
  }
  currentScenarioKey = scenarioKey;

  try {
    let fixtureFileName = getFixtureFileName(scenarioKey);
    if (!fixtureFileName) {
      // Fallback to Mixed scenario for this business type
      const parsed = parseScenarioKey(scenarioKey);
      if (parsed && parsed.scenario !== 'mixed') {
        console.warn(`[TEST_MODE] Fixture not found for ${scenarioKey}, falling back to Mixed`);
        const fallbackKey = `${parsed.businessType}:mixed` as ScenarioKey;
        fixtureFileName = getFixtureFileName(fallbackKey);
        if (fixtureFileName) {
          // Update scenarioKey to fallback
          const fallbackBundle = await loadFixtureBundleAsync(fallbackKey);
          return fallbackBundle;
        }
      }
      console.error(`[TEST_MODE] No fixture file found for scenarioKey: ${scenarioKey}`);
      return null;
    }

    let fixtureData: any = null;

    // Map scenarioKey to fixture imports
    // This is a comprehensive switch for all 21 scenarioKeys
    switch (scenarioKey) {
      // Café Single Branch
      case 'cafe_single:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-single-good.json')).default;
        break;
      case 'cafe_single:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-single-mixed.json')).default;
        break;
      case 'cafe_single:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-single-bad.json')).default;
        break;
      
      // Café Multi-Branch
      case 'cafe_multi_branch:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-multi-good.json')).default;
        break;
      case 'cafe_multi_branch:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-multi-mixed.json')).default;
        break;
      case 'cafe_multi_branch:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/cafe-multi-bad.json')).default;
        break;
      
      // Restaurant Single Branch
      case 'restaurant_single:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/restaurant-single-good.json')).default;
        break;
      case 'restaurant_single:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/restaurant-single-mixed.json')).default;
        break;
      case 'restaurant_single:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/restaurant-single-bad.json')).default;
        break;
      
      // Restaurant Multi-Branch
      case 'restaurant_multi_branch:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/restaurant-multi-good.json')).default;
        break;
      case 'restaurant_multi_branch:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/restaurant-multi-mixed.json')).default;
        break;
      case 'restaurant_multi_branch:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/restaurant-multi-bad.json')).default;
        break;
      
      // Hotel No F&B
      case 'hotel_no_fnb:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-no-fnb-good.json')).default;
        break;
      case 'hotel_no_fnb:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-no-fnb-mixed.json')).default;
        break;
      case 'hotel_no_fnb:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-no-fnb-bad.json')).default;
        break;
      
      // Hotel With F&B
      case 'hotel_with_fnb:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-with-fnb-good.json')).default;
        break;
      case 'hotel_with_fnb:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-with-fnb-mixed.json')).default;
        break;
      case 'hotel_with_fnb:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-with-fnb-bad.json')).default;
        break;
      
      // Hotel Group
      case 'hotel_group:good':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-group-good.json')).default;
        break;
      case 'hotel_group:mixed':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-group-mixed.json')).default;
        break;
      case 'hotel_group:bad':
        fixtureData = (await import('../../../../core/sme-os/tests/fixtures/hotel-group-bad.json')).default;
        break;
      
      default:
        console.warn(`[TEST_MODE] Unknown scenarioKey: ${scenarioKey}`);
        return null;
    }

    if (!fixtureData) {
      console.error(`[TEST_MODE] Failed to load fixture for scenarioKey: ${scenarioKey}`);
      return null;
    }

    // Determine vertical flags from fixture data
    const hasHotel = fixtureData.branches?.some((b: any) => b.branchType === 'hotel') || false;
    const hasFnb = fixtureData.branches?.some((b: any) => 
      b.branchType === 'cafe' || b.branchType === 'restaurant'
    ) || false;
    const isMixed = hasHotel && hasFnb;

    const bundle: FixtureBundle = {
      organizationId: fixtureData.organizationId,
      branches: fixtureData.branches,
      verticalFlags: {
        hasHotel,
        hasFnb,
        isMixed,
      },
    };

    // Cache the bundle
    fixtureCache.set(scenarioKey, bundle);

    // Sync branches to business-group-service
    const parsed = parseScenarioKey(scenarioKey);
    syncFixtureBranchesToBusinessGroup(bundle, parsed?.businessType || null);

    // Set runtime mode to TEST when fixture is loaded
    if (typeof window !== 'undefined') {
      try {
        const { setRuntimeMode } = require('../../../../core/runtime-mode');
        setRuntimeMode('TEST');
      } catch (e) {
        // Ignore if runtime-mode not available
      }
    }

    // Debug logging
    console.log(`[TEST_MODE] Loaded scenarioKey: ${scenarioKey}`);
    console.log(`[TEST_MODE] - Business Type: ${parsed?.businessType || 'unknown'}`);
    console.log(`[TEST_MODE] - Scenario: ${parsed?.scenario || 'unknown'}`);
    console.log(`[TEST_MODE] - Branches: ${bundle.branches.length}`);
    console.log(`[TEST_MODE] - Vertical flags:`, bundle.verticalFlags);

    return bundle;
  } catch (error) {
    console.error(`[TEST_MODE] Failed to load fixture for scenarioKey "${scenarioKey}":`, error);
    console.error(`[TEST_MODE] Make sure fixture exists: core/sme-os/tests/fixtures/${getFixtureFileName(scenarioKey)}.json`);
    return null;
  }
}

/**
 * Load fixture bundle synchronously (uses cache)
 */
function loadFixtureBundle(scenarioKey: ScenarioKey): FixtureBundle | null {
  return fixtureCache.get(scenarioKey) || null;
}

/**
 * Convert fixture dailyRevenue to OperationalSignal format
 */
function convertFixtureToOperationalSignals(bundle: FixtureBundle, branchId: string): OperationalSignal[] {
  if (!bundle?.branches) return [];

  // Find target branch or aggregate all branches
  let branch = bundle.branches.find((b) => b.branchId === branchId);
  if (!branch) {
    if (!branchId || branchId === '__all__') {
      // Aggregate all branches' revenue
      const allDailyRevenues: Array<{ timestamp: string; dailyRevenue: number }> = [];
      
      bundle.branches.forEach((b) => {
        if (b.dailyRevenue) {
          b.dailyRevenue.forEach((r) => {
            const existing = allDailyRevenues.find(d => d.timestamp === r.timestamp);
            if (existing) {
              existing.dailyRevenue += r.dailyRevenue;
            } else {
              allDailyRevenues.push({ ...r });
            }
          });
        }
      });
      
      allDailyRevenues.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      
      branch = {
        branchId: '__all__',
        branchName: 'All Branches',
        branchType: bundle.branches[0]?.branchType || 'hotel',
        dailyRevenue: allDailyRevenues,
      };
    } else {
      branch = bundle.branches[0];
    }
  }
  
  if (!branch?.dailyRevenue || branch.dailyRevenue.length === 0) return [];

  const signals: OperationalSignal[] = [];
  const dailyRevenues = branch.dailyRevenue;

  for (let i = 0; i < dailyRevenues.length; i++) {
    const currentDate = new Date(dailyRevenues[i].timestamp);
    
    const revenue7Days = dailyRevenues
      .slice(Math.max(0, i - 6), i + 1)
      .reduce((sum, r) => sum + r.dailyRevenue, 0);
    
    const revenue30Days = dailyRevenues
      .slice(Math.max(0, i - 29), i + 1)
      .reduce((sum, r) => sum + r.dailyRevenue, 0);
    
    const costs7Days = revenue7Days * 0.6;
    const costs30Days = revenue30Days * 0.6;
    
    const baseBalance = 100000;
    const cumulativeRevenue = dailyRevenues
      .slice(0, i + 1)
      .reduce((sum, r) => sum + r.dailyRevenue, 0);
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
      customerVolume: branch.branchType === 'cafe' || branch.branchType === 'restaurant' 
        ? Math.round(revenue7Days / 50) 
        : undefined,
      branchId: branch.branchId === '__all__' ? undefined : branch.branchId,
    });
  }

  return signals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Convert fixture data to HospitalityInput format
 */
function convertFixtureToHospitalityInput(bundle: FixtureBundle, branchId: string): HospitalityInput | null {
  if (!bundle?.branches) return null;

  const branch = bundle.branches.find((b) => b.branchId === branchId) || bundle.branches[0];
  if (!branch?.dailyRevenue || branch.dailyRevenue.length === 0) return null;

  const dailyRevenues = branch.dailyRevenue;
  const latestRevenue = dailyRevenues[dailyRevenues.length - 1];
  const firstRevenue = dailyRevenues[0];

  const totalRevenue = dailyRevenues.reduce((sum, r) => sum + r.dailyRevenue, 0);
  const avgDailyRevenue = totalRevenue / dailyRevenues.length;

  const baseBalance = 100000;
  const estimatedCosts = totalRevenue * 0.6;
  const cashBalance = Math.max(0, baseBalance + totalRevenue - estimatedCosts);

  const isHotel = branch.branchType === 'hotel';
  const roomRevenue = isHotel ? Math.round(avgDailyRevenue * 0.6) : 0;
  const foodRevenue = Math.round(avgDailyRevenue * 0.25);
  const beverageRevenue = Math.round(avgDailyRevenue * 0.1);
  const otherRevenue = Math.round(avgDailyRevenue * 0.05);

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
      dates: dailyRevenues.map((r) => new Date(r.timestamp)),
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
 * Check if TEST_MODE is enabled
 */
/**
 * Check if TEST_MODE is enabled
 * 
 * STEP 5: If simulation is active, TEST_MODE must NOT inject fixtures.
 */
export function isTestModeEnabled(): boolean {
  // PART 1: Check real data guard - force disable test mode if real data only mode
  if (typeof window !== 'undefined') {
    try {
      const { checkRealDataGuard } = require('../utils/real-data-guard');
      const guard = checkRealDataGuard();
      if (guard.dataSource === 'REAL_SUPABASE') {
        return false; // Force disabled for real data only mode
      }
    } catch (e) {
      // Ignore errors if module not found
    }
  }
  
  // STEP 5: Check if simulation is active first - if so, TEST_MODE is disabled
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('aurasea_test_mode');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.simulationType) {
          // Simulation is active - TEST_MODE must not inject fixtures
          return false;
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }
  return TEST_MODE_ENABLED;
}

/**
 * Get current scenarioKey from URL
 */
export function getTestScenarioKey(): ScenarioKey | null {
  if (!TEST_MODE_ENABLED) return null;
  return getScenarioKeyFromURL();
}

/**
 * Preload fixture bundle (call this early to populate cache)
 */
export async function preloadTestFixture(scenarioKey: ScenarioKey): Promise<void> {
  // Set runtime mode to TEST when loading fixtures
  if (typeof window !== 'undefined') {
    try {
      const { setRuntimeMode } = require('../../../../core/runtime-mode');
      setRuntimeMode('TEST');
    } catch (e) {
      // Ignore if runtime-mode not available
    }
  }
  if (!TEST_MODE_ENABLED) return;
  await loadFixtureBundleAsync(scenarioKey);
}

/**
 * Load operational signals from test fixture (synchronous, uses cache)
 * Returns null if TEST_MODE is disabled or no scenarioKey is set
 */
export function loadTestOperationalSignals(branchId?: string): OperationalSignal[] | null {
  if (!TEST_MODE_ENABLED) return null;

  const scenarioKey = getScenarioKeyFromURL();
  // If scenarioKey is null, TEST_MODE is disabled (None/Production selected)
  if (!scenarioKey) return null;

  const bundle = loadFixtureBundle(scenarioKey);
  if (!bundle) {
    // Try to load asynchronously and cache for next time
    loadFixtureBundleAsync(scenarioKey).catch(() => {});
    return null;
  }

  const targetBranchId = branchId || bundle.branches[0]?.branchId;
  return convertFixtureToOperationalSignals(bundle, targetBranchId);
}

/**
 * Load hospitality input from test fixture (synchronous, uses cache)
 * Returns null if TEST_MODE is disabled or no scenarioKey is set
 */
export function loadTestHospitalityInput(branchId?: string): HospitalityInput | null {
  if (!TEST_MODE_ENABLED) return null;

  const scenarioKey = getScenarioKeyFromURL();
  // If scenarioKey is null, TEST_MODE is disabled (None/Production selected)
  if (!scenarioKey) return null;

  const bundle = loadFixtureBundle(scenarioKey);
  if (!bundle) {
    // Try to load asynchronously and cache for next time
    loadFixtureBundleAsync(scenarioKey).catch(() => {});
    return null;
  }

  const targetBranchId = branchId || bundle.branches[0]?.branchId;
  return convertFixtureToHospitalityInput(bundle, targetBranchId);
}

/**
 * Get fixture bundle (for debugging and advanced usage)
 */
export function getFixtureBundle(): FixtureBundle | null {
  if (!TEST_MODE_ENABLED) return null;

  const scenarioKey = getScenarioKeyFromURL();
  if (!scenarioKey) return null;

  return loadFixtureBundle(scenarioKey);
}

/**
 * Sync fixture branches to business-group-service
 * This ensures branches from fixtures are available in the UI
 */
function syncFixtureBranchesToBusinessGroup(bundle: FixtureBundle, businessType: string | null): void {
  if (typeof window === 'undefined') return;
  if (!bundle?.branches || bundle.branches.length === 0) return;

  // Validate group types require >= 2 branches
  const isGroupType = businessType === 'hotel_group' || businessType === 'cafe_multi_branch' || businessType === 'restaurant_multi_branch';
  if (isGroupType && bundle.branches.length < 2) {
    console.warn(`[TEST_MODE] Group business type "${businessType}" requires at least 2 branches, but fixture has ${bundle.branches.length}`);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[TEST_MODE] Group business requires at least 2 branches');
    }
  }

  let businessGroup = businessGroupService.getBusinessGroup();
  if (!businessGroup) {
    businessGroup = businessGroupService.initializeBusinessStructure().businessGroup;
  }
  if (!businessGroup) {
    throw new Error('[TEST_MODE] Business group not found');
  }

  const fixtureBranches = bundle.branches.map((fixtureBranch, index) => {
    // Map branchType to BranchBusinessType enum
    let businessTypeEnum: BranchBusinessType;
    if (fixtureBranch.branchType === 'hotel') {
      businessTypeEnum = BranchBusinessType.HOTEL_RESORT;
    } else if (fixtureBranch.branchType === 'cafe' || fixtureBranch.branchType === 'restaurant') {
      businessTypeEnum = BranchBusinessType.CAFE_RESTAURANT;
    } else {
      // Default based on business type
      if (businessType === 'hotel_group' || businessType === 'hotel_no_fnb' || businessType === 'hotel_with_fnb') {
        businessTypeEnum = BranchBusinessType.HOTEL_RESORT;
      } else {
        businessTypeEnum = BranchBusinessType.CAFE_RESTAURANT;
      }
    }

    // Extract location from branchName if possible (e.g., "Hotel - Bangkok" -> city: "Bangkok")
    let location: { city?: string; country?: string } | undefined;
    const nameParts = fixtureBranch.branchName.split(' - ');
    if (nameParts.length > 1) {
      location = { city: nameParts[1] };
    }

    return {
      id: fixtureBranch.branchId, // Use fixture branchId as id
      businessGroupId: businessGroup.id,
      branchName: fixtureBranch.branchName,
      businessType: businessTypeEnum,
      location,
      operatingDays: {
        weekdays: true,
        weekends: true,
      },
      isDefault: index === 0, // First branch is default
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  // Replace all branches with fixture branches
  // This ensures TEST_MODE branches are the source of truth
  localStorage.setItem('hospitality_branches', JSON.stringify(fixtureBranches));
  
  console.log(`[TEST_MODE] Synced ${fixtureBranches.length} branches to business-group-service`);
  console.log(`[TEST_MODE] Branch names:`, fixtureBranches.map(b => b.branchName).join(', '));
}
