/**
 * F&B daily margin trend for Branch Today metrics — single source from fnb_daily_metrics
 * (mapped to DailyMetric: revenue, additionalCostToday). No `cost` / `avg_cost` columns.
 */
import type { DailyMetric } from '../models/daily-metrics';
import type { ProfitabilityTrend } from '../services/db/latest-metrics-service';
import { addDays } from './today-summary-utils';

function additionalCost(m: DailyMetric | null | undefined): number {
  if (!m) return 0;
  const v = m.additionalCostToday;
  if (v == null || Number.isNaN(Number(v))) return 0;
  return Number(v);
}

function revenueOf(m: DailyMetric | null | undefined): number | null {
  if (!m || m.revenue == null || Number.isNaN(Number(m.revenue))) return null;
  const r = Number(m.revenue);
  return r;
}

/** marginPct = ((revenue - additional_cost_today) / revenue) * 100; null if revenue <= 0 */
export function fnbGrossMarginPctFromDaily(m: DailyMetric | null | undefined): number | null {
  const rev = revenueOf(m);
  if (rev == null || rev <= 0) return null;
  const cost = additionalCost(m);
  return ((rev - cost) / rev) * 100;
}

function pctChange(prev: number, curr: number, allowPrevZeroCost = false): number | null {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  if (allowPrevZeroCost && prev === 0 && curr > 0) return Number.POSITIVE_INFINITY;
  if (prev === 0 && curr === 0) return 0;
  return null;
}

export interface FnbMarginFromDailyResult {
  marginTrend: ProfitabilityTrend | null;
  /** Subtitle under Margin arrow */
  marginExplanation: string;
}

/**
 * Pair current + previous calendar rows (same rules as Branch Today revenue delta).
 */
export function getFnbCurrentAndPrevDailyMetric(
  metrics: DailyMetric[] | null | undefined,
  referenceDateRaw: string | null | undefined
): { current: DailyMetric | null; previous: DailyMetric | null } {
  if (!metrics?.length) return { current: null, previous: null };

  const metricsByDate = new Map<string, DailyMetric>();
  for (const m of metrics) {
    const key = m.date != null ? String(m.date).slice(0, 10) : '';
    if (key) metricsByDate.set(key, m);
  }
  const datesDesc = [...metricsByDate.keys()].sort((a, b) => b.localeCompare(a));
  const latestDate = datesDesc[0] ?? null;
  const referenceDate =
    referenceDateRaw && String(referenceDateRaw).trim() !== ''
      ? String(referenceDateRaw).slice(0, 10)
      : latestDate;

  if (!referenceDate) return { current: null, previous: null };

  const current = metricsByDate.get(referenceDate) ?? null;
  const prevDayDate = addDays(referenceDate, -1);
  const previous =
    metricsByDate.get(prevDayDate) ??
    (() => {
      const fallback = datesDesc.find((d) => d < referenceDate);
      return fallback ? metricsByDate.get(fallback) ?? null : null;
    })();

  return { current, previous };
}

export function computeFnbMarginTrendFromDailyPair(params: {
  current: DailyMetric | null;
  previous: DailyMetric | null;
  locale: 'en' | 'th';
}): FnbMarginFromDailyResult {
  const { current, previous, locale } = params;
  const isTh = locale === 'th';

  if (!current) {
    return { marginTrend: null, marginExplanation: '' };
  }

  const marginPct = fnbGrossMarginPctFromDaily(current);
  if (marginPct === null) {
    return { marginTrend: null, marginExplanation: '' };
  }

  if (!previous) {
    return { marginTrend: null, marginExplanation: '' };
  }

  const prevMarginPct = fnbGrossMarginPctFromDaily(previous);
  if (prevMarginPct === null) {
    return { marginTrend: null, marginExplanation: '' };
  }

  const marginChangePctPoints = marginPct - prevMarginPct;
  const eps = 1e-9;
  let marginTrend: ProfitabilityTrend | null;
  if (marginChangePctPoints > eps) marginTrend = 'up';
  else if (marginChangePctPoints < -eps) marginTrend = 'down';
  else marginTrend = 'flat';

  const currRev = revenueOf(current);
  const prevRev = revenueOf(previous);
  const currCost = additionalCost(current);
  const prevCost = additionalCost(previous);

  const revGrowth =
    currRev != null && prevRev != null && prevRev > 0 ? pctChange(prevRev, currRev, false) : null;
  const costGrowth = pctChange(prevCost, currCost, true);

  let costsOutpacedRevenue = false;
  if (revGrowth != null && costGrowth != null) {
    if (costGrowth === Number.POSITIVE_INFINITY && Number.isFinite(revGrowth)) {
      costsOutpacedRevenue = true;
    } else if (
      Number.isFinite(costGrowth) &&
      Number.isFinite(revGrowth) &&
      costGrowth > revGrowth
    ) {
      costsOutpacedRevenue = true;
    }
  }

  let marginExplanation: string;
  if (costsOutpacedRevenue) {
    marginExplanation = isTh
      ? 'ต้นทุนวันนี้โตเร็วกว่ารายได้'
      : 'Costs rising faster than revenue';
  } else if (marginTrend === 'up') {
    marginExplanation = isTh ? 'มาร์จิ้นดีขึ้นเทียบเมื่อวาน' : 'Margin improved vs yesterday';
  } else if (marginTrend === 'down') {
    marginExplanation = isTh ? 'มาร์จิ้นลดลงเทียบเมื่อวาน' : 'Margin compressed vs yesterday';
  } else {
    marginExplanation = isTh ? 'มาร์จิ้นคงที่เทียบเมื่อวาน' : 'Margin stable vs yesterday';
  }

  return { marginTrend, marginExplanation };
}
