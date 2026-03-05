/**
 * Business Scenario Registry
 * 
 * Maps business types × scenarios to fixture bundles.
 * Each bundle includes operational signals, branch list, and vertical flags.
 */

export type BusinessType = 
  | 'cafe_single'
  | 'cafe_multi_branch'
  | 'restaurant_single'
  | 'restaurant_multi_branch'
  | 'hotel_no_fnb'
  | 'hotel_with_fnb'
  | 'hotel_group';

export type Scenario = 'good' | 'mixed' | 'bad';

export type ScenarioKey = `${BusinessType}:${Scenario}`;

export interface FixtureBundle {
  organizationId: string;
  branches: Array<{
    branchId: string;
    branchName: string;
    branchType: 'hotel' | 'cafe' | 'restaurant';
    dailyRevenue: Array<{ timestamp: string; dailyRevenue: number }>;
    menuRevenueDistribution?: Array<{
      timestamp: string;
      menuItemId: string;
      menuItemName: string;
      revenue: number;
    }>;
  }>;
  verticalFlags: {
    hasHotel: boolean;
    hasFnb: boolean;
    isMixed: boolean;
  };
}

/**
 * Scenario Registry
 * Maps scenarioKey to fixture file path
 */
export const SCENARIO_REGISTRY: Record<ScenarioKey, string> = {
  // Café Single Branch
  'cafe_single:good': 'cafe-single-good',
  'cafe_single:mixed': 'cafe-single-mixed',
  'cafe_single:bad': 'cafe-single-bad',
  
  // Café Multi-Branch
  'cafe_multi_branch:good': 'cafe-multi-good',
  'cafe_multi_branch:mixed': 'cafe-multi-mixed',
  'cafe_multi_branch:bad': 'cafe-multi-bad',
  
  // Restaurant Single Branch
  'restaurant_single:good': 'restaurant-single-good',
  'restaurant_single:mixed': 'restaurant-single-mixed',
  'restaurant_single:bad': 'restaurant-single-bad',
  
  // Restaurant Multi-Branch
  'restaurant_multi_branch:good': 'restaurant-multi-good',
  'restaurant_multi_branch:mixed': 'restaurant-multi-mixed',
  'restaurant_multi_branch:bad': 'restaurant-multi-bad',
  
  // Hotel No F&B
  'hotel_no_fnb:good': 'hotel-no-fnb-good',
  'hotel_no_fnb:mixed': 'hotel-no-fnb-mixed',
  'hotel_no_fnb:bad': 'hotel-no-fnb-bad',
  
  // Hotel With F&B
  'hotel_with_fnb:good': 'hotel-with-fnb-good',
  'hotel_with_fnb:mixed': 'hotel-with-fnb-mixed',
  'hotel_with_fnb:bad': 'hotel-with-fnb-bad',
  
  // Hotel Group
  'hotel_group:good': 'hotel-group-good',
  'hotel_group:mixed': 'hotel-group-mixed',
  'hotel_group:bad': 'hotel-group-bad',
};

/**
 * Get scenario key from business type and scenario
 * Format: businessType:scenario
 */
export function getScenarioKey(businessType: BusinessType, scenario: Scenario): ScenarioKey {
  return `${businessType}:${scenario}` as ScenarioKey;
}

/**
 * Parse scenario key into business type and scenario
 * Supports both colon format (new) and double underscore format (legacy)
 */
export function parseScenarioKey(scenarioKey: string): { businessType: BusinessType; scenario: Scenario } | null {
  // Try colon format first (new format)
  let parts = scenarioKey.split(':');
  if (parts.length !== 2) {
    // Fall back to double underscore format (legacy)
    parts = scenarioKey.split('__');
    if (parts.length !== 2) return null;
  }
  
  const businessType = parts[0] as BusinessType;
  const scenario = parts[1] as Scenario;
  
  // Normalize to colon format
  const normalizedKey = `${businessType}:${scenario}` as ScenarioKey;
  if (!SCENARIO_REGISTRY[normalizedKey]) {
    return null;
  }
  
  return { businessType, scenario };
}

/**
 * Get fixture file name for scenario key
 */
export function getFixtureFileName(scenarioKey: ScenarioKey): string | null {
  return SCENARIO_REGISTRY[scenarioKey] || null;
}

/**
 * Get all available business types
 */
export function getBusinessTypes(): BusinessType[] {
  return [
    'cafe_single',
    'cafe_multi_branch',
    'restaurant_single',
    'restaurant_multi_branch',
    'hotel_no_fnb',
    'hotel_with_fnb',
    'hotel_group',
  ];
}

/**
 * Get all available scenarios
 */
export function getScenarios(): Scenario[] {
  return ['good', 'mixed', 'bad'];
}

/**
 * Get display label for business type
 */
export function getBusinessTypeLabel(businessType: BusinessType): string {
  const labels: Record<BusinessType, string> = {
    'cafe_single': 'Café (Single Branch)',
    'cafe_multi_branch': 'Café (Multi-Branch)',
    'restaurant_single': 'Restaurant (Single Branch)',
    'restaurant_multi_branch': 'Restaurant (Multi-Branch)',
    'hotel_no_fnb': 'Hotel (No F&B)',
    'hotel_with_fnb': 'Hotel (With F&B)',
    'hotel_group': 'Hotel Group',
  };
  return labels[businessType];
}

/**
 * Get display label for business type (short format for TEST_MODE display)
 */
export function getBusinessTypeDisplayName(businessType: BusinessType): string {
  const labels: Record<BusinessType, string> = {
    'cafe_single': 'Cafe Single',
    'cafe_multi_branch': 'Cafe Multi',
    'restaurant_single': 'Restaurant Single',
    'restaurant_multi_branch': 'Restaurant Multi',
    'hotel_no_fnb': 'Hotel (No F&B)',
    'hotel_with_fnb': 'Hotel (With F&B)',
    'hotel_group': 'Hotel Group',
  };
  return labels[businessType];
}

/**
 * Get display label for scenario
 */
export function getScenarioLabel(scenario: Scenario): string {
  const labels: Record<Scenario, string> = {
    'good': 'Good',
    'mixed': 'Mixed',
    'bad': 'Bad',
  };
  return labels[scenario];
}
