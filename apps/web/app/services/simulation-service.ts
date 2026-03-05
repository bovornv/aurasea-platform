/**
 * Simulation Service
 * 
 * Integrates simulation engine with operational signals service.
 * When simulation mode is active, generates and injects simulation data.
 */

'use client';

import { generateSimulationDataset } from '../../../../core/simulation/simulation-engine';
import type { SimulationType, SimulationScenario, SimulationControls } from '../providers/test-mode-provider';
import type { Branch } from '../models/business-group';
import type { BranchMetrics } from '../models/branch-metrics';
import type { OperationalSignal } from './operational-signals-service';
import { operationalSignalsService } from './operational-signals-service';
import { businessGroupService } from './business-group-service';

let currentSimulationDataset: ReturnType<typeof generateSimulationDataset> | null = null;

/**
 * Check if simulation mode is active
 */
export function isSimulationModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  
  // PART 1: Check real data guard - force disable if real data only mode
  try {
    const { checkRealDataGuard } = require('../utils/real-data-guard');
    const guard = checkRealDataGuard();
    if (guard.dataSource === 'REAL_SUPABASE') {
      return false; // Force disabled for real data only mode
    }
    return guard.simulationActive;
  } catch (e) {
    // Fallback to original check if module not found
  }
  
  try {
    const stored = localStorage.getItem('aurasea_test_mode');
    if (stored) {
      const parsed = JSON.parse(stored);
      return !!parsed.simulationType;
    }
  } catch (e) {
    // Ignore errors
  }
  
  return false;
}

/**
 * Get current simulation state
 */
export function getSimulationState(): {
  type: SimulationType;
  scenario: SimulationScenario;
  controls: SimulationControls;
} | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem('aurasea_test_mode');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.simulationType) {
        return {
          type: parsed.simulationType,
          scenario: parsed.simulationScenario || 'healthy',
          controls: parsed.simulationControls || {},
        };
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return null;
}

/**
 * Generate and cache simulation dataset
 */
export function generateAndCacheSimulation(): void {
  const state = getSimulationState();
  if (!state || !state.type) {
    currentSimulationDataset = null;
    return;
  }
  
  try {
    currentSimulationDataset = generateSimulationDataset(
      state.type,
      state.scenario,
      state.controls
    );
    
    // Inject simulation data into operational signals service
    injectSimulationData(currentSimulationDataset);
    
    console.log('[SIMULATION] Dataset generated and cached:', {
      type: state.type,
      scenario: state.scenario,
      branches: currentSimulationDataset.branches.length,
    });
  } catch (e) {
    console.error('[SIMULATION] Failed to generate dataset:', e);
    currentSimulationDataset = null;
  }
}

/**
 * Inject simulation data into operational signals service and business group service
 */
function injectSimulationData(dataset: ReturnType<typeof generateSimulationDataset>): void {
  // Sync simulation branches to business-group-service
  syncSimulationBranchesToBusinessGroup(dataset);
  
  // Save metrics to operational-signals-service (localStorage only, NOT database)
  // CRITICAL: saveMetrics() now checks for simulation mode and skips database writes
  dataset.branches.forEach(branch => {
    operationalSignalsService.saveMetrics(branch.metrics);
  });
  
  console.log(`[SIMULATION] Injected ${dataset.branches.length} branch metrics to operational-signals-service (localStorage only, NOT database)`);
  
  // Health score snapshots are now generated on-demand via monitoring service
  // No need to pre-generate 40 days of snapshots (removed async operation)
}

/**
 * Sync simulation branches to business-group-service
 * This ensures branches from simulation are available in the UI
 */
function syncSimulationBranchesToBusinessGroup(dataset: ReturnType<typeof generateSimulationDataset>): void {
  if (typeof window === 'undefined') return;
  if (!dataset?.branches || dataset.branches.length === 0) return;

  try {
    const businessGroupService = require('./business-group-service').businessGroupService;
    const { ModuleType } = require('../models/business-group');
    
    // Ensure business group exists
    let businessGroup = businessGroupService.getBusinessGroup();
    if (!businessGroup) {
      businessGroup = businessGroupService.initializeBusinessStructure().businessGroup;
    }

    // Map simulation branches to Branch model
    const simulationBranches = dataset.branches.map((branch, index) => {
      // Determine modules from metrics
      const modules: string[] = [];
      if (branch.metrics.modules.accommodation) {
        modules.push(ModuleType.ACCOMMODATION);
      }
      if (branch.metrics.modules.fnb) {
        modules.push(ModuleType.FNB);
      }
      
      // Default to FNB if no modules detected
      if (modules.length === 0) {
        modules.push(ModuleType.FNB);
      }

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
        isDefault: index === 0, // First branch is default
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Get existing branches and filter out old simulation branches
    const existingBranches = businessGroupService.getAllBranches();
    const nonSimulationBranches = existingBranches.filter(
      (b: Branch) => !b.id.startsWith('sim-')
    );
    
    // Combine non-simulation branches with simulation branches
    const allBranches = [...nonSimulationBranches, ...simulationBranches];
    
    // Save to localStorage (business-group-service uses 'hospitality_branches' key)
    localStorage.setItem('hospitality_branches', JSON.stringify(allBranches));
    
    console.log(`[SIMULATION] Synced ${simulationBranches.length} branches to business-group-service`);
    console.log(`[SIMULATION] Branch names:`, simulationBranches.map(b => b.branchName).join(', '));

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
    console.error('[SIMULATION] Failed to sync branches to business-group-service:', e);
  }
}

/**
 * Get simulation metrics for a branch
 */
export function getSimulationMetrics(branchId: string | null): BranchMetrics | null {
  if (!currentSimulationDataset) {
    generateAndCacheSimulation();
  }
  
  if (!currentSimulationDataset) {
    return null;
  }
  
  // Handle "__all__" or null branch ID - return first branch's metrics
  if (!branchId || branchId === '__all__') {
    return currentSimulationDataset.branches[0]?.metrics || null;
  }
  
  const branch = currentSimulationDataset.branches.find(b => b.branchId === branchId);
  return branch?.metrics || null;
}

/**
 * Get all simulation branches
 */
export function getAllSimulationBranches(): Array<{ branchId: string; branchName: string; metrics: BranchMetrics }> {
  if (!currentSimulationDataset) {
    generateAndCacheSimulation();
  }
  
  if (!currentSimulationDataset) {
    return [];
  }
  
  return currentSimulationDataset.branches.map(b => ({
    branchId: b.branchId,
    branchName: b.branchName,
    metrics: b.metrics,
  }));
}

/**
 * Get simulation operational signals (for backward compatibility)
 */
export function getSimulationSignals(branchId: string): OperationalSignal[] {
  if (!currentSimulationDataset) {
    generateAndCacheSimulation();
  }
  
  if (!currentSimulationDataset) {
    return [];
  }
  
  const branch = currentSimulationDataset.branches.find(b => b.branchId === branchId);
  if (!branch) {
    return [];
  }
  
  // Convert daily metrics to operational signals
  const signals: OperationalSignal[] = branch.dailyMetrics.map((daily, index) => {
    const date = new Date(daily.date);
    date.setHours(12, 0, 0, 0); // Set to noon for consistency
    
    // Calculate cumulative values
    const daysSoFar = index + 1;
    const revenue7Days = branch.dailyMetrics
      .slice(Math.max(0, index - 6), index + 1)
      .reduce((sum, d) => sum + d.revenue, 0);
    const revenue30Days = branch.dailyMetrics
      .slice(0, index + 1)
      .reduce((sum, d) => sum + d.revenue, 0);
    
    // Estimate costs (70% of revenue average)
    const avgDailyCost = revenue30Days / daysSoFar * 0.70;
    const costs7Days = avgDailyCost * Math.min(7, daysSoFar);
    const costs30Days = avgDailyCost * daysSoFar;
    
    return {
      timestamp: date,
      cashBalance: branch.metrics.financials.cashBalanceTHB,
      revenue7Days,
      revenue30Days,
      costs7Days,
      costs30Days,
      staffCount: branch.metrics.modules.accommodation?.totalStaffAccommodation || 
                  branch.metrics.modules.fnb?.totalStaffFnb || 10,
      occupancyRate: daily.occupancyRate,
      averageDailyRate: daily.averageDailyRoomRate,
      totalRooms: branch.metrics.modules.accommodation?.totalRoomsAvailable,
      customerVolume: daily.customers,
      branchId: branch.branchId,
    };
  });
  
  return signals;
}

/**
 * Generate health score snapshots for all 40 days of simulation data
 * This runs asynchronously and should not block the main thread
 */
function generateSimulationHealthScoreSnapshots(dataset: ReturnType<typeof generateSimulationDataset>): void {
  if (typeof window === 'undefined') return;
  
  // Run asynchronously to avoid blocking
  setTimeout(() => {
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) {
        console.log('[SIMULATION] No business group - skipping snapshot generation');
        return;
      }

      const {
        generateHealthScoreSnapshot,
        saveHealthScoreSnapshot,
        saveAlertSnapshots,
        generateAlertSnapshots,
      } = require('../../../../core/sme-os/engine/services/health-score-trend-service');
      const { monitoringService } = require('./monitoring-service');

      // Evaluate alerts for current simulation data with timeout
      // We'll use these alerts to create historical snapshots
      const evaluationPromise = monitoringService.evaluate(null, {
        businessType: null,
        scenario: null,
        version: 0,
      });
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Evaluation timeout')), 10000);
      });
      
      Promise.race([evaluationPromise, timeoutPromise]).then((result: any) => {
      const alerts = result.alerts || [];
      
      // Create snapshots for the past 40 days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Calculate base health score from current alerts
      const baseScore = alerts.length === 0 ? 100 : 
        Math.max(0, Math.min(100, 100 - (alerts.filter((a: any) => a.severity === 'critical').length * 15) - 
          (alerts.filter((a: any) => a.severity === 'warning').length * 5)));
      
      // Generate snapshots for each branch
      dataset.branches.forEach(branch => {
        const branchAlerts = alerts.filter((a: any) => a.branchId === branch.branchId);
        
        // Create 40 days of snapshots with slight variation to show trends
        for (let dayOffset = 39; dayOffset >= 0; dayOffset--) {
          const snapshotDate = new Date(today);
          snapshotDate.setDate(snapshotDate.getDate() - dayOffset);
          snapshotDate.setHours(0, 0, 0, 0);
          
          // Vary health score slightly over time (simulate trend)
          // Start lower and improve over time (or vice versa based on scenario)
          const progress = (39 - dayOffset) / 39; // 0 to 1 over 40 days
          const variation = (Math.random() - 0.5) * 5; // ±2.5 points random variation
          const trendAdjustment = progress * 3; // Gradual improvement
          const score = Math.max(0, Math.min(100, baseScore + trendAdjustment + variation));
          
          // Create snapshot with this date
          const snapshot = {
            date: snapshotDate,
            score: Math.round(score * 10) / 10,
            totalPenalty: Math.max(0, 100 - score),
            alertCounts: {
              critical: branchAlerts.filter((a: any) => a.severity === 'critical').length,
              warning: branchAlerts.filter((a: any) => a.severity === 'warning').length,
              informational: branchAlerts.filter((a: any) => a.severity === 'informational').length,
            },
            branchId: branch.branchId,
            businessGroupId: businessGroup.id,
          };
          
          // Save snapshot (will overwrite if exists)
          const storageKey = `health_score_snapshot_${businessGroup.id}_${branch.branchId}`;
          const stored = localStorage.getItem(storageKey);
          const snapshots = stored ? JSON.parse(stored) : {};
          const dateKey = snapshotDate.toISOString().split('T')[0];
          snapshots[dateKey] = {
            ...snapshot,
            date: snapshotDate.toISOString(),
          };
          localStorage.setItem(storageKey, JSON.stringify(snapshots));
        }
        
        // Also create group-level snapshots if multiple branches
        if (dataset.branches.length > 1) {
          const allBranchAlerts = alerts.filter((a: any) => 
            dataset.branches.some(b => b.branchId === a.branchId)
          );
          
          for (let dayOffset = 39; dayOffset >= 0; dayOffset--) {
            const snapshotDate = new Date(today);
            snapshotDate.setDate(snapshotDate.getDate() - dayOffset);
            snapshotDate.setHours(0, 0, 0, 0);
            
            const progress = (39 - dayOffset) / 39;
            const variation = (Math.random() - 0.5) * 5;
            const trendAdjustment = progress * 3;
            const groupBaseScore = allBranchAlerts.length === 0 ? 100 :
              Math.max(0, Math.min(100, 100 - (allBranchAlerts.filter((a: any) => a.severity === 'critical').length * 15) - 
                (allBranchAlerts.filter((a: any) => a.severity === 'warning').length * 5)));
            const score = Math.max(0, Math.min(100, groupBaseScore + trendAdjustment + variation));
            
            const groupSnapshot = {
              date: snapshotDate,
              score: Math.round(score * 10) / 10,
              totalPenalty: Math.max(0, 100 - score),
              alertCounts: {
                critical: allBranchAlerts.filter((a: any) => a.severity === 'critical').length,
                warning: allBranchAlerts.filter((a: any) => a.severity === 'warning').length,
                informational: allBranchAlerts.filter((a: any) => a.severity === 'informational').length,
              },
              branchId: undefined,
              businessGroupId: businessGroup.id,
            };
            
            const groupStorageKey = `health_score_snapshot_${businessGroup.id}`;
            const groupStored = localStorage.getItem(groupStorageKey);
            const groupSnapshots = groupStored ? JSON.parse(groupStored) : {};
            const dateKey = snapshotDate.toISOString().split('T')[0];
            groupSnapshots[dateKey] = {
              ...groupSnapshot,
              date: snapshotDate.toISOString(),
            };
            localStorage.setItem(groupStorageKey, JSON.stringify(groupSnapshots));
          }
        }
      });
      
        console.log(`[SIMULATION] Generated health score snapshots for 40 days`);
      }).catch((e: any) => {
        console.error('[SIMULATION] Failed to generate health score snapshots:', e);
        // Don't throw - this is non-critical
      });
    } catch (e) {
      console.error('[SIMULATION] Failed to generate health score snapshots:', e);
      // Don't throw - this is non-critical
    }
  }, 100); // Small delay to avoid blocking
}

/**
 * Clear simulation cache
 */
export function clearSimulationCache(): void {
  currentSimulationDataset = null;
}
