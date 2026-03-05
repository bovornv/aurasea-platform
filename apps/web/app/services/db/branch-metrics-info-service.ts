/**
 * Service for querying branch metrics information
 * - Last Updated: MAX(metric_date) from daily_metrics and fnb_daily_metrics
 * - Data Coverage: COUNT(DISTINCT metric_date) in last 30 days from both tables
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

type MetricRow = { metric_date?: string };

/**
 * Get the latest metric_date for a branch
 * PART 1.2: Query both daily_metrics and fnb_daily_metrics, return the latest
 */
export async function getLastUpdatedDate(
  branchId: string
): Promise<{ lastUpdated: Date | null; error?: string }> {
  try {
    if (!isSupabaseAvailable()) {
      return { lastUpdated: null, error: 'Supabase not available' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { lastUpdated: null, error: 'Supabase client not available' };
    }

    // PART 1.2: Query MAX(metric_date) from both daily_metrics and fnb_daily_metrics
    const [dailyMetricsResult, fnbMetricsResult] = await Promise.all([
      // Query daily_metrics (accommodation)
      supabase
        .from('daily_metrics')
        .select('metric_date')
        .eq('branch_id', branchId)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Query fnb_daily_metrics (F&B) - may not exist if deprecated
      Promise.resolve(
        supabase
          .from('fnb_daily_metrics')
          .select('metric_date')
          .eq('branch_id', branchId)
          .order('metric_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      ).catch(() => ({ data: null, error: null })), // Ignore if table doesn't exist
    ]);

    const dates: Date[] = [];

    const dailyData = dailyMetricsResult.data as MetricRow | null;
    const fnbData = fnbMetricsResult.data as MetricRow | null;
    // Process daily_metrics result
    if (!dailyMetricsResult.error && dailyData?.metric_date) {
      dates.push(new Date(dailyData.metric_date));
    }

    // Process fnb_daily_metrics result
    if (!fnbMetricsResult.error && fnbData?.metric_date) {
      dates.push(new Date(fnbData.metric_date));
    }

    if (dates.length === 0) {
      return { lastUpdated: null };
    }

    // Return the latest date
    const latestDate = dates.reduce((latest, current) => 
      current > latest ? current : latest
    );

    return { lastUpdated: latestDate };
  } catch (error: any) {
    console.error('[BranchMetricsInfo] Failed to get last updated date:', error);
    return {
      lastUpdated: null,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Calculate data coverage (distinct metric_date count) in last 30 days
 * PART 1.3: Query both daily_metrics and fnb_daily_metrics, count distinct dates
 */
export async function getDataCoverageDays(
  branchId: string
): Promise<{ coverageDays: number; error?: string }> {
  try {
    if (!isSupabaseAvailable()) {
      return { coverageDays: 0, error: 'Supabase not available' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { coverageDays: 0, error: 'Supabase client not available' };
    }

    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    // PART 1.3: Query distinct metric_date from both tables
    const [dailyMetricsResult, fnbMetricsResult] = await Promise.all([
      // Query daily_metrics (accommodation)
      supabase
        .from('daily_metrics')
        .select('metric_date')
        .eq('branch_id', branchId)
        .gte('metric_date', startDate),
      // Query fnb_daily_metrics (F&B) - may not exist if deprecated
      Promise.resolve(
        supabase
          .from('fnb_daily_metrics')
          .select('metric_date')
          .eq('branch_id', branchId)
          .gte('metric_date', startDate)
      ).catch(() => ({ data: [], error: null })), // Ignore if table doesn't exist
    ]);

    // Collect all dates from both tables
    const allDates: string[] = [];
    const dailyDataList = (dailyMetricsResult.data ?? []) as MetricRow[];
    const fnbDataList = (fnbMetricsResult.data ?? []) as MetricRow[];

    // Process daily_metrics
    if (!dailyMetricsResult.error) {
      dailyDataList.forEach(d => {
        if (d.metric_date) allDates.push(d.metric_date);
      });
    }

    // Process fnb_daily_metrics
    if (!fnbMetricsResult.error) {
      fnbDataList.forEach(d => {
        if (d.metric_date) allDates.push(d.metric_date);
      });
    }

    // Count distinct dates
    const distinctDates = new Set(allDates);
    return { coverageDays: distinctDates.size };
  } catch (error: any) {
    console.error('[BranchMetricsInfo] Failed to get data coverage:', error);
    return {
      coverageDays: 0,
      error: error.message || 'Unknown error',
    };
  }
}
