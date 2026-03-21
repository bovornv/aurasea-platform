/**
 * Health Score KPI Service
 *
 * Computes Business Health Score (0–100) for accommodation branches and upserts into branch_kpi_metrics.
 * Formula: revenue performance (40%) + occupancy performance (30%) + signal score (20%) + confidence (10%).
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rejectMockBranchId(branchId: string): void {
  if (branchId == null || branchId === '') throw new Error('branchId is required.');
  if (branchId.startsWith('bg_')) throw new Error('Mock branchId not allowed.');
}

/**
 * Fetch inputs and compute health score for an accommodation branch.
 * Returns 0–100 or null if insufficient data.
 */
export async function computeAccommodationHealthScore(
  branchId: string
): Promise<number | null> {
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const today = getTodayDateString();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startStr = sevenDaysAgo.toISOString().slice(0, 10);

  try {
    const [
      latestRes,
      dailyForRoomsRes,
      revenue7dRes,
      anomalyRes,
      coverageRes,
    ] = await Promise.all([
      supabase
        .from('accommodation_latest_metrics')
        .select('branch_id, revenue, rooms_sold')
        .eq('branch_id', branchId)
        .maybeSingle(),
      supabase
        .from('accommodation_daily_metrics')
        .select('rooms_available')
        .eq('branch_id', branchId)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('accommodation_daily_metrics')
        .select('revenue')
        .eq('branch_id', branchId)
        .gte('metric_date', startStr)
        .order('metric_date', { ascending: true }),
      supabase
        .from('accommodation_anomaly_signals')
        .select('anomaly_score')
        .eq('branch_id', branchId)
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('accommodation_data_coverage')
        .select('confidence_level, confidence_score')
        .eq('branch_id', branchId)
        .maybeSingle(),
    ]);

    const latest = latestRes.data as { revenue?: number | null; rooms_sold?: number | null } | null;
    const todayRevenue = latest?.revenue != null ? Number(latest.revenue) : 0;
    const roomsSold = latest?.rooms_sold != null ? Number(latest.rooms_sold) : 0;

    const roomsRow = dailyForRoomsRes.data as { rooms_available?: number | null } | null;
    const roomsAvailable = roomsRow?.rooms_available != null ? Number(roomsRow.rooms_available) : 0;

    const revenueRows = (revenue7dRes.data ?? []) as { revenue?: number | null }[];
    const revenueValues = revenueRows.map((r) => (r.revenue != null ? Number(r.revenue) : 0)).filter((v) => v > 0);
    const avgRevenue7d =
      revenueValues.length > 0
        ? revenueValues.reduce((a, b) => a + b, 0) / revenueValues.length
        : 0;

    const anomalyRow = anomalyRes.data as { anomaly_score?: number | null } | null;
    const anomalyScore = anomalyRow?.anomaly_score != null ? Number(anomalyRow.anomaly_score) : null;
    const isAnomaly = anomalyScore != null && (anomalyScore < -2 || anomalyScore > 2);
    const signalScore = isAnomaly ? 10 : 20;

    const coverageRow = coverageRes.data as { confidence_score?: number | null } | null;
    let confidenceScore = 100;
    if (coverageRow?.confidence_score != null && !Number.isNaN(Number(coverageRow.confidence_score))) {
      confidenceScore = Math.max(0, Math.min(100, Number(coverageRow.confidence_score)));
    }

    const revenuePerformance =
      avgRevenue7d > 0 ? Math.min(1, todayRevenue / avgRevenue7d) : (todayRevenue > 0 ? 1 : 0);
    const occupancyPerformance =
      roomsAvailable > 0 ? Math.min(1, roomsSold / roomsAvailable) : 0;

    const healthScore = Math.min(
      100,
      Math.round(
        revenuePerformance * 40 +
          occupancyPerformance * 30 +
          signalScore +
          confidenceScore * 0.1
      )
    );

    return Math.max(0, healthScore);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[HealthScoreKpi] computeAccommodationHealthScore error:', e);
    }
    return null;
  }
}

/**
 * Upsert health_score into branch_kpi_metrics for the latest metric_date (or today).
 * Uses branch_id + metric_date; if row exists, updates health_score; otherwise inserts.
 */
export async function saveHealthScoreToBranchKpiMetrics(
  branchId: string,
  healthScore: number
): Promise<{ ok: boolean; error?: string }> {
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return { ok: false, error: 'Supabase not available' };
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'No client' };

  const today = getTodayDateString();
  const score = Math.max(0, Math.min(100, Math.round(healthScore)));

  try {
    const { error } = await supabase
      .from('branch_kpi_metrics')
      .upsert(
        { branch_id: branchId, metric_date: today, health_score: score } as never,
        { onConflict: 'branch_id,metric_date' }
      );

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[HealthScoreKpi] upsert error:', error.message);
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Compute and save accommodation health score for a branch, then return the score.
 */
export async function computeAndSaveAccommodationHealthScore(
  branchId: string
): Promise<number | null> {
  const score = await computeAccommodationHealthScore(branchId);
  if (score == null) return null;
  await saveHealthScoreToBranchKpiMetrics(branchId, score);
  return score;
}

/**
 * Get latest health_score from branch_kpi_metrics for a branch (for Operating Status).
 * @deprecated Use getHealthScoreFromBranchHealthMetrics for the Operating Status card.
 */
export async function getHealthScoreFromKpi(
  branchId: string
): Promise<number | null> {
  if (branchId == null || branchId === '') return null;
  rejectMockBranchId(branchId);
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('branch_kpi_metrics')
      .select('health_score')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || data == null) return null;
    const row = data as { health_score?: number | null };
    return row.health_score != null ? Number(row.health_score) : null;
  } catch {
    return null;
  }
}

/**
 * Get health_score from branch_health_metrics for the Operating Status Business Health Score card.
 * @deprecated Use getHealthScoreFromAccommodationHealthToday or getHealthScoreFromFnbHealthToday instead.
 */
export async function getHealthScoreFromBranchHealthMetrics(
  branchId: string
): Promise<number | null> {
  if (branchId == null || branchId === '') return null;
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('branch_health_metrics')
      .select('health_score')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error || data == null) return null;
    const row = data as { health_score?: number | null };
    return row.health_score != null ? Number(row.health_score) : null;
  } catch {
    return null;
  }
}

/**
 * Get health_score from branch_business_status (Operating Status / Today page).
 */
export async function getHealthScoreFromAccommodationHealthToday(
  branchId: string
): Promise<number | null> {
  if (branchId == null || branchId === '') return null;
  if (!isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('branch_business_status')
      .select('health_score')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error || data == null) return null;
    const row = data as { health_score?: number | null };
    return row.health_score != null ? Number(row.health_score) : null;
  } catch {
    return null;
  }
}

/**
 * F&B: same source as accommodation (branch_business_status).
 */
export async function getHealthScoreFromFnbHealthToday(
  branchId: string
): Promise<number | null> {
  return getHealthScoreFromAccommodationHealthToday(branchId);
}
