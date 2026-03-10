/**
 * Business Group Service
 * 
 * Manages Business Groups and Branches hierarchy.
 * Handles auto-migration of existing single-location users.
 */
'use client';

import type { BusinessGroup, Branch, BranchLocation, OperatingDays } from '../models/business-group';
import { BranchBusinessType, ModuleType, migrateBusinessTypeToModules } from '../models/business-group';
import { BRANCH_SELECT } from '../lib/db-selects';

class BusinessGroupService {
  private businessGroupKey = 'hospitality_business_group';
  private branchesKey = 'hospitality_branches';
  private currentBranchKey = 'hospitality_current_branch_id';
  private migrationKey = 'hospitality_multi_branch_migrated';

  /**
   * Initialize business structure. Does not create or generate IDs.
   * Business group and branches must come from Supabase (e.g. syncBranchesFromSupabaseForOrg).
   * Default branch: use branches[0].id from Supabase response.
   */
  initializeBusinessStructure(): { businessGroup: BusinessGroup | null; defaultBranch: Branch | null; wasJustMigrated: boolean } {
    const migrated = localStorage.getItem(this.migrationKey);
    if (migrated !== 'true') {
      localStorage.setItem(this.migrationKey, 'true');
    }
    const businessGroup = this.getBusinessGroup();
    const defaultBranch = this.getDefaultBranch();
    return { businessGroup, defaultBranch, wasJustMigrated: false };
  }

  /**
   * Get current Business Group
   */
  getBusinessGroup(): BusinessGroup | null {
    // Only access localStorage on client side to avoid hydration mismatch
    if (typeof window === 'undefined') return null;
    
    try {
      const stored = localStorage.getItem(this.businessGroupKey);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      };
    } catch (e) {
      console.error('Failed to load business group:', e);
      return null;
    }
  }

  /**
   * Get default Branch
   */
  getDefaultBranch(): Branch | null {
    const branches = this.getAllBranches();
    return branches.find(b => b.isDefault) || branches[0] || null;
  }

  /**
   * Special value for "All Branches" selection
   */
  private readonly ALL_BRANCHES_KEY = '__all__';

  /**
   * Get current active Branch or null if "All Branches" is selected
   */
  getCurrentBranch(): Branch | null {
    const branchId = localStorage.getItem(this.currentBranchKey);
    if (!branchId || branchId === this.ALL_BRANCHES_KEY) {
      return null; // "All Branches" selected
    }
    const branches = this.getAllBranches();
    return branches.find(b => b.id === branchId) || null;
  }

  /**
   * Get current branch selection ID (branchId or "__all__").
   * Returns null when not set; caller must set from branches[0].id after branches are loaded (no default before load).
   */
  getCurrentBranchId(): string | null {
    if (typeof window === 'undefined') return null;
    const branchId = localStorage.getItem(this.currentBranchKey);
    return branchId || null;
  }

  /**
   * Set current active Branch or "All Branches"
   * @param branchId Branch ID or "__all__" for all branches view
   */
  setCurrentBranch(branchId: string): void {
    if (branchId === this.ALL_BRANCHES_KEY) {
      localStorage.setItem(this.currentBranchKey, this.ALL_BRANCHES_KEY);
    } else {
      const branches = this.getAllBranches();
      const branch = branches.find(b => b.id === branchId);
      // When branches not loaded yet (length === 0), persist selection so header/context populate after sync
      if (!branch && branches.length > 0) {
        return; // Have list but id not in it — avoid stale id
      }
      localStorage.setItem(this.currentBranchKey, branchId);
    }
    window.dispatchEvent(new Event('branchSelectionChanged'));
  }

  /**
   * Check if "All Branches" view is selected
   */
  isAllBranchesSelected(): boolean {
    const branchId = localStorage.getItem(this.currentBranchKey);
    return !branchId || branchId === this.ALL_BRANCHES_KEY;
  }

  /**
   * Get a branch by ID
   */
  getBranchById(branchId: string): Branch | undefined {
    const branches = this.getAllBranches();
    return branches.find(b => b.id === branchId);
  }

  /**
   * Get all Branches for current Business Group (from localStorage, synced from Supabase).
   * Automatically migrates branches from businessType to modules.
   * If no branches exist, returns empty array. Never creates or returns mock branches.
   */
  getAllBranches(): Branch[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(this.branchesKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      const migrated: Branch[] = [];
      let needsSave = false;

      parsed.forEach((b: any) => {
        // Migration: handle old 'name' field -> 'branchName'
        const branchName = b.branchName || b.name || 'Main Location';
        
        // Migration: Convert businessType to modules if modules don't exist
        let modules: ModuleType[];
        let legacyBusinessType: BranchBusinessType | undefined;
        
        if (b.modules && Array.isArray(b.modules) && b.modules.length > 0) {
          // Already migrated - use existing modules
          modules = b.modules.filter((m: string) => 
            m === ModuleType.ACCOMMODATION || m === ModuleType.FNB
          ) as ModuleType[];
          // Ensure at least one module
          if (modules.length === 0) {
            modules = [ModuleType.FNB];
            needsSave = true;
          }
          // Keep legacy businessType for backward compatibility
          legacyBusinessType = b.businessType;
        } else {
          // Need to migrate from businessType
          needsSave = true;
          
          // Handle old lowercase businessType -> BranchBusinessType enum
          if (b.businessType) {
            const businessTypeStr = String(b.businessType);
            
            // Check if it's already a valid enum value (string format)
            if (businessTypeStr === BranchBusinessType.CAFE_RESTAURANT || 
                businessTypeStr === BranchBusinessType.HOTEL_RESORT || 
                businessTypeStr === BranchBusinessType.HOTEL_WITH_CAFE) {
              legacyBusinessType = businessTypeStr as BranchBusinessType;
            } else {
              // Old format or invalid, convert
              const typeMap: Record<string, BranchBusinessType> = {
                'cafe_restaurant': BranchBusinessType.CAFE_RESTAURANT,
                'hotel_resort': BranchBusinessType.HOTEL_RESORT,
                'hotel_with_cafe': BranchBusinessType.HOTEL_WITH_CAFE,
                'other': BranchBusinessType.HOTEL_WITH_CAFE,
                // Handle uppercase versions too
                'CAFE_RESTAURANT': BranchBusinessType.CAFE_RESTAURANT,
                'HOTEL_RESORT': BranchBusinessType.HOTEL_RESORT,
                'HOTEL_WITH_CAFE': BranchBusinessType.HOTEL_WITH_CAFE,
              };
              legacyBusinessType = typeMap[businessTypeStr.toLowerCase()] || 
                            typeMap[businessTypeStr] || 
                            BranchBusinessType.CAFE_RESTAURANT;
            }
          } else {
            legacyBusinessType = BranchBusinessType.CAFE_RESTAURANT;
          }
          
          // Convert businessType to modules
          modules = migrateBusinessTypeToModules(legacyBusinessType);
        }

        // Ensure businessGroupId is set (migrate if missing)
        let businessGroupId = b.businessGroupId;
        if (!businessGroupId) {
          // If missing, get from current business group
          const currentGroup = this.getBusinessGroup();
          if (currentGroup) {
            businessGroupId = currentGroup.id;
            needsSave = true; // Mark for save to persist the fix
          }
        }
        
        migrated.push({
          ...b,
          branchName,
          businessGroupId, // Ensure businessGroupId is always set
          modules,
          businessType: legacyBusinessType, // Keep for backward compatibility
          location: b.location || undefined,
          operatingDays: b.operatingDays || {
            weekdays: true,
            weekends: true,
          },
          sortOrder: b.sortOrder ?? b.sort_order ?? 0,
          createdAt: new Date(b.createdAt),
        });
      });

      // Save migrated branches if migration occurred
      if (needsSave) {
        localStorage.setItem(this.branchesKey, JSON.stringify(migrated));
      }

      // Exclude any legacy mock branches (bg_*) so callers never get mock ids
      const validBranches = migrated.filter((b) => !b.id?.startsWith('bg_'));
      // Sort by sort_order only
      const branches = validBranches.sort((a, b) => {
        const orderA = a.sortOrder ?? 0;
        const orderB = b.sortOrder ?? 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      return branches;
    } catch (e) {
      console.error('Failed to load branches:', e);
      return [];
    }
  }

  /**
   * Add a branch that was created in Supabase. branchId must be UUID from Supabase (branch.id).
   * Do not generate branch IDs in frontend.
   */
  createBranch(
    branchName: string,
    modules: ModuleType[] = [ModuleType.FNB],
    location?: BranchLocation,
    operatingDays?: OperatingDays,
    branchId?: string
  ): Branch {
    const id = branchId ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const businessGroup = this.getBusinessGroup();
    if (!businessGroup) {
      throw new Error('Business Group not found. Call initializeBusinessStructure() first.');
    }

    const validModules = modules.filter(m => 
      m === ModuleType.ACCOMMODATION || m === ModuleType.FNB
    );
    if (validModules.length === 0) {
      validModules.push(ModuleType.FNB);
    }

    let legacyBusinessType: BranchBusinessType;
    if (validModules.includes(ModuleType.ACCOMMODATION) && validModules.includes(ModuleType.FNB)) {
      legacyBusinessType = BranchBusinessType.HOTEL_WITH_CAFE;
    } else if (validModules.includes(ModuleType.ACCOMMODATION)) {
      legacyBusinessType = BranchBusinessType.HOTEL_RESORT;
    } else {
      legacyBusinessType = BranchBusinessType.CAFE_RESTAURANT;
    }

    const existingBranches = this.getAllBranches();
    const maxOrder = existingBranches.length > 0
      ? Math.max(...existingBranches.map(b => b.sortOrder ?? 0))
      : -1;
    const nextOrder = maxOrder + 1;

    const branch: Branch = {
      id: id,
      businessGroupId: businessGroup.id,
      branchName,
      modules: validModules,
      businessType: legacyBusinessType,
      location: location || undefined,
      operatingDays: operatingDays ?? { weekdays: true, weekends: true },
      isDefault: false,
      sortOrder: nextOrder,
      createdAt: new Date(),
    };

    const branches = this.getAllBranches();
    branches.push(branch);
    localStorage.setItem(this.branchesKey, JSON.stringify(branches));

    // Dispatch event to notify other components of branch creation
    // Use setTimeout to ensure localStorage write completes before events fire
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        // Dispatch multiple events to ensure all components refresh
        window.dispatchEvent(new CustomEvent('branchUpdated', { 
          detail: { branchId: branch.id, action: 'created' } 
        }));
        window.dispatchEvent(new CustomEvent('branchSelectionChanged'));
        window.dispatchEvent(new CustomEvent('organizationChanged', { 
          detail: { organizationId: businessGroup.id } 
        }));
        // Also trigger storage event for cross-tab sync
        window.dispatchEvent(new StorageEvent('storage', {
          key: this.branchesKey,
          newValue: JSON.stringify(branches),
        }));
      }, 100); // Small delay to ensure localStorage write completes
    }

    return branch;
  }

  /**
   * Update Branch
   * Supports both modules-based and legacy businessType-based updates
   */
  updateBranch(
    branchId: string,
    updates: Partial<Pick<Branch, 'branchName' | 'modules' | 'businessType' | 'location' | 'operatingDays'>>
  ): Branch {
    const branches = this.getAllBranches();
    const index = branches.findIndex(b => b.id === branchId);
    if (index === -1) {
      throw new Error(`Branch with id ${branchId} not found`);
    }

    const normalizedUpdates: Partial<Branch> = {
      ...updates,
    };
    
    // Handle modules update
    if (updates.modules !== undefined) {
      // Validate modules
      const validModules = updates.modules.filter(m => 
        m === ModuleType.ACCOMMODATION || m === ModuleType.FNB
      );
      if (validModules.length === 0) {
        throw new Error('At least one module must be enabled');
      }
      normalizedUpdates.modules = validModules;
      
      // Update legacy businessType for backward compatibility
      if (validModules.includes(ModuleType.ACCOMMODATION) && validModules.includes(ModuleType.FNB)) {
        normalizedUpdates.businessType = BranchBusinessType.HOTEL_WITH_CAFE;
      } else if (validModules.includes(ModuleType.ACCOMMODATION)) {
        normalizedUpdates.businessType = BranchBusinessType.HOTEL_RESORT;
      } else {
        normalizedUpdates.businessType = BranchBusinessType.CAFE_RESTAURANT;
      }
    }
    
    // Handle legacy businessType update (for backward compatibility)
    if (updates.businessType !== undefined && updates.modules === undefined) {
      // Normalize businessType to ensure it's a valid enum value
      let businessType: BranchBusinessType;
      const validTypes = [
        BranchBusinessType.CAFE_RESTAURANT,
        BranchBusinessType.HOTEL_RESORT,
        BranchBusinessType.HOTEL_WITH_CAFE,
      ];
      if (validTypes.includes(updates.businessType as BranchBusinessType)) {
        businessType = updates.businessType as BranchBusinessType;
      } else {
        // Fallback: try to convert string to enum
        const typeMap: Record<string, BranchBusinessType> = {
          'CAFE_RESTAURANT': BranchBusinessType.CAFE_RESTAURANT,
          'HOTEL_RESORT': BranchBusinessType.HOTEL_RESORT,
          'HOTEL_WITH_CAFE': BranchBusinessType.HOTEL_WITH_CAFE,
        };
        businessType = typeMap[updates.businessType as string] || updates.businessType as BranchBusinessType;
      }
      normalizedUpdates.businessType = businessType;
      
      // Convert businessType to modules
      normalizedUpdates.modules = migrateBusinessTypeToModules(businessType);
    }

    branches[index] = {
      ...branches[index],
      ...normalizedUpdates,
    };

    localStorage.setItem(this.branchesKey, JSON.stringify(branches));
    
    // Dispatch event to notify other components of branch update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('branchUpdated', { 
        detail: { branchId, updates } 
      }));
      // Also dispatch organizationChanged to trigger full reload
      window.dispatchEvent(new CustomEvent('organizationChanged', { 
        detail: { organizationId: this.getBusinessGroup()?.id } 
      }));
    }
    
    return branches[index];
  }

  /**
   * Reorder branch by swapping sort_order with neighbour in DB, then refetch and merge into localStorage.
   * Uses sort_order only (no array index). Resolves when no swap candidate exists (no throw).
   */
  async reorderBranch(branchId: string, direction: 'up' | 'down'): Promise<void> {
    const businessGroup = this.getBusinessGroup();
    if (!businessGroup) {
      throw new Error('Business Group not found');
    }

    const orgId = businessGroup.id;
    let allBranches = this.getAllBranches();
    let branches = allBranches.filter(b => b.businessGroupId === orgId);
    const orderKey = (b: Branch) => b.sortOrder ?? 0;
    let sorted = [...branches].sort((a, b) => orderKey(a) - orderKey(b) || a.createdAt.getTime() - b.createdAt.getTime());

    const currentIndex = sorted.findIndex(b => b.id === branchId);
    if (currentIndex === -1) {
      throw new Error(`Branch ${branchId} not found in business group ${orgId}`);
    }
    const current = sorted[currentIndex];
    const neighbourIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (neighbourIndex < 0 || neighbourIndex >= sorted.length) {
      return;
    }
    let neighbour = sorted[neighbourIndex];

    // If order values are duplicate (e.g. all 0), normalize to contiguous 0,1,2... so swap persists correctly
    let currentOrder = orderKey(current);
    let neighbourOrder = orderKey(neighbour);
    if (currentOrder === neighbourOrder) {
      sorted.forEach((b, i) => {
        b.sortOrder = i;
      });
      localStorage.setItem(this.branchesKey, JSON.stringify(allBranches));
      currentOrder = currentIndex;
      neighbourOrder = neighbourIndex;
    }

    if (typeof window === 'undefined') return;

    try {
      const { getSupabaseClient, isSupabaseAvailable } = await import('../lib/supabase/client');
      if (!isSupabaseAvailable()) {
        this.reorderBranchLocalOnly(branchId, direction, allBranches, current, neighbour);
        this.dispatchBranchReordered(branchId, direction);
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        this.reorderBranchLocalOnly(branchId, direction, allBranches, current, neighbour);
        this.dispatchBranchReordered(branchId, direction);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const branchesTable = supabase.from('branches') as any;
      const [r1, r2] = await Promise.all([
        branchesTable.update({ sort_order: neighbourOrder }).eq('id', current.id),
        branchesTable.update({ sort_order: currentOrder }).eq('id', neighbour.id),
      ]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      await this.syncBranchesFromSupabaseForOrg(orgId);
      this.dispatchBranchReordered(branchId, direction);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[BusinessGroupService] Supabase reorder failed:', e);
      }
      throw e;
    }
  }

  private reorderBranchLocalOnly(
    _branchId: string,
    _direction: 'up' | 'down',
    allBranches: Branch[],
    current: Branch,
    neighbour: Branch
  ): void {
    const curOrder = current.sortOrder ?? 0;
    const nbOrder = neighbour.sortOrder ?? 0;
    const cur = allBranches.find(b => b.id === current.id);
    const nb = allBranches.find(b => b.id === neighbour.id);
    if (cur) {
      cur.sortOrder = nbOrder;
    }
    if (nb) {
      nb.sortOrder = curOrder;
    }
    localStorage.setItem(this.branchesKey, JSON.stringify(allBranches));
  }

  private dispatchBranchReordered(branchId: string, direction: 'up' | 'down'): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('branchUpdated', { detail: { branchId, action: 'reordered', direction } }));
    window.dispatchEvent(new CustomEvent('branchSelectionChanged'));
    window.dispatchEvent(new CustomEvent('storage'));
  }

  /**
   * Fetch branches for org from Supabase (order by sort_order) and merge into localStorage.
   */
  async syncBranchesFromSupabaseForOrg(orgId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const { getSupabaseClient, isSupabaseAvailable } = await import('../lib/supabase/client');
      if (!isSupabaseAvailable()) return;

      const supabase = getSupabaseClient();
      if (!supabase) return;
      // Branch filtering uses organization_id consistently (DB column)
      const { data: rows, error } = await supabase
        .from('branches')
        .select(BRANCH_SELECT)
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      if (!rows?.length) return;

      const mapRowToBranch = (row: any): Branch => {
        const mt = (row.module_type || '').toLowerCase();
        const moduleType: Branch['moduleType'] = mt === 'accommodation' ? 'accommodation' : mt === 'fnb' ? 'fnb' : undefined;
        const modules: ModuleType[] = moduleType === 'accommodation' ? [ModuleType.ACCOMMODATION] : moduleType === 'fnb' ? [ModuleType.FNB] : [];
        return {
          id: row.id,
          businessGroupId: row.organization_id ?? orgId,
          branchName: row.name ?? row.branch_name ?? 'Branch',
          moduleType,
          modules,
          location: undefined,
          operatingDays: { weekdays: true, weekends: true },
          isDefault: false,
          sortOrder: row.sort_order ?? 0,
          createdAt: row.created_at ? new Date(row.created_at) : new Date(0),
          totalRooms: (row as any).total_rooms ?? undefined,
          accommodationStaffCount: (row as any).accommodation_staff_count ?? undefined,
        };
      };

      const refetched = rows.map(mapRowToBranch);
      if (process.env.NODE_ENV === 'development') {
        refetched.forEach((b) => console.log('Loaded branch:', b));
      }
      const rest = this.getAllBranches().filter(b => b.businessGroupId !== orgId);
      const merged = [...rest, ...refetched];
      localStorage.setItem(this.branchesKey, JSON.stringify(merged));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[BusinessGroupService] syncBranchesFromSupabaseForOrg failed:', e);
      }
    }
  }

  /**
   * Sync branches for an org using branch_members for the current user.
   * Only branches the user is assigned to (via branch_members) are loaded.
   * If user has no branch_members for this org, falls back to all org branches (owner/admin).
   */
  async syncBranchesForOrgAndUser(orgId: string, userId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const { getSupabaseClient, isSupabaseAvailable } = await import('../lib/supabase/client');
      if (!isSupabaseAvailable()) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data: rows, error } = await supabase
        .from('branch_members')
        .select('branch_id, branches(id, name, organization_id, sort_order, created_at, module_type, total_rooms, accommodation_staff_count)')
        .eq('user_id', userId);

      if (error) throw error;

      type Row = { branch_id: string; branches: { id: string; name: string; organization_id: string; sort_order?: number; created_at?: string; module_type?: string | null; total_rooms?: number | null; accommodation_staff_count?: number | null } | null };
      const branchRows = (rows ?? []) as Row[];
      const branchesForOrg = branchRows
        .map((r) => r.branches)
        .filter((b): b is NonNullable<typeof b> => b != null && b.organization_id === orgId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const mapRowToBranch = (row: (typeof branchesForOrg)[0]): Branch => {
        const mt = (row.module_type || '').toLowerCase();
        const moduleType: Branch['moduleType'] = mt === 'accommodation' ? 'accommodation' : mt === 'fnb' ? 'fnb' : undefined;
        const modules: ModuleType[] = moduleType === 'accommodation' ? [ModuleType.ACCOMMODATION] : moduleType === 'fnb' ? [ModuleType.FNB] : [];
        return {
          id: row.id,
          businessGroupId: row.organization_id ?? orgId,
          branchName: row.name ?? 'Branch',
          moduleType,
          modules,
          location: undefined,
          operatingDays: { weekdays: true, weekends: true },
          isDefault: false,
          sortOrder: row.sort_order ?? 0,
          createdAt: row.created_at ? new Date(row.created_at) : new Date(0),
          totalRooms: row.total_rooms ?? undefined,
          accommodationStaffCount: row.accommodation_staff_count ?? undefined,
        };
      };

      const refetched = branchesForOrg.map(mapRowToBranch);
      if (refetched.length === 0) {
        await this.syncBranchesFromSupabaseForOrg(orgId);
        return;
      }
      const rest = this.getAllBranches().filter((b) => b.businessGroupId !== orgId);
      const merged = [...rest, ...refetched];
      localStorage.setItem(this.branchesKey, JSON.stringify(merged));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[BusinessGroupService] syncBranchesForOrgAndUser failed:', e);
      }
      await this.syncBranchesFromSupabaseForOrg(orgId);
    }
  }

  /**
   * Delete Branch
   */
  deleteBranch(branchId: string): void {
    const branches = this.getAllBranches();
    const filtered = branches.filter(b => b.id !== branchId);
    
    if (filtered.length === branches.length) {
      throw new Error(`Branch with id ${branchId} not found`);
    }

    localStorage.setItem(this.branchesKey, JSON.stringify(filtered));
    
    // Dispatch event to notify other components of branch deletion
    if (typeof window !== 'undefined') {
      const businessGroup = this.getBusinessGroup();
      window.dispatchEvent(new CustomEvent('branchUpdated', { 
        detail: { branchId, action: 'deleted' } 
      }));
      // Also dispatch organizationChanged to trigger full reload
      window.dispatchEvent(new CustomEvent('organizationChanged', { 
        detail: { organizationId: businessGroup?.id } 
      }));
    }
  }

  /**
   * Update Business Group name
   */
  updateBusinessGroupName(name: string): BusinessGroup {
    const businessGroup = this.getBusinessGroup();
    if (!businessGroup) {
      throw new Error('Business Group not found. Call initializeBusinessStructure() first.');
    }

    const updated: BusinessGroup = {
      ...businessGroup,
      name,
      updatedAt: new Date(),
    };

    localStorage.setItem(this.businessGroupKey, JSON.stringify(updated));
    return updated;
  }

}

export const businessGroupService = new BusinessGroupService();
