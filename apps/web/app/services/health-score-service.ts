/**
 * Health Score Service
 * 
 * Manages health score hierarchy:
 * - Each branch calculates its own Health Score
 * - Business Group Health Score is derived from branches
 * - Tracks trends and data confidence
 */
'use client';

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import type { Branch } from '../models/business-group';
import { calculateBranchHealthScore as calculateBranchHealthScoreCore, type BranchHealthScoreResult } from '../../../../core/sme-os/engine/health/branch-health-score';
import { calculateGroupHealthScore as calculateGroupHealthScoreCore } from '../../../../core/sme-os/engine/health/group-health-score';
import type { BranchHealthScoreInput } from '../../../../core/sme-os/engine/health/group-health-score';
import { businessGroupService } from './business-group-service';
import { operationalSignalsService } from './operational-signals-service';
import { getBranchHealthMetrics, groupAlertsByBranch } from './group-aggregation-service';
import type { BranchMetrics } from '../models/branch-metrics';

// Import safe number utilities (using dynamic require to avoid circular deps)
let safeDivide: (numerator: unknown, denominator: unknown, fallback?: number) => number;

try {
  const safeNumberUtils = require('../utils/safe-number');
  safeDivide = safeNumberUtils.safeDivide;
} catch (e) {
  // Fallback implementation if utils not available
  safeDivide = (num: unknown, den: unknown, fallback: number = 0): number => {
    const n = typeof num === 'number' && !isNaN(num) && isFinite(num) ? num : Number(num) || 0;
    const d = typeof den === 'number' && !isNaN(den) && isFinite(den) ? den : Number(den) || 0;
    return d === 0 ? fallback : (isNaN(n / d) ? fallback : n / d);
  };
}

/**
 * Check if TEST_MODE is currently active
 * TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
 * 
 * PART 1: Use IS_SIMULATION constant instead of localStorage checks
 */
function isTestModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return false;
  
  // PART 1: Check IS_SIMULATION constant first
  try {
    const { IS_SIMULATION } = require('../config/simulation-config');
    if (IS_SIMULATION) {
      // Simulation is active - TEST_MODE must not inject fixtures
      return false;
    }
  } catch (e) {
    // Ignore if config not available
  }
  
  // Check if fixture bundle exists (indicates TEST_MODE is active)
  try {
    const { getFixtureBundle } = require('./test-fixture-loader-v2');
    const bundle = getFixtureBundle();
    return bundle !== null && bundle.branches.length > 0;
  } catch (e) {
    return false;
  }
}

export interface BranchHealthScore {
  branchId: string;
  branchName: string;
  healthScore: number; // 0-100
  trend: 'up' | 'down' | 'stable'; // Compared to previous period
  hasSufficientData: boolean; // True if branch has recent operational signals
  dataConfidence: number; // 0-1, based on data freshness and completeness
  alertCounts: {
    critical: number;
    warning: number;
    informational: number;
  };
}

export interface GroupHealthScore {
  healthScore: number | null; // STEP 3: Allow null to indicate "No data yet" (0-100 when present)
  confidence: number; // 0-1, based on how many branches have sufficient data
  branchesIncluded: number; // Number of branches included in aggregation
  branchesExcluded: number; // Number of branches excluded due to insufficient data
  branchScores: BranchHealthScore[];
}

/**
 * Calculate health score trend by comparing current vs previous period
 */
/**
 * Calculate health score trend by comparing current vs previous period
 * NEVER returns invalid values
 */
function calculateHealthScoreTrend(
  currentScore: number,
  previousScore: number | null
): 'up' | 'down' | 'stable' {
  // Ensure currentScore is valid
  const safeCurrentScore = Math.max(0, Math.min(100, currentScore || 0));
  if (isNaN(safeCurrentScore) || !isFinite(safeCurrentScore)) {
    return 'stable';
  }

  if (previousScore === null || typeof previousScore !== 'number') {
    return 'stable';
  }

  // Ensure previousScore is valid
  const safePreviousScore = Math.max(0, Math.min(100, previousScore));
  if (isNaN(safePreviousScore) || !isFinite(safePreviousScore)) {
    return 'stable';
  }

  const change = safeCurrentScore - safePreviousScore;
  if (isNaN(change) || !isFinite(change)) {
    return 'stable';
  }

  // Threshold: >2 points change = trend, else stable
  if (change > 2) {
    return 'up';
  } else if (change < -2) {
    return 'down';
  }
  return 'stable';
}

/**
 * Calculate freshness score (0-100) based on data age
 * NEVER returns NaN, undefined, or null
 */
function calculateFreshnessScore(lastUpdateAt: Date | null): number {
  if (!lastUpdateAt || !(lastUpdateAt instanceof Date) || isNaN(lastUpdateAt.getTime())) {
    return 0; // No data = 0 freshness
  }

  const now = new Date();
  if (isNaN(now.getTime())) {
    return 0; // Invalid current time
  }

  const dataAgeMs = now.getTime() - lastUpdateAt.getTime();
  if (isNaN(dataAgeMs) || !isFinite(dataAgeMs) || dataAgeMs < 0) {
    return 0; // Invalid age calculation
  }

  const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
  if (isNaN(dataAgeDays) || !isFinite(dataAgeDays)) {
    return 0;
  }
  
  // Freshness score: 100 if <= 7 days, decay 5 points per day after 7 days
  let freshnessScore = 100;
  if (dataAgeDays > 7) {
    const decay = (dataAgeDays - 7) * 5;
    freshnessScore = Math.max(0, 100 - decay);
  }
  
  // Ensure result is valid
  if (isNaN(freshnessScore) || !isFinite(freshnessScore)) {
    return 0;
  }
  
  return Math.max(0, Math.min(100, freshnessScore)); // Clamp to 0-100
}

/**
 * Calculate dependency coverage score (0-1) based on alert dependency satisfaction
 * NEVER returns NaN, undefined, or null
 */
function calculateDependencyCoverageScore(
  branchId: string,
  businessGroupId: string
): number {
  try {
    if (!branchId || !businessGroupId) {
      return 0.5; // Default coverage if IDs missing
    }

    // Get latest metrics for this branch
    const latestMetrics = operationalSignalsService.getLatestMetrics(branchId, businessGroupId, undefined);
    
    if (!latestMetrics) {
      // Fallback: use signal count as proxy for dependency coverage
      const branchSignals = operationalSignalsService.getAllSignals(branchId, businessGroupId);
      const signalCount = Array.isArray(branchSignals) ? branchSignals.length : 0;
      
      // Map signal count to coverage score (0-1)
      if (signalCount >= 14) return 1.0; // Excellent
      if (signalCount >= 7) return 0.85; // Good
      if (signalCount >= 3) return 0.70; // Fair
      return 0.50; // Limited
    }
    
    // Use the calculateDataConfidence from branch-metrics.ts
    // It calculates dependency coverage based on alert dependencies
    // Dynamic import to avoid circular dependencies
    const { calculateDataConfidence } = require('../models/branch-metrics');
    const dependencyScore = calculateDataConfidence(latestMetrics);
    
    // Ensure dependencyScore is valid (0-100)
    const safeScore = Math.max(0, Math.min(100, dependencyScore || 0));
    if (isNaN(safeScore) || !isFinite(safeScore)) {
      return 0.5; // Default if calculation fails
    }
    
    // Return as 0-1 scale (convert from 0-100)
    const coverage = safeScore / 100;
    return Math.max(0, Math.min(1, coverage)); // Clamp to 0-1
  } catch (e) {
    // Fallback: use signal count as proxy for dependency coverage
    try {
      const branchSignals = operationalSignalsService.getAllSignals(branchId, businessGroupId);
      const signalCount = Array.isArray(branchSignals) ? branchSignals.length : 0;
      
      // Map signal count to coverage score (0-1)
      if (signalCount >= 14) return 1.0; // Excellent
      if (signalCount >= 7) return 0.85; // Good
      if (signalCount >= 3) return 0.70; // Fair
      return 0.50; // Limited
    } catch {
      return 0.5; // Ultimate fallback
    }
  }
}

/**
 * Calculate data confidence for a branch
 * Formula: freshnessScore * 0.5 + dependencyCoverageScore * 0.5
 * NEVER returns NaN, undefined, null, or values outside 0-1
 */
function calculateDataConfidence(
  hasRecentData: boolean,
  signalCount: number,
  lastUpdateAt?: Date | null,
  branchId?: string,
  businessGroupId?: string
): number {
  // Safely calculate freshness score (0-100, convert to 0-1)
  let freshnessScore = 0.5; // Default fallback
  if (lastUpdateAt && lastUpdateAt instanceof Date && !isNaN(lastUpdateAt.getTime())) {
    const freshness = calculateFreshnessScore(lastUpdateAt);
    freshnessScore = Math.max(0, Math.min(1, freshness / 100));
  } else {
    // Fallback if no timestamp
    freshnessScore = hasRecentData ? 0.8 : 0.3;
  }
  
  // Ensure freshnessScore is valid
  if (isNaN(freshnessScore) || !isFinite(freshnessScore)) {
    freshnessScore = 0.5;
  }
  
  // Safely calculate dependency coverage score (0-1)
  let dependencyCoverageScore = 0.5; // Default fallback
  if (branchId && businessGroupId) {
    dependencyCoverageScore = calculateDependencyCoverageScore(branchId, businessGroupId);
  } else {
    // Fallback based on signal count
    const safeSignalCount = Math.max(0, Math.floor(signalCount || 0));
    if (safeSignalCount >= 14) {
      dependencyCoverageScore = 1.0;
    } else if (safeSignalCount >= 7) {
      dependencyCoverageScore = 0.85;
    } else if (safeSignalCount >= 3) {
      dependencyCoverageScore = 0.70;
    } else {
      dependencyCoverageScore = 0.50;
    }
  }
  
  // Ensure dependencyCoverageScore is valid
  if (isNaN(dependencyCoverageScore) || !isFinite(dependencyCoverageScore)) {
    dependencyCoverageScore = 0.5;
  }
  
  // Combined: freshnessScore * 0.5 + dependencyCoverageScore * 0.5
  const combinedConfidence = (freshnessScore * 0.5) + (dependencyCoverageScore * 0.5);
  
  // Final validation - NEVER return NaN, undefined, null, or values outside 0-1
  if (isNaN(combinedConfidence) || !isFinite(combinedConfidence)) {
    return 0.5; // Safe fallback
  }
  
  return Math.max(0, Math.min(1, combinedConfidence));
}

/**
 * Get historical health scores for trend calculation
 * Stores last calculated score per branch in localStorage
 */
/**
 * Get historical health scores for trend calculation
 * NEVER returns NaN, undefined, or invalid values
 */
function getPreviousHealthScore(branchId: string): number | null {
  if (typeof window === 'undefined' || !branchId) return null;
  
  try {
    const stored = localStorage.getItem(`health_score_${branchId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      
      // Only use if stored within last 7 days
      const storedDate = new Date(parsed.timestamp);
      if (isNaN(storedDate.getTime())) {
        return null;
      }
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      if (storedDate >= sevenDaysAgo) {
        const score = parsed.score;
        // Ensure score is valid
        if (typeof score === 'number' && !isNaN(score) && isFinite(score)) {
          return Math.max(0, Math.min(100, score));
        }
      }
    }
  } catch (err) {
    // Ignore errors - return null
  }
  
  return null;
}

/**
 * Store current health score for future trend calculation
 */
/**
 * Store current health score for future trend calculation
 * Only stores valid scores (0-100, not NaN)
 */
function storeHealthScore(branchId: string, score: number): void {
  if (typeof window === 'undefined' || !branchId) return;
  
  // Only store valid scores
  if (typeof score !== 'number' || isNaN(score) || !isFinite(score)) {
    return;
  }
  
  const safeScore = Math.max(0, Math.min(100, score));
  
  try {
    localStorage.setItem(`health_score_${branchId}`, JSON.stringify({
      score: safeScore,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    // Ignore errors (localStorage quota exceeded, etc.)
  }
}

/**
 * Get health scores for all branches
 * STEP 5: Includes simulation branches when simulation is active
 */
export function getBranchHealthScores(
  alerts: AlertContract[],
  businessGroupId: string,
  userPermissions?: { role: 'branch' | 'manager' | 'owner'; organizationId?: string; branchIds: string[] }
): BranchHealthScore[] {
  // STEP 5: Get branches - simulation branches are already synced via syncSimulationBranchesSync
  // getAllBranches() should already include simulation branches when simulation is active
  let branches = businessGroupService.getAllBranches();
  
  // Debug: Log branch count in simulation mode
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('aurasea_test_mode');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.simulationType) {
          console.log('[getBranchHealthScores] Simulation active, branches:', branches.length, branches.map(b => ({ id: b.id, name: b.branchName })));
        }
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Filter branches by user permissions if provided
  if (userPermissions && userPermissions.role !== 'owner' && userPermissions.branchIds.length > 0) {
    branches = branches.filter(b => userPermissions.branchIds.includes(b.id));
  }
  const branchAlertsMap = groupAlertsByBranch(alerts);
  
  // Skip branches with mock ids (bg_*) so we never call getLatestMetrics/getDailyMetrics with them
  const realBranches = branches.filter((b) => b?.id && !b.id.startsWith('bg_'));

  return realBranches.map(branch => {
    if (!branch || !branch.id) {
      return {
        branchId: branch?.id || 'unknown',
        branchName: branch?.branchName || 'Unknown',
        healthScore: 0,
        trend: 'stable' as const,
        hasSufficientData: false,
        dataConfidence: 0,
        alertCounts: { critical: 0, warning: 0, informational: 0 },
      };
    }

    const branchAlerts = branchAlertsMap.get(branch.id) || [];
    
    // Calculate alert counts (needed regardless of which health score method we use)
    const criticalCount = branchAlerts.filter(a => a && a.severity === 'critical').length;
    const warningCount = branchAlerts.filter(a => a && a.severity === 'warning').length;
    const informationalCount = branchAlerts.filter(a => a && a.severity === 'informational').length;
    
    // Try to use money-weighted health score v2 if metrics available
    let healthScore = 0;
    let healthScoreResult: BranchHealthScoreResult;
    
    try {
      const latestMetrics = operationalSignalsService.getLatestMetrics(
        branch.id,
        businessGroupId,
        branch.modules
      );
      
      // PART 1: Fix Health Score Null Safety - validate metrics before use
      const safeRevenue = latestMetrics?.financials?.revenueLast30DaysTHB ?? 0;
      const safeCosts = latestMetrics?.financials?.costsLast30DaysTHB ?? 0;
      const safeCash = latestMetrics?.financials?.cashBalanceTHB ?? 0;
      
      // PART 1: Ensure all values are finite numbers
      const validRevenue = Number.isFinite(safeRevenue) ? safeRevenue : 0;
      const validCosts = Number.isFinite(safeCosts) ? safeCosts : 0;
      const validCash = Number.isFinite(safeCash) ? safeCash : 0;
      
      if (latestMetrics && validRevenue > 0) {
        // Use money-weighted health score v2
        const { calculateMoneyWeightedHealthScore } = require('../../../../core/sme-os/engine/health/money-weighted-health-score');
        
        // STEP 4: Debug log for stressed scenario
        if (process.env.NODE_ENV === 'development') {
          // Check if we're in simulation mode and what scenario
          try {
            const stored = localStorage.getItem('aurasea_test_mode');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (parsed.simulationScenario) {
                console.log('CALCULATING SCORE WITH:', {
                  revenue: validRevenue,
                  costs: validCosts,
                  cash: validCash,
                  alerts: branchAlerts.length,
                  scenario: parsed.simulationScenario,
                  branchId: branch.id,
                });
              }
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // PART 1: Ensure metrics object has safe values
        const safeMetrics = {
          ...latestMetrics,
          financials: {
            ...latestMetrics.financials,
            revenueLast30DaysTHB: validRevenue,
            costsLast30DaysTHB: validCosts,
            cashBalanceTHB: validCash,
          },
        };
        
        const v2Result = calculateMoneyWeightedHealthScore(safeMetrics, branchAlerts);
        // PART 1: Ensure finalScore always returns number
        const finalScore = v2Result?.score ?? 0;
        if (!Number.isFinite(finalScore)) {
          console.error('[HEALTH_SCORE] finalScore is not finite:', { finalScore, v2Result, branchId: branch.id });
          healthScore = 0;
        } else {
          healthScore = Math.max(0, Math.min(100, finalScore));
        }
        
        // Create a compatible healthScoreResult for alert counts
        healthScoreResult = {
          score: healthScore,
          statusLabel: 'Healthy' as const,
          alertSummary: {
            critical: criticalCount,
            warning: warningCount,
            informational: informationalCount,
            total: branchAlerts.length,
          },
          topIssues: [],
          totalPenalty: 0,
          activeAlertCount: branchAlerts.length,
        };
      } else {
        // Fallback to legacy health score
        healthScoreResult = calculateBranchHealthScoreCore(branchAlerts);
        healthScore = Math.max(0, Math.min(100, healthScoreResult.score || 0));
      }
    } catch (e) {
      // Fallback to legacy health score on error
      healthScoreResult = calculateBranchHealthScoreCore(branchAlerts);
      healthScore = Math.max(0, Math.min(100, healthScoreResult.score || 0));
    }
    
    // Ensure healthScore is valid (0-100, never NaN/undefined/null)
    if (isNaN(healthScore) || !isFinite(healthScore)) {
      return {
        branchId: branch.id,
        branchName: branch.branchName || 'Unknown',
        healthScore: 0,
        trend: 'stable' as const,
        hasSufficientData: false,
        dataConfidence: 0,
        alertCounts: { critical: 0, warning: 0, informational: 0 },
      };
    }
    
    // Get signals for data confidence calculation
    const branchSignals = operationalSignalsService.getAllSignals(branch.id, businessGroupId);
    const latestSignal = branchSignals[0];
    
    // TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
    const testModeActive = isTestModeActive();
    
    // Check if branch has recent data (within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const hasRecentData = latestSignal && new Date(latestSignal.timestamp) >= sevenDaysAgo;
    
    // Calculate data confidence
    // Formula: freshnessScore * 0.5 + dependencyCoverageScore * 0.5
    // In TEST_MODE, always use 100% confidence
    // NEVER returns NaN, undefined, null, or values outside 0-1
    let dataConfidence = 0.5; // Safe default
    if (testModeActive) {
      dataConfidence = 1.0;
    } else {
      const calculatedConfidence = calculateDataConfidence(
        !!hasRecentData, 
        Array.isArray(branchSignals) ? branchSignals.length : 0,
        latestSignal?.timestamp,
        branch.id,
        businessGroupId
      );
      // Ensure confidence is valid (0-1)
      dataConfidence = Math.max(0, Math.min(1, calculatedConfidence || 0.5));
      if (isNaN(dataConfidence) || !isFinite(dataConfidence)) {
        dataConfidence = 0.5; // Safe fallback
      }
    }
    
    // Determine if branch has sufficient data for aggregation
    // In TEST_MODE, always include all branches (bypass data sufficiency checks)
    // Sufficient = has recent data AND at least 3 signals (unless TEST_MODE)
    const signalCount = Array.isArray(branchSignals) ? branchSignals.length : 0;
    const hasSufficientData = testModeActive ? true : (hasRecentData && signalCount >= 3);
    
    // Get previous health score for trend calculation
    const previousScore = getPreviousHealthScore(branch.id);
    const trend = calculateHealthScoreTrend(healthScore, previousScore);
    
    // Store current score for next calculation (only if valid)
    if (!isNaN(healthScore) && isFinite(healthScore)) {
      storeHealthScore(branch.id, healthScore);
    }
    
    return {
      branchId: branch.id,
      branchName: branch.branchName || 'Unknown',
      healthScore,
      trend,
      hasSufficientData,
      dataConfidence,
      alertCounts: {
        critical: Math.max(0, healthScoreResult.alertSummary?.critical ?? criticalCount),
        warning: Math.max(0, healthScoreResult.alertSummary?.warning ?? warningCount),
        informational: Math.max(0, healthScoreResult.alertSummary?.informational ?? informationalCount),
      },
    };
  }).filter(b => b && b.branchId); // Filter out any invalid entries
}

/**
 * Calculate Business Group Health Score from branch scores
 * Excludes branches with insufficient data from aggregation (unless TEST_MODE)
 * Uses core implementation with revenue-weighted aggregation
 * TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
 */
/**
 * Calculate Business Group Health Score from branch scores
 * NEVER returns NaN, undefined, null, or invalid health scores
 * Excludes branches with insufficient data from aggregation (unless TEST_MODE)
 * Uses core implementation with revenue-weighted aggregation
 * TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
 */
export function calculateGroupHealthScore(
  branchScores: BranchHealthScore[]
): GroupHealthScore {
  // STEP 2: Use new calculateCompanyScore function
  // STEP 3: Remove "|| 0" fallback - return null instead
  if (!branchScores || !Array.isArray(branchScores)) {
    return {
      healthScore: null, // Will be handled by UI to show "No data"
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: 0,
      branchScores: [],
    };
  }

  // TEST_MODE intentionally bypasses data sufficiency checks to allow deterministic scenario testing.
  const testModeActive = isTestModeActive();
  
  // In TEST_MODE, include ALL branches regardless of data sufficiency
  // In production, filter to branches with sufficient data
  // Filter out invalid branches
  const validBranchScores = branchScores.filter(b => 
    b && 
    typeof b.healthScore === 'number' && 
    !isNaN(b.healthScore) && 
    isFinite(b.healthScore)
  );
  
  const branchesWithData = testModeActive 
    ? validBranchScores  // Include all valid branches in TEST_MODE
    : validBranchScores.filter(b => b.hasSufficientData);
  const branchesWithoutData = testModeActive 
    ? []  // No branches excluded in TEST_MODE
    : validBranchScores.filter(b => !b.hasSufficientData);
  
  if (branchesWithData.length === 0) {
    return {
      healthScore: 0,
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: validBranchScores.length,
      branchScores: validBranchScores,
    };
  }
  
  // Prepare inputs for core group health score calculation
  // STEP 2: Use new calculateCompanyScore function
  const { calculateCompanyScoreWeighted } = require('../../../../core/calculate-company-score');
  
  // Build revenue metadata and prepare branches for weighted calculation
  const revenueMetadata = new Map<string, number>();
  const branchesWithRevenue: Array<{ healthScore: number | null; branchId: string; branchName: string; revenue: number | null }> = [];
  
  // PART 3: Fix branchesIncluded = 0 - ensure we count only branches with valid daily data
  let branchesIncludedCount = 0;
  
  branchesWithData.forEach(branch => {
    if (!branch || !branch.branchId) return; // Skip invalid branches
    
    try {
      // Get revenue for weighting
      const branchSignals = operationalSignalsService.getAllSignals(branch.branchId, undefined);
      const branchDailyData = Array.isArray(branchSignals) ? branchSignals : [];
      const latestSignal = branchDailyData.length > 0 ? branchDailyData[0] : null;
      const revenue30Days = latestSignal?.revenue30Days || null;
      
      // PART 3: Only count branches with valid daily data
      // Check if branch has any daily metrics data
      const hasDailyData = branchDailyData.length > 0 && latestSignal !== null && (
        (typeof revenue30Days === 'number' && revenue30Days > 0) ||
        (latestSignal.revenue30Days !== undefined || latestSignal.costs30Days !== undefined || latestSignal.cashBalance !== undefined)
      );
      
      // PART 3: Only include branches with daily data in aggregation
      if (hasDailyData) {
        branchesIncludedCount++;
        
        if (revenue30Days !== null && revenue30Days > 0) {
          revenueMetadata.set(branch.branchId, revenue30Days);
        }
        
        // Use branch health score directly (already validated)
        branchesWithRevenue.push({
          healthScore: branch.healthScore, // Already validated as number 0-100
          branchId: branch.branchId,
          branchName: branch.branchName || 'Unknown',
          revenue: revenue30Days !== null && revenue30Days > 0 ? revenue30Days : null,
        });
      } else {
        // PART 3: Log when branch is excluded due to no daily data
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[HEALTH_SCORE] Branch ${branch.branchId} excluded - no daily data`, {
            branchId: branch.branchId,
            dailyDataLength: branchDailyData.length,
            hasLatestSignal: !!latestSignal,
          });
        }
      }
    } catch (e) {
      // Skip branches that cause errors
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[HEALTH_SCORE] Error processing branch ${branch.branchId}:`, e);
      }
    }
  });
  
  // PART 3: If none have daily data, return safe fallback (do NOT crash)
  if (branchesIncludedCount === 0 || branchesWithRevenue.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[HEALTH_SCORE] No branches with daily data - returning safe fallback', {
        branchesWithDataCount: branchesWithData.length,
        branchesIncludedCount,
        branchesWithRevenueCount: branchesWithRevenue.length,
      });
    }
    return {
      healthScore: 0, // PART 3: Return 0 safely, do NOT crash
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: validBranchScores.length,
      branchScores: validBranchScores,
    };
  }
  
  // Calculate company score using new function
  const companyScore = calculateCompanyScoreWeighted(branchesWithRevenue);
  
  // STEP 6: Prevent zero health score unless real
  if (companyScore === 0 && branchesWithData.length > 0) {
    // Check if we have metrics data
    const hasMetricsData = branchesWithData.some(b => {
      try {
        const signals = operationalSignalsService.getAllSignals(b.branchId, undefined);
        return signals && signals.length > 0;
      } catch {
        return false;
      }
    });
    
    if (hasMetricsData) {
      console.warn('[HEALTH_SCORE] Health score is zero but metrics exist. Investigate aggregation.', {
        branchCount: branchesWithData.length,
        branchScores: branchesWithData.map(b => ({ branchId: b.branchId, healthScore: b.healthScore })),
      });
    }
  }
  
  // Use company score - it returns null if no valid branches
  if (companyScore === null) {
    return {
      healthScore: null, // Will be handled by UI to show "No data"
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: validBranchScores.length,
      branchScores: validBranchScores,
    };
  }
  
  const overallScore = companyScore;
  
  // Group confidence = ratio of branches with sufficient data
  // In TEST_MODE, always use 100% confidence
  const totalBranches = Math.max(1, validBranchScores.length); // Prevent division by zero
  const groupConfidence = testModeActive 
    ? 1.0  // 100% confidence in TEST_MODE
    : safeDivide(branchesWithData.length, totalBranches, 0);
  
  // Ensure confidence is valid (0-1)
  const safeConfidence = Math.max(0, Math.min(1, groupConfidence));
  if (isNaN(safeConfidence) || !isFinite(safeConfidence)) {
    return {
      healthScore: overallScore,
      confidence: 0,
      branchesIncluded: branchesWithData.length,
      branchesExcluded: branchesWithoutData.length,
      branchScores: validBranchScores,
    };
  }
  
  // PART 3: Ensure branchesIncluded matches actual branches used in calculation
  const actualBranchesIncluded = Math.max(branchesIncludedCount, branchesWithRevenue.length);
  
  return {
    healthScore: overallScore,
    confidence: Math.round(safeConfidence * 100) / 100, // Round to 2 decimals
    branchesIncluded: actualBranchesIncluded, // PART 3: Use actual count of branches with daily data
    branchesExcluded: branchesWithoutData.length, // Always 0 in TEST_MODE
    branchScores: validBranchScores,
  };
}

/**
 * Get complete health score hierarchy
 */
/**
 * Get health score hierarchy for business group
 * NEVER returns NaN, undefined, null, or invalid health scores
 */
export function getHealthScoreHierarchy(
  alerts: AlertContract[],
  businessGroupId: string,
  userPermissions?: { role: 'branch' | 'manager' | 'owner'; organizationId?: string; branchIds: string[] }
): GroupHealthScore {
  // STEP 3: Remove "|| 0" fallback - return null structure instead
  if (!alerts || !Array.isArray(alerts)) {
    return {
      healthScore: null, // Will be handled by UI to show "No data"
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: 0,
      branchScores: [],
    };
  }

  if (!businessGroupId) {
    return {
      healthScore: null, // Will be handled by UI to show "No data"
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: 0,
      branchScores: [],
    };
  }

  try {
    const branchScores = getBranchHealthScores(alerts, businessGroupId, userPermissions);
    const result = calculateGroupHealthScore(branchScores);
    
    // Ensure result is valid - allow null healthScore
    if (!result || (result.healthScore !== null && (typeof result.healthScore !== 'number' || 
        isNaN(result.healthScore) || !isFinite(result.healthScore)))) {
      return {
        healthScore: null, // Will be handled by UI to show "No data"
        confidence: 0,
        branchesIncluded: 0,
        branchesExcluded: branchScores.length,
        branchScores: branchScores || [],
      };
    }
    
    // Ensure healthScore is clamped to 0-100 (only if not null)
    if (result.healthScore !== null) {
      result.healthScore = Math.max(0, Math.min(100, result.healthScore));
    }
    result.confidence = Math.max(0, Math.min(1, result.confidence || 0));
    
    return result;
  } catch (e) {
    // Ultimate fallback on any error
    if (process.env.NODE_ENV === 'development') {
      console.error('[HEALTH_SCORE] Error in getHealthScoreHierarchy:', e);
    }
    return {
      healthScore: null, // Will be handled by UI to show "No data"
      confidence: 0,
      branchesIncluded: 0,
      branchesExcluded: 0,
      branchScores: [],
    };
  }
}

/**
 * Get Group Health Score from branch scores
 * 
 * Computes weighted average of branch health scores.
 * Excludes branches with no metrics (hasSufficientData = false).
 * 
 * @param branchScores Array of branch health scores
 * @returns GroupHealthScore with weighted average
 */
export function getGroupHealthScore(branchScores: BranchHealthScore[]): GroupHealthScore {
  return calculateGroupHealthScore(branchScores);
}
