/**
 * Metrics Database Service
 * 
 * Handles persistent storage of user-entered metrics in Supabase Postgres.
 * 
 * Rules:
 * - Store ONLY user-entered metrics (no computed values)
 * - NEVER store simulation data
 * - All computed values (health score, alerts, exposure) are generated dynamically
 * - Falls back to localStorage if Supabase is unavailable
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import type { BranchMetrics } from '../../models/branch-metrics';
import { getDailyMetrics } from './daily-metrics-service';
import { calculateRollingMetrics } from '../../utils/rolling-metrics-calculator';
import type { DailyMetric } from '../../models/daily-metrics';

/**
 * Convert database format back to BranchMetrics
 * Reconstructs the full BranchMetrics object from stored raw data
 */
function dbFormatToMetrics(
  dbRow: any,
  groupId: string
): BranchMetrics {
  const safeNum = (value: any, fallback: number = 0): number => {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return fallback;
    return value;
  };

  const safeInt = (value: any, fallback: number = 0): number => {
    const num = safeNum(value, fallback);
    return Math.round(num);
  };

  const metrics: BranchMetrics = {
    branchId: dbRow.branch_id,
    groupId,
    updatedAt: dbRow.created_at || new Date().toISOString(),
    financials: {
      cashBalanceTHB: safeNum(dbRow.cash_balance, 0),
      revenueLast30DaysTHB: safeNum(dbRow.revenue_30d, 0),
      costsLast30DaysTHB: safeNum(dbRow.costs_30d, 0),
      revenueLast7DaysTHB: safeNum(dbRow.revenue_7d, 0),
      costsLast7DaysTHB: safeNum(dbRow.costs_7d, 0),
    },
    modules: {},
    metadata: {
      dataConfidence: 0, // Will be computed dynamically
    },
  };

  // Add accommodation module if data exists
  if (
    dbRow.occupancy_rate_30d !== null ||
    dbRow.avg_daily_room_rate_30d !== null ||
    dbRow.total_rooms !== null ||
    dbRow.staff_count !== null
  ) {
    metrics.modules.accommodation = {
      occupancyRateLast30DaysPct: safeNum(dbRow.occupancy_rate_30d, 0),
      averageDailyRoomRateTHB: safeNum(dbRow.avg_daily_room_rate_30d, 0),
      totalRoomsAvailable: safeInt(dbRow.total_rooms, 0),
      totalStaffAccommodation: safeInt(dbRow.staff_count, 0),
    };
  }

  // Add F&B module if data exists
  if (
    dbRow.customers_7d !== null ||
    dbRow.avg_ticket_size !== null ||
    dbRow.fnb_staff !== null ||
    dbRow.top3_menu_share_30d !== null
  ) {
    metrics.modules.fnb = {
      totalCustomersLast7Days: safeInt(dbRow.customers_7d, 0),
      averageTicketPerCustomerTHB: safeNum(dbRow.avg_ticket_size, 0),
      totalStaffFnb: safeInt(dbRow.fnb_staff, 0),
      top3MenuRevenueShareLast30DaysPct: safeNum(dbRow.top3_menu_share_30d, 0),
    };
  }

  return metrics;
}

/**
 * Get latest metrics for a branch
 * FINAL PRODUCTION ARCHITECTURE: Computes from daily_metrics table only
 * No weekly_metrics dependencies
 */
// Error state cache to prevent infinite retries on 406 errors
const errorStateCache = new Map<string, boolean>();

/**
 * PART 4: Create safe default metrics object for empty data
 * Returns baseline response when database is empty
 */
function createDefaultMetrics(branchId: string, groupId: string): BranchMetrics {
  return {
    branchId,
    groupId,
    updatedAt: new Date().toISOString(),
    financials: {
      cashBalanceTHB: 0,
      revenueLast30DaysTHB: 0,
      costsLast30DaysTHB: 0,
      revenueLast7DaysTHB: 0,
      costsLast7DaysTHB: 0,
    },
    modules: {},
    metadata: {
      dataConfidence: 0.2, // PART 4: Low confidence for empty data
    },
  };
}

/**
 * PART 1: Convert rolling metrics (computed from daily data) to BranchMetrics format
 */
/**
 * Convert rolling metrics (computed from unified daily_metrics) to BranchMetrics format
 * Uses canonical field names: revenue, cost, customers, avg_ticket. ADR computed as revenue/rooms_sold when not stored.
 */
function rollingMetricsToBranchMetrics(
  branchId: string,
  groupId: string,
  dailyMetrics: DailyMetric[],
  rollingMetrics: ReturnType<typeof calculateRollingMetrics>
): BranchMetrics {
  const latestDaily = dailyMetrics[0]; // Most recent daily metric
  
  // Determine modules from unified data
  const hasAccommodation = rollingMetrics.rooms_available && rollingMetrics.rooms_available > 0;
  const hasFnb = rollingMetrics.customers_7d !== undefined && rollingMetrics.customers_7d > 0;
  
  return {
    branchId,
    groupId,
    updatedAt: latestDaily.createdAt || new Date().toISOString(),
    financials: {
      cashBalanceTHB: latestDaily.cashBalance ?? 0,
      revenueLast30DaysTHB: rollingMetrics.revenue_30d,
      costsLast30DaysTHB: rollingMetrics.cost_30d,
      revenueLast7DaysTHB: rollingMetrics.revenue_7d,
      costsLast7DaysTHB: rollingMetrics.cost_7d,
    },
    modules: {
      ...(hasAccommodation ? {
        accommodation: {
          occupancyRateLast30DaysPct: rollingMetrics.avg_occupancy_30d,
          averageDailyRoomRateTHB: (latestDaily.revenue != null && latestDaily.roomsSold != null && latestDaily.roomsSold > 0) ? latestDaily.revenue / latestDaily.roomsSold : (latestDaily.adr ?? 0),
          totalRoomsAvailable: rollingMetrics.rooms_available || 0,
          totalStaffAccommodation: rollingMetrics.staff_count || 0,
        },
      } : {}),
      ...(hasFnb ? {
        fnb: {
          totalCustomersLast7Days: rollingMetrics.customers_7d || 0,
          averageTicketPerCustomerTHB: rollingMetrics.avg_ticket_7d || 0,
          totalStaffFnb: rollingMetrics.fnb_staff || 0,
          top3MenuRevenueShareLast30DaysPct: rollingMetrics.avg_top3_menu_pct_30d ?? 0, // 30-day rolling average of daily top3MenuPct
        },
      } : {}),
    },
    metadata: {
      dataConfidence: rollingMetrics.confidence_score,
    },
  };
}

export async function getLatestMetrics(
  branchId: string,
  groupId: string
): Promise<BranchMetrics | null> {
  if (branchId == null || branchId === '') return null;

  // PART 1: Use IS_SIMULATION constant instead of auto-detection
  const { IS_SIMULATION } = require('../../config/simulation-config');
  if (IS_SIMULATION) {
    // Simulation mode - return null (simulation data handled elsewhere)
    return null;
  }

  // Check runtime mode - skip Supabase if not in REAL mode
  if (typeof window !== 'undefined') {
    try {
      const { getRuntimeMode } = require('../../../../../core/runtime-mode');
      const mode = getRuntimeMode();
      if (mode !== 'REAL') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[DATA] Skipping Supabase fetch — not REAL mode:', mode);
        }
        // Fall through to localStorage fallback
        return null;
      }
    } catch (e) {
      // Ignore if runtime-mode not available - continue with Supabase
    }
  }

  // Check if this branchId has a persistent error (406) - don't retry
  if (errorStateCache.get(branchId)) {
    // PART 3: Return safe default instead of null for empty DB
    return createDefaultMetrics(branchId, groupId);
  }

  // Try Supabase first
  if (isSupabaseAvailable()) {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      // Unified daily_metrics: Fetch all data from single table
      // Data Guard: Return default if no data (no fallback to simulation)
      const dailyMetrics = await getDailyMetrics(branchId, 30);
      
      if (!dailyMetrics || dailyMetrics.length === 0) {
        // Data Guard: Return clean default state, don't fallback
        return createDefaultMetrics(branchId, groupId);
      }
      
      // Compute rolling metrics from unified daily data
      // All F&B and accommodation data is now in daily_metrics
      const rollingMetrics = calculateRollingMetrics(dailyMetrics);
      
      // Success - clear any cached error state
      errorStateCache.delete(branchId);
      
      // Convert rolling metrics to BranchMetrics format
      return rollingMetricsToBranchMetrics(
        branchId,
        groupId,
        dailyMetrics,
        rollingMetrics
      );
    } catch (e: any) {
      // Handle 406 in catch block as well
      if (e?.status === 406 || e?.code === '22P02') {
        console.error('[DAILY_METRICS] Fetch failed (406) - invalid branch_id format:', {
          branchId,
          error: e?.message || String(e),
        });
        errorStateCache.set(branchId, true);
        // PART 3: Return safe default instead of null
        return createDefaultMetrics(branchId, groupId);
      }
      console.error('[DB] Error getting latest metrics from Supabase:', e);
      // Fall through to localStorage fallback for other errors
    }
  }

  // Data Guard: No localStorage fallback for weekly_metrics
  // Unified daily_metrics: All data comes from Supabase, no legacy fallback
  console.log('[DB] No daily metrics found, returning default metrics');
  return createDefaultMetrics(branchId, groupId);
}

/**
 * PART 1: Get metrics history for a branch (refactored from weekly_metrics to daily_metrics)
 * Returns BranchMetrics computed from daily_metrics within the specified number of days
 * Returns one BranchMetrics per day (for graph/trend display)
 */
export async function getMetricsHistory(
  branchId: string,
  groupId: string,
  days: number = 90
): Promise<BranchMetrics[]> {
  if (branchId == null || branchId === '') return [];

  // PART 1: Use IS_SIMULATION constant instead of auto-detection
  const { IS_SIMULATION } = require('../../config/simulation-config');
  if (IS_SIMULATION) {
    // Simulation mode - return empty array (simulation data handled elsewhere)
    return [];
  }

  // Check runtime mode - skip Supabase if not in REAL mode
  if (typeof window !== 'undefined') {
    try {
      const { getRuntimeMode } = require('../../../../../core/runtime-mode');
      const mode = getRuntimeMode();
      if (mode !== 'REAL') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[DATA] Skipping Supabase fetch — not REAL mode:', mode);
        }
        // Fall through to localStorage fallback
        return [];
      }
    } catch (e) {
      // Ignore if runtime-mode not available - continue with Supabase
    }
  }

  // Check if this branchId has a persistent error (406) - don't retry
  if (errorStateCache.get(branchId)) {
    // Return empty array immediately without attempting Supabase call
    return [];
  }

  // Unified daily_metrics: Fetch all data from single table
  // Data Guard: Return empty array if no data (no fallback to simulation)
  try {
    // Fetch daily metrics for the specified period
    // SELECT metric_date, revenue, cost, cash_balance ORDER BY metric_date ASC
    const dailyMetrics = await getDailyMetrics(branchId, days);
    
    // Data Guard: Return empty array if no data (show empty state, don't fallback)
    if (!dailyMetrics || dailyMetrics.length === 0) {
      return [];
    }
    
    // Unified daily_metrics: All data in single table
    // For history, we return one BranchMetrics per day
    // Each day's metrics are computed using rolling window up to that day
    const result: BranchMetrics[] = [];
    
    // Sort by date ascending for proper rolling calculation
    const sortedDaily = [...dailyMetrics].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // For each day, compute rolling metrics up to that point
    for (let i = 0; i < sortedDaily.length; i++) {
      const metricsUpToDay = sortedDaily.slice(0, i + 1);
      
      // Unified: All F&B and accommodation data in same table
      const rollingMetrics = calculateRollingMetrics(metricsUpToDay);
      
      result.push(rollingMetricsToBranchMetrics(
        branchId,
        groupId,
        metricsUpToDay,
        rollingMetrics
      ));
    }
    
    // Success - clear any cached error state
    errorStateCache.delete(branchId);
    
    // Return in descending order (newest first) to match previous behavior
    return result.reverse();
  } catch (e: any) {
    // Handle 406 in catch block
    if (e?.status === 406 || e?.code === '22P02') {
      console.error('[DAILY_METRICS] Fetch failed (406) - invalid branch_id format:', {
        branchId,
        error: e?.message || String(e),
      });
      errorStateCache.set(branchId, true);
      return [];
    }
    console.error('[DB] Error getting metrics history from daily_metrics:', e);
    // Data Guard: Return empty array on error (no fallback)
    return [];
  }
}
