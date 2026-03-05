// Operational signals service - stores time-stamped operational data for continuous monitoring
// Supports TEST_MODE for loading fixture data in development
// Supports both legacy OperationalSignal format and new BranchMetrics format
'use client';

import { loadTestOperationalSignals, isTestModeEnabled } from './test-fixture-loader';
import type { BranchMetrics, FinancialMetrics, AccommodationMetrics, FnbMetrics } from '../models/branch-metrics';
import { isSimulationModeActive, getSimulationSignals, getSimulationMetrics } from './simulation-service';
import { convertDailyMetricsToSignals } from './daily-metrics-to-signals';
import { getDailyMetrics } from './db/daily-metrics-service';

/**
 * Get current TEST_MODE fixture key from URL
 */
function getCurrentTestFixtureKey(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const businessType = params.get('businessType');
  const scenario = params.get('scenario');
  
  if (businessType && scenario) {
    return `${businessType}:${scenario}`;
  }
  
  return null;
}

export interface MenuItemSignal {
  timestamp: Date;
  menuItemId: string;
  menuItemName: string;
  revenue: number;
}

export interface OperationalSignal {
  timestamp: Date;
  cashBalance: number;
  revenue7Days: number;
  revenue30Days: number;
  costs7Days: number;
  costs30Days: number;
  staffCount: number;
  occupancyRate?: number; // For hotels/resorts
  customerVolume?: number; // For cafes/restaurants (legacy - total customers)
  // Hotel/Resort specific fields (for hotel alerts)
  weekdayRevenue30d?: number; // Weekday revenue (last 30 days) - for Weekend-Weekday Imbalance alert
  weekendRevenue30d?: number; // Weekend revenue (last 30 days) - for Weekend-Weekday Imbalance alert
  averageDailyRate?: number; // Average Daily Rate (ADR) - for Weekend-Weekday Imbalance and Capacity Utilization alerts
  totalRooms?: number; // Total rooms available - for Capacity Utilization alert
  revenue90Days?: number; // Revenue (last 90 days) - optional, for trend stability
  costs90Days?: number; // Costs (last 90 days) - optional, for trend stability
  // Café/Restaurant specific fields (for F&B alerts)
  avgWeekdayRevenue14d?: number; // Average weekday revenue (last 14 days) - required for Low Weekday Utilization alert
  avgWeekendRevenue14d?: number; // Average weekend revenue (last 14 days) - required for Weekend-Weekday Gap alert
  avgCustomersPerWeekday?: number; // Average customers per weekday - for Demand Drop alert
  avgCustomersPerWeekend?: number; // Average customers per weekend day - for Demand Drop alert
  menuMixTop3Percent?: number; // % of revenue from top 3 menu items - for Menu Revenue Concentration alert (summary)
  // Daily fields for alert rules (FINAL PRODUCTION ARCHITECTURE)
  dailyRevenue?: number; // Daily revenue for BreakEvenRiskRule
  dailyExpenses?: number; // Daily expenses for BreakEvenRiskRule
  netCashFlow?: number; // Net cash flow (revenue - cost) for LiquidityRunwayRiskRule
  // Multi-branch support (backward compatible - optional field)
  branchId?: string;
}

export interface SignalTrend {
  signal: 'cash' | 'demand' | 'cost';
  direction: 'improving' | 'stable' | 'deteriorating';
  changePercent?: number;
}

class OperationalSignalsService {
  private storageKey = 'hospitality_operational_signals';
  private menuItemSignalsKey = 'hospitality_menu_item_signals';
  private lastTestFixtureKey: string | null = null; // Track TEST_MODE fixture key changes

  /**
   * Save a new operational signal (time-stamped record)
   * Automatically assigns current branchId if not provided
   */
  saveSignal(signal: Omit<OperationalSignal, 'timestamp'>): void {
    // Auto-assign branchId if not provided (backward compatibility)
    let signalWithBranch = signal;
    if (!signal.branchId) {
      try {
        const { businessGroupService } = require('./business-group-service');
        const currentBranch = businessGroupService.getCurrentBranch();
        if (currentBranch) {
          signalWithBranch = { ...signal, branchId: currentBranch.id };
        }
      } catch (e) {
        // BusinessGroupService not available yet, signal will be without branchId
        // This maintains backward compatibility
      }
    }

    const signals = this.getAllSignals();
    const newSignal: OperationalSignal = {
      ...signalWithBranch,
      timestamp: new Date(),
    };
    signals.push(newSignal);
    
    // Keep only last 90 days of signals
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const filteredSignals = signals.filter(s => new Date(s.timestamp) >= cutoffDate);
    
    localStorage.setItem(this.storageKey, JSON.stringify(filteredSignals));
  }

  /**
   * Update branchId for specific signals
   * Used when reassigning signals to detected branches
   */
  updateSignalsBranchIds(signalUpdates: Array<{ timestamp: Date; branchId: string }>): void {
    if (typeof window === 'undefined') return;

    const allSignals = this.getAllSignals(null);
    const timestampMap = new Map<string, string>();
    signalUpdates.forEach(update => {
      timestampMap.set(update.timestamp.toISOString(), update.branchId);
    });

    const updatedSignals = allSignals.map(signal => {
      const key = signal.timestamp.toISOString();
      const newBranchId = timestampMap.get(key);
      if (newBranchId) {
        return { ...signal, branchId: newBranchId };
      }
      return signal;
    });

    // Keep only last 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const filteredSignals = updatedSignals.filter(s => new Date(s.timestamp) >= cutoffDate);
    
    localStorage.setItem(this.storageKey, JSON.stringify(filteredSignals));
  }

  /**
   * Save BranchMetrics (new format)
   * 
   * CRITICAL: Checks if simulation mode is active and skips database write if so.
   * Simulation data should NEVER be persisted to database.
   * 
   * Also saves as legacy OperationalSignal for backward compatibility.
   */
  async saveMetrics(metrics: BranchMetrics): Promise<void> {
    // PART 2: REAL DATA ONLY - No simulation data saved to database
    // FINAL PRODUCTION ARCHITECTURE: No weekly_metrics, only daily_metrics
    // All metrics are saved via daily_metrics table using saveDailyMetric()
    // This function is kept for backward compatibility but does not save to database
    // Use saveDailyMetric() from daily-metrics-service.ts for new code
    if (process.env.NODE_ENV === 'development') {
      console.log('[OperationalSignals] saveMetrics() called - use saveDailyMetric() instead for daily metrics');
    }
    
    // Convert to legacy format and save to localStorage (for backward compatibility only)
    // REAL DATA ONLY: All production data goes to daily_metrics table
    const signal = convertMetricsToSignal(metrics);
    this.saveSignal(signal);
    
    // Also save in new format to localStorage (for backward compatibility and fallback)
    if (typeof window === 'undefined') return;
    
    try {
      const metricsKey = 'hospitality_branch_metrics';
      const stored = localStorage.getItem(metricsKey);
      const allMetrics: BranchMetrics[] = stored ? JSON.parse(stored) : [];
      
      // Remove existing metrics for this branch
      const filtered = allMetrics.filter(m => m.branchId !== metrics.branchId);
      
      // Add new metrics
      filtered.push(metrics);
      
      // Keep only last 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const recentMetrics = filtered.filter(m => new Date(m.updatedAt) >= cutoffDate);
      
      localStorage.setItem(metricsKey, JSON.stringify(recentMetrics));
      
      // Dispatch event to notify components of metrics update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('metricsUpdated', {
          detail: { branchId: metrics.branchId, groupId: metrics.groupId }
        }));
      }
    } catch (e) {
      console.error('Failed to save metrics in new format:', e);
      // Continue with legacy format only
    }
  }

  /**
   * Get latest BranchMetrics for a branch
   * 
   * STEP 5: When simulation is active, MUST use simulated data only.
   * No fallbacks to real metrics when simulation.active === true.
   * 
   * Tries database first, falls back to localStorage.
   * 
   * Components should use useResolvedBranchData() hook instead of calling this directly.
   */
  getLatestMetrics(branchId: string, groupId: string, modules?: string[]): BranchMetrics | null {
    if (branchId == null || branchId === '') return null;

    // STEP 5: Check simulation context first (if available)
    // If simulation is active, return simulated metrics ONLY (no fallback)
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('aurasea_test_mode');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.simulationType) {
            // Use pure simulation function
            const { generateSimulatedMetrics } = require('../../../../lib/simulation/generate-simulated-metrics');
            const simulatedBranches = generateSimulatedMetrics(
              parsed.simulationType,
              parsed.simulationScenario || 'healthy',
              parsed.simulationControls || {},
              groupId
            );
            
            if (simulatedBranches && simulatedBranches.length > 0) {
              // Handle "__all__" - return first branch's metrics
              const targetBranchId = branchId === '__all__' ? simulatedBranches[0].branchId : branchId;
              const branch = simulatedBranches.find((b: { branchId: string; branchName: string; metrics: BranchMetrics }) => b.branchId === targetBranchId);
              
              if (branch) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[SIMULATION] Returning simulated metrics for branch ${targetBranchId}`);
                }
                return branch.metrics;
              }
            }
            
            // If simulation is active but branch not found, return null (don't fallback)
            // Only warn if this looks like a simulation branch ID (starts with 'sim-')
            // Non-simulation branches (like cached 'br-*' IDs) are expected to be missing
            if (process.env.NODE_ENV === 'development' && branchId.startsWith('sim-')) {
              console.warn(`[SIMULATION] Branch ${branchId} not found in simulated branches`);
            }
            return null;
          }
        }
      } catch (e) {
        console.error('[SIMULATION] Failed to get simulation metrics:', e);
        // If simulation was supposed to be active, don't fallback
        // Check if simulationType exists in storage
        try {
          const stored = localStorage.getItem('aurasea_test_mode');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.simulationType) {
              // Simulation is active but failed - return null (don't fallback)
              return null;
            }
          }
        } catch (e2) {
          // Ignore
        }
      }
    }
    
    // Legacy simulation check (for backward compatibility during migration)
    // This should be removed once all components use useResolvedBranchData
    if (isSimulationModeActive()) {
      // Handle "__all__" - return first branch's metrics
      const targetBranchId = branchId === '__all__' ? null : branchId;
      if (targetBranchId) {
        const simulationMetrics = getSimulationMetrics(targetBranchId);
        if (simulationMetrics) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[SIMULATION] Returning legacy metrics for branch ${targetBranchId}`);
          }
          return simulationMetrics;
        }
      } else {
        // "__all__" - try to get first simulation branch
        try {
          const { getAllSimulationBranches } = require('./simulation-service');
          const allBranches = getAllSimulationBranches();
          if (allBranches.length > 0) {
            const firstBranchMetrics = getSimulationMetrics(allBranches[0].branchId);
            if (firstBranchMetrics) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[SIMULATION] Returning legacy metrics for first branch (__all__ view)`);
              }
              return firstBranchMetrics;
            }
          }
        } catch (e) {
          console.error('[SIMULATION] Failed to get simulation branches:', e);
        }
      }
      
      // If simulation is active but metrics not found, return null (don't fallback)
      return null;
    }
    
    // Try database first (only if NOT in simulation mode)
    // Note: Database calls are async, but we maintain sync interface for backward compatibility
    // We try localStorage first (sync), then attempt database (async, fire-and-forget)
    // Future: Consider making this method async
    // IMPORTANT: This is fire-and-forget and should NOT trigger re-renders
    if (typeof window !== 'undefined') {
      // Use a flag to prevent multiple concurrent requests for the same branchId
      const requestKey = `db_request_${branchId}`;
      if ((window as any)[requestKey]) {
        // Request already in progress - skip
        // Fall through to localStorage
      } else {
        try {
          // Mark request as in progress
          (window as any)[requestKey] = true;
          
          // Fire-and-forget database lookup (async, doesn't block)
          import('./db/metrics-service').then(({ getLatestMetrics: getDbMetrics }) => {
            return getDbMetrics(branchId, groupId);
          }).then((dbMetrics) => {
            // Clear request flag
            delete (window as any)[requestKey];
            
            if (dbMetrics) {
              // Cache in localStorage for next sync read
              try {
                const metricsKey = 'hospitality_branch_metrics';
                const stored = localStorage.getItem(metricsKey);
                const allMetrics: BranchMetrics[] = stored ? JSON.parse(stored) : [];
                const filtered = allMetrics.filter(m => m.branchId !== branchId);
                filtered.push(dbMetrics);
                localStorage.setItem(metricsKey, JSON.stringify(filtered));
              } catch (e) {
                // Ignore cache errors
              }
            }
          }).catch((error: any) => {
            // Clear request flag
            delete (window as any)[requestKey];
            
            // Log 406 errors once, but don't retry
            if (error?.status === 406 || error?.code === '22P02') {
              console.error('[METRICS] Fetch failed (406) - invalid branch_id format:', {
                branchId,
                error: error?.message || String(error),
              });
              // Don't retry - error is cached in metrics-service.ts
            }
            // Silently ignore other database errors - fallback to localStorage
          });
        } catch (e) {
          // Clear request flag on sync error
          delete (window as any)[requestKey];
          // Ignore errors
        }
      }
    }
    
    // Fallback to localStorage (for backward compatibility)
    if (typeof window !== 'undefined') {
      try {
        const metricsKey = 'hospitality_branch_metrics';
        const stored = localStorage.getItem(metricsKey);
        if (stored) {
          const allMetrics: BranchMetrics[] = JSON.parse(stored);
          const branchMetrics = allMetrics
            .filter(m => m.branchId === branchId)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          
          if (branchMetrics.length > 0) {
            return branchMetrics[0];
          }
        }
      } catch (e) {
        // Fall through to legacy conversion
      }
    }
    
    // Fall back to legacy format conversion
    const signal = this.getLatestSignal(branchId, groupId);
    if (!signal) return null;
    
    return convertSignalToMetrics(signal, branchId, groupId, modules);
  }

  /**
   * Get all signals (sorted by timestamp, newest first)
   * Optionally filter by branchId or businessGroupId
   * In TEST_MODE (dev only), loads data from fixtures based on ?scenario= query param
   * Auto-converts legacy signals to new format when reading
   * @param branchId Branch ID, "__all__" for all branches, or undefined/null for all
   * @param businessGroupId Optional business group ID for filtering when branchId is "__all__"
   */
  getAllSignals(branchId?: string | null, businessGroupId?: string): OperationalSignal[] {
    // Check for SIMULATION_MODE first - use pure function
    if (typeof window !== 'undefined' && businessGroupId) {
      try {
        const stored = localStorage.getItem('aurasea_test_mode');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.simulationType) {
            // Use pure simulation function to generate metrics
            const { generateSimulatedMetrics } = require('../../../../lib/simulation/generate-simulated-metrics');
            const simulatedBranches = generateSimulatedMetrics(
              parsed.simulationType,
              parsed.simulationScenario || 'healthy',
              parsed.simulationControls || {},
              businessGroupId
            );
            
            // Generate signals from metrics - create 40 days of historical signals for trend calculations
            if (simulatedBranches && simulatedBranches.length > 0) {
              const allSignals: OperationalSignal[] = [];
              
              simulatedBranches.forEach((branch: { branchId: string; branchName: string; metrics: BranchMetrics }) => {
                // Only include if branchId matches or "__all__"
                if (branchId === '__all__' || !branchId || branch.branchId === branchId) {
                  try {
                    const metrics = branch.metrics;
                    
                    // Generate 40 days of signals with historical progression
                    // This allows trend calculations to work properly
                    const today = new Date();
                    today.setHours(12, 0, 0, 0);
                    
                    // Base daily averages from 30-day totals (current/latest values)
                    const baseDailyRevenue = metrics.financials.revenueLast30DaysTHB / 30;
                    const baseDailyCosts = metrics.financials.costsLast30DaysTHB / 30;
                    
                    // STEP 2: Use dailyHistory if available (from generate-simulated-metrics.ts)
                    // This ensures signals reflect actual crisis conditions (cash decline, revenue drop, etc.)
                    const hasDailyHistory = metrics.dailyHistory && 
                                          metrics.dailyHistory.dates && 
                                          metrics.dailyHistory.dates.length > 0;
                    
                    if (hasDailyHistory && (metrics.dailyHistory?.dates.length ?? 0) === 40) {
                      // Use actual daily history from metrics - this reflects crisis conditions properly
                      const dailyHistory = metrics.dailyHistory!;
                      
                      for (let i = 0; i < 40; i++) {
                        const dateStr = dailyHistory.dates[i];
                        const signalDate = new Date(dateStr);
                        signalDate.setHours(12, 0, 0, 0);
                        
                        // Get actual daily values from history
                        const dailyRevenue = dailyHistory.revenue[i] || 0;
                        const dailyCosts = dailyHistory.costs[i] || 0;
                        const dailyCashBalance = dailyHistory.cashBalance[i] || metrics.financials.cashBalanceTHB;
                        
                        // Calculate cumulative values up to this day
                        const daysSoFar = i + 1;
                        const revenue7Days = dailyHistory.revenue.slice(Math.max(0, i - 6), i + 1).reduce((sum, r) => sum + r, 0);
                        const revenue30Days = dailyHistory.revenue.slice(0, i + 1).reduce((sum, r) => sum + r, 0);
                        const costs7Days = dailyHistory.costs.slice(Math.max(0, i - 6), i + 1).reduce((sum, c) => sum + c, 0);
                        const costs30Days = dailyHistory.costs.slice(0, i + 1).reduce((sum, c) => sum + c, 0);
                        
                        const signal: OperationalSignal = {
                          timestamp: signalDate,
                          cashBalance: dailyCashBalance,
                          revenue7Days,
                          revenue30Days,
                          costs7Days,
                          costs30Days,
                          staffCount: metrics.modules.accommodation?.totalStaffAccommodation || 
                                     metrics.modules.fnb?.totalStaffFnb || 10,
                          occupancyRate: dailyHistory.occupancy?.[i] !== undefined 
                            ? dailyHistory.occupancy[i]
                            : (metrics.modules.accommodation?.occupancyRateLast30DaysPct 
                                ? metrics.modules.accommodation.occupancyRateLast30DaysPct / 100
                                : undefined),
                          averageDailyRate: metrics.modules.accommodation?.averageDailyRoomRateTHB,
                          totalRooms: metrics.modules.accommodation?.totalRoomsAvailable,
                          customerVolume: dailyHistory.customers?.[i] !== undefined
                            ? dailyHistory.customers[i]
                            : (metrics.modules.fnb?.totalCustomersLast7Days 
                                ? Math.round(metrics.modules.fnb.totalCustomersLast7Days / 7)
                                : undefined),
                          branchId: branch.branchId,
                        };
                        
                        allSignals.push(signal);
                      }
                      
                      // STEP 2 & 7: Debug logging for crisis scenario
                      if (process.env.NODE_ENV === 'development') {
                        const scenario = parsed.simulationScenario || 'healthy';
                        if (scenario === 'crisis') {
                          const latestSignal = allSignals[allSignals.length - 1];
                          const monthlyBurnRate = latestSignal.costs30Days - latestSignal.revenue30Days;
                          const runwayMonths = monthlyBurnRate > 0 ? latestSignal.cashBalance / monthlyBurnRate : Infinity;
                          const revenueDrop = baseDailyRevenue * 30 > 0 
                            ? ((baseDailyRevenue * 30 - latestSignal.revenue30Days) / (baseDailyRevenue * 30)) * 100
                            : 0;
                          
                          console.log('[CRISIS DEBUG] Signals:', {
                            branchId: branch.branchId,
                            signalsGenerated: allSignals.length,
                            latestCashBalance: Math.round(latestSignal.cashBalance).toLocaleString(),
                            monthlyBurnRate: Math.round(monthlyBurnRate).toLocaleString(),
                            runwayMonths: runwayMonths.toFixed(2),
                            revenueDrop: `${revenueDrop.toFixed(1)}%`,
                            shouldTriggerLiquidityRunway: runwayMonths < 2,
                            shouldTriggerDemandDrop: revenueDrop > 30,
                          });
                        }
                      }
                    } else {
                      // Fallback: Generate signals without daily history (for backward compatibility)
                      for (let i = 0; i < 40; i++) {
                        const signalDate = new Date(today);
                        signalDate.setDate(signalDate.getDate() - (39 - i));
                        signalDate.setHours(12, 0, 0, 0);
                        
                        const historicalMultiplier = 0.95 + ((i / 39) * 0.05);
                        const dailyRevenue = baseDailyRevenue * historicalMultiplier;
                        const dailyCosts = baseDailyCosts / historicalMultiplier;
                        
                        const daysSoFar = i + 1;
                        const revenue7Days = Math.min(7, daysSoFar) * dailyRevenue;
                        const revenue30Days = Math.min(30, daysSoFar) * dailyRevenue;
                        const costs7Days = Math.min(7, daysSoFar) * dailyCosts;
                        const costs30Days = Math.min(30, daysSoFar) * dailyCosts;
                        
                        const signal: OperationalSignal = {
                          timestamp: signalDate,
                          cashBalance: metrics.financials.cashBalanceTHB * historicalMultiplier,
                          revenue7Days,
                          revenue30Days,
                          costs7Days,
                          costs30Days,
                          staffCount: metrics.modules.accommodation?.totalStaffAccommodation || 
                                     metrics.modules.fnb?.totalStaffFnb || 10,
                          occupancyRate: metrics.modules.accommodation?.occupancyRateLast30DaysPct 
                            ? (metrics.modules.accommodation.occupancyRateLast30DaysPct / 100) * historicalMultiplier
                            : undefined,
                          averageDailyRate: metrics.modules.accommodation?.averageDailyRoomRateTHB,
                          totalRooms: metrics.modules.accommodation?.totalRoomsAvailable,
                          customerVolume: metrics.modules.fnb?.totalCustomersLast7Days 
                            ? Math.round((metrics.modules.fnb.totalCustomersLast7Days / 7) * historicalMultiplier)
                            : undefined,
                          branchId: branch.branchId,
                        };
                        
                        allSignals.push(signal);
                      }
                    }
                  } catch (e) {
                    console.error('[SIMULATION] Failed to generate signals from metrics:', e);
                    // Skip this branch, continue with others
                  }
                }
              });
              
              if (allSignals.length > 0) {
                console.log(`[SIMULATION] Generated ${allSignals.length} signals from metrics (40 days)`);
                return allSignals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              }
            }
          }
        }
      } catch (e) {
        console.error('[SIMULATION] Failed to get pure simulation signals:', e);
        // Fall through to legacy
      }
    }
    
    // Legacy simulation check (for backward compatibility during migration)
    if (isSimulationModeActive()) {
      // Handle "__all__" - return signals for all simulation branches
      if (branchId === '__all__' || !branchId) {
        try {
          const { getAllSimulationBranches } = require('./simulation-service');
          const allBranches = getAllSimulationBranches();
          const allSignals: OperationalSignal[] = [];
          
          allBranches.forEach((branch: { branchId: string }) => {
            const branchSignals = getSimulationSignals(branch.branchId);
            allSignals.push(...branchSignals);
          });
          
          if (allSignals.length > 0) {
            console.log(`[SIMULATION] Returning ${allSignals.length} legacy signals for all branches`);
            return allSignals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          }
        } catch (e) {
          console.error('[SIMULATION] Failed to get all simulation signals:', e);
        }
      } else {
        // Specific branch
        const simulationSignals = getSimulationSignals(branchId);
        if (simulationSignals && simulationSignals.length > 0) {
          console.log(`[SIMULATION] Returning ${simulationSignals.length} legacy signals for branch ${branchId}`);
          return simulationSignals;
        }
      }
    }
    
    // Check for TEST_MODE (dev only)
    if (isTestModeEnabled()) {
      // Get current fixture key from URL
      const currentFixtureKey = getCurrentTestFixtureKey();
      
      // If no fixture key, TEST_MODE is disabled (None/Production selected)
      if (!currentFixtureKey) {
        this.lastTestFixtureKey = null;
        // Fall through to production data path
      } else {
        // If fixture key changed, clear cache
        if (currentFixtureKey !== this.lastTestFixtureKey) {
          if (this.lastTestFixtureKey !== null) {
            console.log(`[TEST_MODE] Fixture key changed: ${this.lastTestFixtureKey} → ${currentFixtureKey}`);
            // Clear fixture cache
            try {
              const { clearFixtureCache } = require('./test-fixture-loader-v2');
              clearFixtureCache();
            } catch (e) {
              // V2 loader not available, try legacy
              try {
                const { clearFixtureCache } = require('./test-fixture-loader');
                clearFixtureCache();
              } catch (e2) {
                // Ignore
              }
            }
          }
          this.lastTestFixtureKey = currentFixtureKey;
        }
        
        const testSignals = loadTestOperationalSignals(branchId || undefined);
        if (testSignals && testSignals.length > 0) {
          console.log(`[TEST_MODE] Loading ${testSignals.length} operational signals from fixture`);
          return testSignals;
        }
        // If test signals failed to load, fall through to production data
      }
    } else {
      // TEST_MODE disabled - reset tracking
      this.lastTestFixtureKey = null;
    }

    // FINAL PRODUCTION ARCHITECTURE: Fetch from daily_metrics for real data
    // Try to fetch from database first (async, but we'll handle it)
    // Only fetch if we don't have cached signals already (to avoid redundant calls)
    if (branchId && branchId !== '__all__' && typeof window !== 'undefined') {
      try {
        // Check if we already have signals for this branch in localStorage
        const stored = localStorage.getItem(this.storageKey);
        const hasCachedSignals = stored && (() => {
          try {
            const parsed = JSON.parse(stored);
            return parsed.some((s: any) => s.branchId === branchId);
          } catch {
            return false;
          }
        })();
        
        // Only fetch if we don't have cached signals (to reduce redundant calls)
        if (!hasCachedSignals) {
          // Fire-and-forget: Fetch daily_metrics and convert to signals
          // This will populate signals for future reads
          getDailyMetrics(branchId, 90).then(dailyMetrics => {
            if (dailyMetrics && dailyMetrics.length > 0) {
              const signalsFromDaily = convertDailyMetricsToSignals(dailyMetrics, branchId);
              // Cache in localStorage for next sync read
              try {
                const stored = localStorage.getItem(this.storageKey);
                const existingSignals = stored ? JSON.parse(stored) : [];
                // Remove old signals for this branch
                const filtered = existingSignals.filter((s: any) => s.branchId !== branchId);
                // Add new signals
                filtered.push(...signalsFromDaily);
                // Keep only last 90 days
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - 90);
                const recentSignals = filtered.filter((s: any) => {
                  const signalDate = new Date(s.timestamp);
                  return signalDate >= cutoffDate;
                });
                localStorage.setItem(this.storageKey, JSON.stringify(recentSignals));
              } catch (e) {
                // Ignore cache errors
              }
            }
          }).catch(e => {
            // Ignore - will use localStorage fallback
          });
        }
      } catch (e) {
        // Ignore - will use localStorage fallback
      }
    }

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      let signals = parsed.map((s: any) => {
        // Auto-convert legacy format
        if (isLegacySignalFormat(s)) {
          return {
            ...s,
            timestamp: new Date(s.timestamp),
          };
        } else {
          // New BranchMetrics format - convert to legacy signal
          // Need branchId and groupId for conversion - try to get from signal or use defaults
          const metrics = s as BranchMetrics;
          if (metrics.branchId && metrics.groupId) {
            return convertMetricsToSignal(metrics);
          }
          // If conversion fails, skip this signal
          return null;
        }
      }).filter((s: OperationalSignal | null) => s !== null) as OperationalSignal[];

      // Apply permission filtering first to prevent cross-branch data leakage
      try {
        const { getUserPermissions } = require('./permissions-service');
        // Get user email from localStorage (same as user session context)
        const currentUserEmail = typeof window !== 'undefined' 
          ? localStorage.getItem('hospitality_user_email')
          : null;
        const userPermissions = getUserPermissions(currentUserEmail);
        
        // Filter by permissions (owners see all, manager/branch see only assigned branches)
        if (userPermissions.role !== 'owner' && userPermissions.branchIds.length > 0) {
          signals = signals.filter((s: OperationalSignal) => {
            if (!s.branchId) return false; // Non-owner roles cannot see signals without branchId
            return userPermissions.branchIds.includes(s.branchId);
          });
        }
      } catch (e) {
        // Permissions service not available, continue without filtering
      }

      // Filter by branch selection
      if (branchId && branchId !== '__all__') {
        // Specific branch selected
        signals = signals.filter((s: OperationalSignal) => s.branchId === branchId);
      } else if (branchId === '__all__' && businessGroupId) {
        // "All Branches" selected - filter by business group
        // Get all branch IDs for this business group
        try {
          const { businessGroupService } = require('./business-group-service');
          const branches = businessGroupService.getAllBranches();
          const branchIds = branches.map((b: any) => b.id);
          signals = signals.filter((s: OperationalSignal) => 
            !s.branchId || branchIds.includes(s.branchId)
          );
        } catch (e) {
          // BusinessGroupService not available, return all signals
        }
      }
      // If branchId is undefined/null and not "__all__", return all signals (backward compatibility)

      return signals.sort((a: OperationalSignal, b: OperationalSignal) => 
        b.timestamp.getTime() - a.timestamp.getTime()
      );
    } catch (e) {
      console.error('Failed to load operational signals:', e);
      return [];
    }
  }

  /**
   * Get latest signal
   * Optionally filter by branchId or businessGroupId
   */
  getLatestSignal(branchId?: string | null, businessGroupId?: string): OperationalSignal | null {
    const signals = this.getAllSignals(branchId, businessGroupId);
    return signals.length > 0 ? signals[0] : null;
  }

  /**
   * Get signals for a specific date range
   * Optionally filter by branchId
   */
  getSignalsInRange(startDate: Date, endDate: Date, branchId?: string): OperationalSignal[] {
    const signals = this.getAllSignals(branchId);
    return signals.filter(s => {
      const signalDate = new Date(s.timestamp);
      return signalDate >= startDate && signalDate <= endDate;
    });
  }

  /**
   * Calculate trends from recent signals
   * Optionally filter by branchId
   */
  calculateTrends(branchId?: string | null, businessGroupId?: string): SignalTrend[] {
    const signals = this.getAllSignals(branchId, businessGroupId);
    if (signals.length < 2) {
      return [
        { signal: 'cash', direction: 'stable' },
        { signal: 'demand', direction: 'stable' },
        { signal: 'cost', direction: 'stable' },
      ];
    }

    // Compare last 7 days vs previous 7 days
    const today = new Date();
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    const previous7Days = new Date(last7Days);
    previous7Days.setDate(previous7Days.getDate() - 7);

    const recentSignals = signals.filter(s => new Date(s.timestamp) >= previous7Days);
    if (recentSignals.length < 2) {
      return [
        { signal: 'cash', direction: 'stable' },
        { signal: 'demand', direction: 'stable' },
        { signal: 'cost', direction: 'stable' },
      ];
    }

    const latest = recentSignals[0];
    const previous = recentSignals[recentSignals.length - 1];

    const trends: SignalTrend[] = [];

    // Cash trend
    const cashChange = latest.cashBalance - previous.cashBalance;
    const cashChangePercent = previous.cashBalance > 0 
      ? (cashChange / previous.cashBalance) * 100 
      : 0;
    trends.push({
      signal: 'cash',
      direction: cashChangePercent > 2 ? 'improving' : cashChangePercent < -2 ? 'deteriorating' : 'stable',
      changePercent: Math.abs(cashChangePercent),
    });

    // Demand trend (revenue)
    const demandChange = latest.revenue7Days - previous.revenue7Days;
    const demandChangePercent = previous.revenue7Days > 0
      ? (demandChange / previous.revenue7Days) * 100
      : 0;
    trends.push({
      signal: 'demand',
      direction: demandChangePercent > 5 ? 'improving' : demandChangePercent < -5 ? 'deteriorating' : 'stable',
      changePercent: Math.abs(demandChangePercent),
    });

    // Cost trend
    const costChange = latest.costs7Days - previous.costs7Days;
    const costChangePercent = previous.costs7Days > 0
      ? (costChange / previous.costs7Days) * 100
      : 0;
    trends.push({
      signal: 'cost',
      direction: costChangePercent > 5 ? 'deteriorating' : costChangePercent < -5 ? 'improving' : 'stable',
      changePercent: Math.abs(costChangePercent),
    });

    return trends;
  }

  /**
   * Get data coverage (days with signals)
   * Optionally filter by branchId
   */
  getDataCoverage(branchId?: string | null, businessGroupId?: string): number {
    const signals = this.getAllSignals(branchId, businessGroupId);
    if (signals.length === 0) return 0;
    
    const oldest = signals[signals.length - 1];
    const newest = signals[0];
    const daysDiff = Math.ceil(
      (newest.timestamp.getTime() - oldest.timestamp.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDiff;
  }

  /**
   * Save menu item breakdown signals for Menu Revenue Concentration alert
   * Stores detailed per-item, per-day revenue data
   */
  saveMenuItemSignals(signals: MenuItemSignal[]): void {
    if (typeof window === 'undefined') return;

    try {
      const existing = this.getMenuItemSignals();
      // Merge new signals, replacing any with same timestamp + menuItemId
      const signalMap = new Map<string, MenuItemSignal>();
      
      // Add existing signals
      existing.forEach(s => {
        const key = `${s.timestamp.toISOString()}_${s.menuItemId}`;
        signalMap.set(key, s);
      });
      
      // Add/update new signals
      signals.forEach(s => {
        const key = `${s.timestamp.toISOString()}_${s.menuItemId}`;
        signalMap.set(key, s);
      });
      
      const allSignals = Array.from(signalMap.values());
      
      // Keep only last 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const filteredSignals = allSignals.filter(s => new Date(s.timestamp) >= cutoffDate);
      
      localStorage.setItem(this.menuItemSignalsKey, JSON.stringify(filteredSignals));
    } catch (e) {
      console.error('Failed to save menu item signals:', e);
    }
  }

  /**
   * Get all menu item signals
   * Optionally filter by branchId
   */
  getMenuItemSignals(branchId?: string | null): MenuItemSignal[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(this.menuItemSignalsKey);
      if (!stored) return [];

      const signals: MenuItemSignal[] = JSON.parse(stored).map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp),
      }));

      // Filter by branchId if provided (menu item signals don't have branchId yet, but prepare for future)
      // For now, return all signals
      return signals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (e) {
      console.error('Failed to load menu item signals:', e);
      return [];
    }
  }

  /**
   * Get menu item signals for a specific date range
   * Returns signals for the last N days
   */
  getMenuItemSignalsForDateRange(days: number, branchId?: string | null): MenuItemSignal[] {
    const allSignals = this.getMenuItemSignals(branchId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return allSignals.filter(s => new Date(s.timestamp) >= cutoffDate);
  }

  /**
   * Clear operational signals cache
   * Removes cached signals from localStorage to force fresh data fetch
   */
  clearCache(): void {
    if (typeof window === 'undefined') return;
    
    try {
      // Clear main signals cache
      localStorage.removeItem(this.storageKey);
      
      // Clear menu item signals cache
      localStorage.removeItem(this.menuItemSignalsKey);
      
      // Reset test fixture tracking
      this.lastTestFixtureKey = null;
      
      console.log('[OperationalSignalsService] Cache cleared');
    } catch (e) {
      console.warn('[OperationalSignalsService] Failed to clear cache:', e);
    }
  }
}

// =============================
// CONVERSION UTILITIES
// =============================

/**
 * Convert legacy OperationalSignal to new BranchMetrics format
 * Maintains backward compatibility
 */
export function convertSignalToMetrics(
  signal: OperationalSignal,
  branchId: string,
  groupId: string,
  modules?: string[]
): BranchMetrics {
  const financials: FinancialMetrics = {
    cashBalanceTHB: signal.cashBalance,
    revenueLast30DaysTHB: signal.revenue30Days,
    costsLast30DaysTHB: signal.costs30Days,
    revenueLast7DaysTHB: signal.revenue7Days,
    costsLast7DaysTHB: signal.costs7Days,
  };

  const metrics: BranchMetrics = {
    branchId,
    groupId,
    updatedAt: signal.timestamp.toISOString(),
    financials,
    modules: {},
    metadata: {
      dataConfidence: 0, // Will be calculated separately
    },
  };

  // Add accommodation module if data exists
  if (signal.occupancyRate !== undefined || signal.averageDailyRate !== undefined || signal.totalRooms !== undefined) {
    metrics.modules.accommodation = {
      occupancyRateLast30DaysPct: signal.occupancyRate !== undefined ? signal.occupancyRate * 100 : 0,
      averageDailyRoomRateTHB: signal.averageDailyRate || 0,
      totalRoomsAvailable: signal.totalRooms || 0,
      totalStaffAccommodation: signal.staffCount || 0,
    };
  }

  // Add F&B module if data exists
  // Note: averageTicketSize is not in OperationalSignal, calculate from revenue/customers if available
  if (signal.customerVolume !== undefined || signal.menuMixTop3Percent !== undefined) {
    const avgTicket = signal.customerVolume && signal.customerVolume > 0 && signal.revenue7Days
      ? signal.revenue7Days / signal.customerVolume
      : 0;
    
    metrics.modules.fnb = {
      totalCustomersLast7Days: signal.customerVolume || 0,
      averageTicketPerCustomerTHB: avgTicket,
      totalStaffFnb: signal.staffCount || 0,
      top3MenuRevenueShareLast30DaysPct: signal.menuMixTop3Percent || 0,
    };
  }

  // If modules array provided, use it to determine which modules to include
  if (modules) {
    if (!modules.includes('accommodation') && metrics.modules.accommodation) {
      delete metrics.modules.accommodation;
    }
    if (!modules.includes('fnb') && metrics.modules.fnb) {
      delete metrics.modules.fnb;
    }
  }

  return metrics;
}

/**
 * Convert new BranchMetrics format to legacy OperationalSignal
 * For backward compatibility with existing alert logic
 */
export function convertMetricsToSignal(metrics: BranchMetrics): OperationalSignal {
  const signal: OperationalSignal = {
    timestamp: new Date(metrics.updatedAt),
    cashBalance: metrics.financials.cashBalanceTHB,
    revenue7Days: metrics.financials.revenueLast7DaysTHB || 0,
    revenue30Days: metrics.financials.revenueLast30DaysTHB,
    costs7Days: metrics.financials.costsLast7DaysTHB || 0,
    costs30Days: metrics.financials.costsLast30DaysTHB,
    staffCount: 0, // Will be set from module data
    branchId: metrics.branchId,
  };

  // Add accommodation fields
  if (metrics.modules.accommodation) {
    signal.occupancyRate = metrics.modules.accommodation.occupancyRateLast30DaysPct / 100;
    signal.averageDailyRate = metrics.modules.accommodation.averageDailyRoomRateTHB;
    signal.totalRooms = metrics.modules.accommodation.totalRoomsAvailable;
    signal.staffCount = metrics.modules.accommodation.totalStaffAccommodation;
  }

  // Add F&B fields
  if (metrics.modules.fnb) {
    signal.customerVolume = metrics.modules.fnb.totalCustomersLast7Days;
    // Note: averageTicketSize is not in OperationalSignal interface, but we calculate it if needed
    // For backward compatibility, we don't add it to signal
    signal.menuMixTop3Percent = metrics.modules.fnb.top3MenuRevenueShareLast30DaysPct;
    // Use F&B staff count if accommodation not present
    if (!metrics.modules.accommodation) {
      signal.staffCount = metrics.modules.fnb.totalStaffFnb;
    }
  }

  return signal;
}

/**
 * Detect if stored data is in old OperationalSignal format or new BranchMetrics format
 */
export function isLegacySignalFormat(data: any): boolean {
  // Legacy format has timestamp as Date, new format has updatedAt as ISO string
  return data.timestamp !== undefined && data.updatedAt === undefined;
}

export const operationalSignalsService = new OperationalSignalsService();
