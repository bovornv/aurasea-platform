/**
 * Business Capabilities Service
 * 
 * Determines which modules (Accommodation vs F&B) a business supports
 * based on branch modules configuration.
 */

import type { BusinessSetup } from '../contexts/business-setup-context';
import { ModuleType, hasAccommodationModule, hasFnbModule } from '../models/business-group';
import { businessGroupService } from './business-group-service';
import type { Branch } from '../models/business-group';

export interface BusinessCapabilities {
  hasHotel: boolean; // Legacy name - maps to accommodation module
  hasFnb: boolean;
  isMixed: boolean; // Has both accommodation and F&B modules
}

/**
 * Determine business capabilities from business setup (for initial setup)
 * Falls back to branch modules after setup is complete
 */
export function getBusinessCapabilities(setup: BusinessSetup | null): BusinessCapabilities {
  // If no setup, check branch-level capabilities
  if (!setup || !setup.businessType) {
    return getCapabilitiesFromBranches();
  }

  // Map legacy business types to modules for backward compatibility
  switch (setup.businessType) {
    case 'hotel_resort':
      return { hasHotel: true, hasFnb: false, isMixed: false };
    
    case 'cafe_restaurant':
      return { hasHotel: false, hasFnb: true, isMixed: false };
    
    case 'hotel_with_cafe':
      return { hasHotel: true, hasFnb: true, isMixed: true };
    
    case 'other':
    default:
      // For "other", check branch-level capabilities
      return getCapabilitiesFromBranches();
  }
}

/**
 * Determine capabilities from branch modules (module-based architecture)
 */
export function getCapabilitiesFromBranches(): BusinessCapabilities {
  try {
    const branches = businessGroupService.getAllBranches();
    
    if (branches.length === 0) {
      return { hasHotel: false, hasFnb: false, isMixed: false };
    }

    // Check if any branch has accommodation module
    const hasHotel = branches.some(branch => hasAccommodationModule(branch));

    // Check if any branch has F&B module
    const hasFnb = branches.some(branch => hasFnbModule(branch));

    return {
      hasHotel,
      hasFnb,
      isMixed: hasHotel && hasFnb,
    };
  } catch (e) {
    console.error('Failed to get capabilities from branches:', e);
    return { hasHotel: false, hasFnb: false, isMixed: false };
  }
}

/**
 * Get capabilities for a specific branch based on its modules
 */
export function getBranchCapabilities(branch: Branch | null): BusinessCapabilities {
  if (!branch) {
    return { hasHotel: false, hasFnb: false, isMixed: false };
  }

  const hasHotel = hasAccommodationModule(branch);
  const hasFnb = hasFnbModule(branch);

  return {
    hasHotel,
    hasFnb,
    isMixed: hasHotel && hasFnb,
  };
}

/**
 * Get capability-aware tab visibility
 * Tabs are enabled based on individual capabilities, not mutually exclusive
 */
export function getTabVisibility(capabilities: BusinessCapabilities): {
  showHotelTab: boolean;
  showCafeTab: boolean;
  hotelTabEnabled: boolean;
  cafeTabEnabled: boolean;
} {
  return {
    showHotelTab: true, // Always show both tabs
    showCafeTab: true, // Always show both tabs
    hotelTabEnabled: capabilities.hasHotel, // Enabled if business has accommodation module
    cafeTabEnabled: capabilities.hasFnb, // Enabled if business has F&B module
  };
}
