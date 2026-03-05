/**
 * Simulation Sync Utilities
 * 
 * Pure, synchronous functions to sync simulation branches to business-group-service.
 * No async operations, no React dependencies, hook-safe.
 */

import type { BranchMetrics } from '../models/branch-metrics';
import { ModuleType, type Branch } from '../models/business-group';

/**
 * Sync simulation branches to business-group-service (synchronous)
 * This ensures branches from simulation are available in the UI
 */
export function syncSimulationBranchesSync(
  simulatedBranches: Array<{ branchId: string; branchName: string; metrics: BranchMetrics }>,
  businessGroupId: string
): void {
  if (typeof window === 'undefined') return;
  if (!simulatedBranches || simulatedBranches.length === 0) return;

  try {
    const businessGroupService = require('./business-group-service').businessGroupService;
    
    // Ensure business group exists
    let businessGroup = businessGroupService.getBusinessGroup();
    if (!businessGroup) {
      businessGroup = businessGroupService.initializeBusinessStructure().businessGroup;
    }

    // Map simulation branches to Branch model
    const simulationBranches = simulatedBranches.map((branch, index) => {
      // Determine modules from metrics - check if modules exist and have data
      const modules: string[] = [];
      
      // Check for accommodation module (must exist and have at least one property with a value)
      const accommodationModule = branch.metrics.modules.accommodation;
      if (accommodationModule && 
          typeof accommodationModule === 'object' &&
          Object.keys(accommodationModule).length > 0 &&
          (accommodationModule.occupancyRateLast30DaysPct !== undefined ||
           accommodationModule.totalRoomsAvailable !== undefined ||
           accommodationModule.averageDailyRoomRateTHB !== undefined)) {
        modules.push(ModuleType.ACCOMMODATION);
      }
      
      // Check for F&B module (must exist and have at least one property with a value)
      const fnbModule = branch.metrics.modules.fnb;
      if (fnbModule &&
          typeof fnbModule === 'object' &&
          Object.keys(fnbModule).length > 0 &&
          (fnbModule.totalCustomersLast7Days !== undefined ||
           fnbModule.averageTicketPerCustomerTHB !== undefined ||
           fnbModule.top3MenuRevenueShareLast30DaysPct !== undefined)) {
        modules.push(ModuleType.FNB);
      }
      
      // Default to FNB if no modules detected (shouldn't happen with proper presets)
      if (modules.length === 0) {
        console.warn(`[SIMULATION] No modules detected for branch ${branch.branchId}, defaulting to FNB`);
        modules.push(ModuleType.FNB);
      }
      
      console.log(`[SIMULATION] Branch ${branch.branchName} (${branch.branchId}) modules:`, modules);

      return {
        id: branch.branchId,
        branchName: branch.branchName,
        businessGroupId: businessGroup.id,
        modules: modules,
        location: {
          address: 'Simulation Location',
          city: 'Simulation City',
          province: 'Simulation Province',
          postalCode: '00000',
          country: 'TH',
        },
        operatingDays: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
        },
        isDefault: index === 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Get existing branches and filter out ALL old simulation branches
    // This ensures we completely replace simulation branches when switching types
    const existingBranches = businessGroupService.getAllBranches();
    const nonSimulationBranches = existingBranches.filter(
      (b: Branch) => !b.id.startsWith('sim-')
    );
    
    // Combine non-simulation branches with NEW simulation branches
    // Old simulation branches are completely replaced
    const allBranches = [...nonSimulationBranches, ...simulationBranches];
    
    // Save to localStorage (business-group-service uses 'hospitality_branches' key)
    localStorage.setItem('hospitality_branches', JSON.stringify(allBranches));
    
    // Force business-group-service to reload branches from localStorage
    // This ensures the service's internal cache is cleared
    if (businessGroupService.clearCache) {
      businessGroupService.clearCache();
    }
    
    console.log(`[SIMULATION] Synced ${simulationBranches.length} branches synchronously`);
    console.log(`[SIMULATION] Total branches after sync: ${allBranches.length} (${nonSimulationBranches.length} non-sim + ${simulationBranches.length} sim)`);
    console.log(`[SIMULATION] Branch details:`, simulationBranches.map(b => ({
      id: b.id,
      name: b.branchName,
      modules: b.modules
    })));
    
    // Log all branches to debug
    console.log(`[SIMULATION] All branches after sync:`, allBranches.map(b => ({
      id: b.id,
      name: b.branchName,
      modules: b.modules,
      isSimulation: b.id.startsWith('sim-')
    })));
    
    // Dispatch custom event to notify components that branches have changed
    // This ensures UI components reload branch data
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('branchesUpdated', {
        detail: { simulationType: 'active' }
      }));
    }

    // Set current branch to first simulation branch if "All Branches" is selected
    const currentBranchId = localStorage.getItem('hospitality_current_branch_id');
    if (!currentBranchId || currentBranchId === '__all__') {
      if (simulationBranches.length > 0) {
        // For multi-branch simulations, keep "__all__", for single branch, set to that branch
        if (simulationBranches.length === 1) {
          localStorage.setItem('hospitality_current_branch_id', simulationBranches[0].id);
        } else {
          localStorage.setItem('hospitality_current_branch_id', '__all__');
        }
      }
    }
  } catch (e) {
    console.error('[SIMULATION] Failed to sync branches synchronously:', e);
  }
}
