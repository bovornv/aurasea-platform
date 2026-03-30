/**
 * Service for querying branch metrics information
 * - Last Updated: MAX(metric_date) from branch_daily_metrics and fnb_daily_metrics
 * - Data Coverage: COUNT(DISTINCT metric_date) in last 30 days from both tables
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

type MetricRow = { metric_date?: string };

/**
 * Get the latest metric_date for a branch
 * PART 1.2: Query branch_daily_metrics and fnb_daily_metrics, return the latest
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

    // PART 1.2: Query MAX(metric_date) from branch_daily_metrics and fnb_daily_metrics
    const [dailyMetricsResult, fnbMetricsResult] = await Promise.all([
      supabase
        .from('branch_daily_metrics')
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
    // Process branch_daily_metrics result
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
 * Coverage = distinct metric_date rows for branch_id only (last 30 days).
 * Uses base table count (distinct metric_date in last 30 days).
 */
export async function getDataCoverageDays(
  branchId: string,
  moduleType?: 'accommodation' | 'fnb' | null
): Promise<{ coverageDays: number; error?: string }> {
  try {
    if (!isSupabaseAvailable()) {
      return { coverageDays: 0, error: 'Supabase not available' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { coverageDays: 0, error: 'Supabase client not available' };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const countDistinctFromTable = async (
      table: 'accommodation_daily_metrics' | 'fnb_daily_metrics'
    ): Promise<number> => {
      const { data, error } = await supabase
        .from(table)
        .select('metric_date')
        .eq('branch_id', branchId)
        .gte('metric_date', startDate);
      if (error) return 0;
      const rows = (data ?? []) as MetricRow[];
      const distinct = new Set(rows.map((r) => r.metric_date).filter(Boolean));
      return distinct.size;
    };

    if (moduleType === 'accommodation') {
      return { coverageDays: await countDistinctFromTable('accommodation_daily_metrics') };
    }

    if (moduleType === 'fnb') {
      return { coverageDays: await countDistinctFromTable('fnb_daily_metrics') };
    }

    const [acc, fnb] = await Promise.all([
      countDistinctFromTable('accommodation_daily_metrics'),
      countDistinctFromTable('fnb_daily_metrics'),
    ]);
    return { coverageDays: Math.max(acc, fnb) };
  } catch (error: any) {
    console.error('[BranchMetricsInfo] Failed to get data coverage:', error);
    return {
      coverageDays: 0,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get confidence_level (and optional confidence_score) from accommodation_data_coverage for the Confidence card.
 * Query: confidence_level, confidence_score.
 * Values: 'collecting' | 'low' | 'medium' | 'high', or null if no row.
 */
export async function getAccommodationConfidenceLevel(
  branchId: string
): Promise<string | null> {
  try {
    if (!isSupabaseAvailable() || !branchId) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('accommodation_data_coverage')
      .select('confidence_level, confidence_score')
      .eq('branch_id', branchId)
      .maybeSingle();
    if (error || data == null) return null;
    const level = (data as { confidence_level?: string | null }).confidence_level;
    return level != null ? String(level).trim().toLowerCase() : null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[BranchMetricsInfo] getAccommodationConfidenceLevel error:', e);
    }
    return null;
  }
}

/**
 * Get latest early_signal from accommodation_anomaly_signals for the Early Signal card.
 * @deprecated Prefer getEarlySignalFromAccommodationEarlySignal (accommodation_early_signal view).
 */
export async function getAccommodationEarlySignal(
  branchId: string
): Promise<string | null> {
  try {
    if (!isSupabaseAvailable() || !branchId) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('accommodation_anomaly_signals')
      .select('early_signal, metric_date')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || data == null) return null;
    const signal = (data as { early_signal?: string | null }).early_signal;
    return signal != null ? String(signal).trim() : null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[BranchMetricsInfo] getAccommodationEarlySignal error:', e);
    }
    return null;
  }
}

/**
 * Get early_signal from accommodation_early_signal view for Operating Status.
 * Query: .from("accommodation_early_signal").select("early_signal").eq("branch_id", branchId).single()
 */
export async function getEarlySignalFromAccommodationEarlySignal(
  branchId: string
): Promise<string | null> {
  try {
    if (!isSupabaseAvailable() || !branchId) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('accommodation_early_signal')
      .select('early_signal')
      .eq('branch_id', branchId)
      .single();
    if (error || data == null) return null;
    const signal = (data as { early_signal?: string | null }).early_signal;
    return signal != null ? String(signal).trim() : null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[BranchMetricsInfo] getEarlySignalFromAccommodationEarlySignal error:', e);
    }
    return null;
  }
}

/** Row from branch_learning_status only (distinct metric_date ∪ acc + fnb). */
export interface BranchLearningStatusRow {
  branch_id: string;
  learning_days: number;
  first_day?: string | null;
  last_day?: string | null;
}

/** @deprecated Use BranchLearningStatusRow */
export type BranchLearningPhaseRow = BranchLearningStatusRow;

function parseLearningStatusRow(branchId: string, row: Record<string, unknown>): BranchLearningStatusRow {
  const raw = row.learning_days;
  const n = raw != null && Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : 0;
  const fd = row.first_day;
  const ld = row.last_day;
  return {
    branch_id: branchId,
    learning_days: n,
    first_day: fd != null ? String(fd).slice(0, 10) : null,
    last_day: ld != null ? String(ld).slice(0, 10) : null,
  };
}

/**
 * Learning days = COUNT(DISTINCT metric_date) over accommodation_daily_metrics ∪ fnb_daily_metrics
 * (view: branch_learning_status). No branch_learning_phase.
 */
export async function getBranchLearningStatus(branchId: string): Promise<BranchLearningStatusRow | null> {
  try {
    if (!isSupabaseAvailable() || !branchId) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('branch_learning_status')
      .select('branch_id, learning_days, first_day, last_day')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[BranchMetricsInfo] branch_learning_status:', error.message);
      }
      return null;
    }
    if (data == null) return null;
    return parseLearningStatusRow(branchId, data as Record<string, unknown>);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[BranchMetricsInfo] getBranchLearningStatus error:', e);
    }
    return null;
  }
}

/** @deprecated Use getBranchLearningStatus */
export async function getBranchLearningPhase(
  branchId: string
): Promise<BranchLearningStatusRow | null> {
  return getBranchLearningStatus(branchId);
}
