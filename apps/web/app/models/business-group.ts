/**
 * Business Group and Branch Models
 * 
 * Hierarchy:
 * - Owner Account (1) → Business Group (1) → Branches (many)
 * - All alerts, insights, and health scores belong to a specific Branch
 */

export interface BusinessGroup {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Module Type Enum
 * Determines which features and alerts are available for a branch
 */
export enum ModuleType {
  ACCOMMODATION = 'accommodation',
  FNB = 'fnb',
}

/**
 * Operating Days Configuration
 */
export interface OperatingDays {
  weekdays: boolean;  // Monday-Friday
  weekends: boolean;   // Saturday-Sunday
}

/**
 * Location Information
 */
export interface BranchLocation {
  city?: string;
  country?: string;
}

/** Branch module type from DB (module_type). Determines Log Today form; no inference, no default in UI. */
export type BranchModuleType = 'accommodation' | 'fnb';

export interface Branch {
  id: string;
  businessGroupId: string;
  branchName: string;  // Renamed from 'name' for clarity
  /** Source of truth from DB. Determines which log form to show. */
  moduleType?: BranchModuleType;
  modules: ModuleType[]; // Derived from moduleType for backward compat
  location?: BranchLocation;
  operatingDays?: OperatingDays;
  isDefault: boolean;
  sortOrder?: number;
  createdAt: Date;
  businessType?: 'CAFE_RESTAURANT' | 'HOTEL_RESORT' | 'HOTEL_WITH_CAFE';
  totalRooms?: number;
  accommodationStaffCount?: number;
  /** F&B branches: staff count and monthly fixed cost (from branches table). */
  fnbStaffCount?: number;
  monthlyFixedCost?: number;
}

/**
 * Legacy Branch Business Type Enum (deprecated - use modules instead)
 * @deprecated Use modules array instead
 */
export enum BranchBusinessType {
  CAFE_RESTAURANT = 'CAFE_RESTAURANT',      // Maps to ['fnb']
  HOTEL_RESORT = 'HOTEL_RESORT',            // Maps to ['accommodation']
  HOTEL_WITH_CAFE = 'HOTEL_WITH_CAFE',      // Maps to ['accommodation', 'fnb']
}

/**
 * Migration utility: Convert legacy businessType to modules
 */
export function migrateBusinessTypeToModules(businessType?: BranchBusinessType | string): ModuleType[] {
  if (!businessType) {
    return [ModuleType.FNB]; // Default to F&B for backward compatibility
  }

  const type = typeof businessType === 'string' 
    ? businessType.toUpperCase() 
    : businessType;

  switch (type) {
    case BranchBusinessType.HOTEL_WITH_CAFE:
    case 'HOTEL_WITH_CAFE':
      return [ModuleType.ACCOMMODATION, ModuleType.FNB];
    
    case BranchBusinessType.HOTEL_RESORT:
    case 'HOTEL_RESORT':
    case 'HOTEL':
      return [ModuleType.ACCOMMODATION];
    
    case BranchBusinessType.CAFE_RESTAURANT:
    case 'CAFE_RESTAURANT':
    case 'CAFE':
    case 'RESTAURANT':
      return [ModuleType.FNB];
    
    default:
      return [ModuleType.FNB]; // Default fallback
  }
}

/**
 * Check if branch has a specific module enabled
 */
export function hasModule(branch: Branch, moduleType: ModuleType): boolean {
  return branch.modules?.includes(moduleType) ?? false;
}

/**
 * Check if branch has accommodation module
 */
export function hasAccommodationModule(branch: Branch): boolean {
  return hasModule(branch, ModuleType.ACCOMMODATION);
}

/**
 * Check if branch has F&B module
 */
export function hasFnbModule(branch: Branch): boolean {
  return hasModule(branch, ModuleType.FNB);
}
