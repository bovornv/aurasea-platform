/**
 * Branch Trends Page — 4 decision-driven charts per business type.
 * Layout: Row 1 Primary (12) | Row 2 Primary (12) | Row 3 Secondary (6) (6).
 * Same design system for Accommodation and F&B. Default 30 days.
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { useResolvedBranchData } from '../../hooks/use-resolved-branch-data';
import { ErrorState } from '../../components/error-state';
import { useI18n } from '../../hooks/use-i18n';
import { getBranchKpiMetrics } from '../../services/db/kpi-analytics-service';
import { getDailyMetrics, getAccommodationDailyMetrics } from '../../services/db/daily-metrics-service';
import { getBranchTrendSeriesWithFallback } from '../../services/db/latest-metrics-service';
import { getFnbPurchasesByWeek, type FnbPurchaseRow } from '../../services/db/fnb-purchase-service';
import { getFnbTodayExtras } from '../../services/db/latest-metrics-service';
import { FnbFoodCostChart } from '../../components/charts/fnb-food-cost-chart';
import { FnbBreakevenCustomersChart } from '../../components/charts/fnb-breakeven-customers-chart';
import { FnbWeeklyHeatmapChart } from '../../components/charts/fnb-weekly-heatmap-chart';
import { TrendChartCard } from '../../components/charts/trend-chart-card';
import { DecisionTrendChart } from '../../components/charts/decision-trend-chart';
import { DayOfWeekChart } from '../../components/charts/day-of-week-chart';
import { AdrOpportunityBandChart } from '../../components/charts/adr-opportunity-band-chart';
import {
  BreakevenRevParChart,
  computeBreakevenProblemRecommendation,
  computeBreakevenSeries,
} from '../../components/charts/breakeven-revpar-chart';
import { computeAdrBandSignalKey } from '../../components/charts/adr-opportunity-band-chart';
import { WeeklyHeatmapChart } from '../../components/charts/weekly-heatmap-chart';
import { trendInsightDual, trendInsightFromSeries, compareLastToPriorWeekTrend } from '../../utils/trend-chart-insights';
import type { TrendSignal } from '../../components/charts/trend-chart-card';

const PAGE_PADDING_TOP = 8;
const PAGE_PADDING_SIDES = 24;
const PAGE_PADDING_BOTTOM = 24;
const SECTION_GAP = 16;
const GRID_GAP = 16;
const DEFAULT_DAYS = 30;

function buildDatesFallback(length: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = length - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(x.getDate() - i);
    out.push(x.toISOString().split('T')[0]!);
  }
  return out;
}

function aligned<T>(arr: T[], n: number): T[] | undefined {
  return arr.length === n ? arr : undefined;
}

export default function BranchTrendsPage() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();
  const [mounted, setMounted] = useState(false);
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });

  const branchMetrics = useResolvedBranchData(branch?.id);
  const [kpiRows, setKpiRows] = useState<Awaited<ReturnType<typeof getBranchKpiMetrics>>>([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [dailyMetrics, setDailyMetrics] = useState<Awaited<ReturnType<typeof getDailyMetrics>>>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [trendSeries, setTrendSeries] = useState<Awaited<ReturnType<typeof getBranchTrendSeriesWithFallback>>>(null);
  const [dailyMetrics90, setDailyMetrics90] = useState<Awaited<ReturnType<typeof getDailyMetrics>>>([]);
  const [fnbPurchasesAllWeeks, setFnbPurchasesAllWeeks] = useState<FnbPurchaseRow[]>([]);
  const [fnbMonthlyFixedCost, setFnbMonthlyFixedCost] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!branch?.id) {
      setKpiLoading(false);
      setDailyLoading(false);
      setTrendSeries(null);
      return;
    }
    const isAcc = branch.moduleType === 'accommodation';
    Promise.all([
      getBranchKpiMetrics(branch.id, DEFAULT_DAYS),
      getDailyMetrics(branch.id, DEFAULT_DAYS),
      getBranchTrendSeriesWithFallback(branch.id, DEFAULT_DAYS, { moduleType: branch.moduleType }),
      // Use getAccommodationDailyMetrics so rooms_on_books_7/14 and variable_cost_per_room
      // are included. The branch_daily_metrics union view omits these columns.
      isAcc ? getAccommodationDailyMetrics(branch.id, 90) : Promise.resolve([]),
    ])
      .then(([rows, daily, series, daily90]) => {
        setKpiRows(rows ?? []);
        setDailyMetrics(daily ?? []);
        setTrendSeries(series ?? null);
        setDailyMetrics90(daily90 ?? []);
        setKpiLoading(false);
        setDailyLoading(false);
      })
      .catch(() => {
        setKpiRows([]);
        setDailyMetrics([]);
        setTrendSeries(null);
        setDailyMetrics90([]);
        setKpiLoading(false);
        setDailyLoading(false);
      });

    // F&B-only: fetch purchase history and monthly fixed cost
    if (branch.moduleType === 'fnb') {
      getFnbPurchasesByWeek(branch.id, 8).then(setFnbPurchasesAllWeeks).catch(() => setFnbPurchasesAllWeeks([]));
      getFnbTodayExtras(branch.id).then((extras) => setFnbMonthlyFixedCost(extras.monthlyFixedCost)).catch(() => setFnbMonthlyFixedCost(null));
    }
  }, [branch?.id]);

  const isAccommodation = branch?.moduleType === 'accommodation';
  const isFnb = branch?.moduleType === 'fnb';

  const revenueValues = useMemo(() => {
    if (trendSeries && trendSeries.revenue.length >= 2) return trendSeries.revenue;
    if (dailyMetrics.length >= 2) return dailyMetrics.map((m) => m.revenue);
    const fromKpi = kpiRows
      .filter((r) => r.revenue != null && !Number.isNaN(Number(r.revenue)))
      .map((r) => Number(r.revenue));
    if (fromKpi.length >= 2) return fromKpi;
    return [];
  }, [trendSeries, dailyMetrics, kpiRows]);

  const occupancyValues = useMemo(() => {
    if (trendSeries && trendSeries.occupancy.length >= 2) return trendSeries.occupancy;
    if (dailyMetrics.length < 2) return [];
    return dailyMetrics.map((m) => {
      const avail = m.roomsAvailable ?? 0;
      if (avail <= 0) return 0;
      const sold = m.roomsSold ?? 0;
      return (sold / avail) * 100;
    });
  }, [trendSeries, dailyMetrics]);

  const customersValues = useMemo(() => {
    if (trendSeries && trendSeries.customers.length >= 2) return trendSeries.customers;
    if (dailyMetrics.length < 2) return [];
    return dailyMetrics.map((m) => m.customers ?? 0);
  }, [trendSeries, dailyMetrics]);

  const totalRooms = branchMetrics?.modules?.accommodation?.totalRoomsAvailable ?? 0;

  const revparValues = useMemo(() => {
    const pickRevpar = (params: {
      canonicalRevpar: number | null;
      adr: number | null;
      occupancyPct: number | null;
      revenue: number | null;
      roomsAvailable: number | null;
    }): number => {
      const { canonicalRevpar, adr, occupancyPct, revenue, roomsAvailable } = params;
      const occRatio =
        occupancyPct != null && Number.isFinite(occupancyPct)
          ? occupancyPct > 1
            ? occupancyPct / 100
            : occupancyPct
          : null;
      const expectedFromAdrOcc =
        adr != null && Number.isFinite(adr) && occRatio != null && occRatio > 0 ? adr * occRatio : null;
      if (canonicalRevpar != null && Number.isFinite(canonicalRevpar) && canonicalRevpar > 0) {
        if (expectedFromAdrOcc != null && expectedFromAdrOcc > 0) {
          const relDiff = Math.abs(canonicalRevpar - expectedFromAdrOcc) / expectedFromAdrOcc;
          if (relDiff <= 0.35) return canonicalRevpar;
          return expectedFromAdrOcc;
        }
        return canonicalRevpar;
      }
      if (expectedFromAdrOcc != null && expectedFromAdrOcc > 0) return expectedFromAdrOcc;
      if (roomsAvailable != null && roomsAvailable > 0 && revenue != null) return revenue / roomsAvailable;
      return 0;
    };

    if (trendSeries && trendSeries.revpar.length >= 2) {
      return trendSeries.revpar.map((v, i) =>
        pickRevpar({
          canonicalRevpar: v ?? null,
          adr: trendSeries.adr[i] ?? null,
          occupancyPct: trendSeries.occupancy[i] ?? null,
          revenue: trendSeries.revenue[i] ?? null,
          roomsAvailable: null,
        })
      );
    }
    if (dailyMetrics.length >= 2) {
      return dailyMetrics.map((m) => {
        const raw = m as unknown as Record<string, unknown>;
        const canonicalRevpar =
          raw.revpar_thb != null && Number.isFinite(Number(raw.revpar_thb))
            ? Number(raw.revpar_thb)
            : raw.revpar != null && Number.isFinite(Number(raw.revpar))
              ? Number(raw.revpar)
              : null;
        if (canonicalRevpar != null) return canonicalRevpar;
        const adrRaw =
          raw.adr_thb != null && Number.isFinite(Number(raw.adr_thb))
            ? Number(raw.adr_thb)
            : m.adr != null && Number.isFinite(Number(m.adr))
              ? Number(m.adr)
              : null;
        const occRaw =
          raw.occupancy_pct != null && Number.isFinite(Number(raw.occupancy_pct))
            ? Number(raw.occupancy_pct)
            : raw.occupancy_rate != null && Number.isFinite(Number(raw.occupancy_rate))
              ? Number(raw.occupancy_rate)
              : null;
        if (adrRaw != null && occRaw != null) {
          // occupancy may be percent (51) or fraction (0.51); normalize safely.
          const occRatio = occRaw > 1 ? occRaw / 100 : occRaw;
          return pickRevpar({
            canonicalRevpar,
            adr: adrRaw,
            occupancyPct: occRaw > 1 ? occRaw : occRaw * 100,
            revenue: m.revenue ?? null,
            roomsAvailable: m.roomsAvailable ?? null,
          }) || (occRatio > 0 ? adrRaw * occRatio : 0);
        }
        return pickRevpar({
          canonicalRevpar,
          adr: null,
          occupancyPct: null,
          revenue: m.revenue ?? null,
          roomsAvailable: m.roomsAvailable ?? null,
        });
      });
    }
    if (revenueValues.length >= 2 && isAccommodation && totalRooms > 0) {
      return revenueValues.map((r) => r / totalRooms);
    }
    return [];
  }, [trendSeries, dailyMetrics, revenueValues, isAccommodation, totalRooms]);

  const adrValues = useMemo(() => {
    if (trendSeries && trendSeries.adr.length >= 2) return trendSeries.adr;
    if (dailyMetrics.length >= 2) {
      return dailyMetrics.map((m) => {
        if (m.adr != null && m.adr > 0) return m.adr;
        const sold = m.roomsSold ?? 0;
        return sold > 0 ? m.revenue / sold : 0;
      });
    }
    return [];
  }, [trendSeries, dailyMetrics]);

  const avgTicketValues = useMemo(() => {
    if (
      trendSeries?.avg_ticket &&
      trendSeries.avg_ticket.length >= 2 &&
      trendSeries.avg_ticket.length === trendSeries.customers.length
    ) {
      return trendSeries.avg_ticket.map((v) => Number(v ?? 0));
    }
    if (trendSeries && trendSeries.revenue.length >= 2 && trendSeries.customers.length >= 2) {
      return trendSeries.revenue.map((r, i) => {
        const c = trendSeries!.customers[i] ?? 0;
        return c > 0 ? r / c : 0;
      });
    }
    if (dailyMetrics.length < 2) return [];
    return dailyMetrics.map((m) => {
      const c = m.customers ?? 0;
      return c > 0 ? m.revenue / c : 0;
    });
  }, [trendSeries, dailyMetrics]);

  const chartDates = useMemo(() => {
    if (trendSeries?.dates?.length === revenueValues.length) return trendSeries.dates;
    if (dailyMetrics.length >= 2) return dailyMetrics.map((m) => m.date);
    return buildDatesFallback(revenueValues.length || occupancyValues.length || customersValues.length || 1);
  }, [trendSeries?.dates, revenueValues.length, dailyMetrics, occupancyValues.length, customersValues.length]);

  /** F&B Food Cost chart data — aggregate purchases by week, join with daily revenue */
  const fnbFoodCostChartData = useMemo(() => {
    if (!isFnb || fnbPurchasesAllWeeks.length === 0) return [];
    // Group purchases by Monday of their week
    const weekMap = new Map<string, { foodBev: number; nonFood: number }>();
    for (const p of fnbPurchasesAllWeeks) {
      const d = new Date(`${p.purchase_date}T12:00:00`);
      const dow = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
      const monday = new Date(d);
      monday.setDate(d.getDate() - dow);
      const mondayStr = monday.toISOString().slice(0, 10);
      const entry = weekMap.get(mondayStr) ?? { foodBev: 0, nonFood: 0 };
      if (p.purchase_type === 'food_beverage') entry.foodBev += p.amount;
      else entry.nonFood += p.amount;
      weekMap.set(mondayStr, entry);
    }
    const result: Array<{ weekStart: string; foodBevAmount: number; nonFoodAmount: number; weeklyRevenue: number }> = [];
    for (const [weekStart, costs] of weekMap.entries()) {
      const weekEnd = new Date(`${weekStart}T12:00:00`);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);
      const weekRevenue = dailyMetrics
        .filter((m) => m.date >= weekStart && m.date <= weekEndStr)
        .reduce((s, m) => s + (m.revenue ?? 0), 0);
      result.push({ weekStart, foodBevAmount: costs.foodBev, nonFoodAmount: costs.nonFood, weeklyRevenue: weekRevenue });
    }
    return result.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }, [isFnb, fnbPurchasesAllWeeks, dailyMetrics]);

  /** F&B Breakeven chart points — constant breakeven line from monthly fixed cost + weekly avg food cost */
  const fnbBreakevenChartPoints = useMemo(() => {
    if (!isFnb || dailyMetrics.length === 0) return [];
    if (!fnbMonthlyFixedCost || fnbMonthlyFixedCost <= 0) {
      return dailyMetrics.map((m) => ({ date: m.date, actualCustomers: m.customers ?? 0, breakevenCustomers: null as number | null }));
    }
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dailyFixedCost = fnbMonthlyFixedCost / daysInMonth;
    // Avg daily food & bev cost from all purchases over available weeks
    const foodBevTotal = fnbPurchasesAllWeeks
      .filter((p) => p.purchase_type === 'food_beverage')
      .reduce((s, p) => s + p.amount, 0);
    const uniqueDays = new Set(fnbPurchasesAllWeeks.map((p) => p.purchase_date)).size;
    const avgDailyFoodCost = uniqueDays > 0 ? foodBevTotal / uniqueDays : null;

    return dailyMetrics.map((m) => {
      const revenue = m.revenue ?? 0;
      const customers = m.customers ?? 0;
      let bk: number | null = null;
      if (avgDailyFoodCost != null && revenue > 0 && customers > 0) {
        const gp = (revenue - avgDailyFoodCost) / customers;
        if (gp > 0) bk = Math.ceil(dailyFixedCost / gp);
      }
      return { date: m.date, actualCustomers: customers, breakevenCustomers: bk };
    });
  }, [isFnb, dailyMetrics, fnbMonthlyFixedCost, fnbPurchasesAllWeeks]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !isAccommodation) return;
    if (chartDates.length === 0 || occupancyValues.length !== revparValues.length) return;
    const samples = chartDates.map((date, i) => ({
      date,
      occupancy: occupancyValues[i] ?? null,
      adr: adrValues[i] ?? null,
      canonical_revpar:
        trendSeries && trendSeries.revpar.length === chartDates.length
          ? trendSeries.revpar[i] ?? null
          : null,
      plotted_revpar: revparValues[i] ?? null,
    }));
    console.log('[acc-occ-vs-revpar-trace]', {
      page_context: 'branch_trends_second_chart',
      branch_id: branch?.id ?? null,
      samples: samples.slice(-10),
    });
  }, [isAccommodation, chartDates, occupancyValues, adrValues, revparValues, trendSeries, branch?.id]);

  const chartLocale = locale === 'th' ? 'th' : 'en';

  // Use dailyMetrics90 (from accommodation_daily_metrics directly) because the
  // branch_daily_metrics union view omits monthly_fixed_cost and variable_cost_per_room.
  const breakevenProblemRecommendation = useMemo(
    () =>
      isAccommodation
        ? computeBreakevenProblemRecommendation(dailyMetrics90, totalRooms, chartLocale)
        : null,
    [isAccommodation, dailyMetrics90, totalRooms, chartLocale]
  );

  const branchTrendInsights = useMemo(() => {
    const loc = chartLocale;
    const out: Partial<Record<string, { problem: string; recommendation: string }>> = {};
    if (isAccommodation) {
      if (occupancyValues.length >= 2) {
        out.accOccAdr = trendInsightDual(
          { values: occupancyValues, metric: 'occupancy' },
          adrValues.length === occupancyValues.length ? { values: adrValues, metric: 'adr' } : null,
          loc
        );
        out.accOccRev = trendInsightDual(
          { values: occupancyValues, metric: 'occupancy' },
          revparValues.length === occupancyValues.length ? { values: revparValues, metric: 'revpar' } : null,
          loc
        );
      }
      if (revparValues.length >= 2) {
        out.accRevparAdr = trendInsightDual(
          { values: revparValues, metric: 'revpar' },
          adrValues.length === revparValues.length ? { values: adrValues, metric: 'adr' } : null,
          loc
        );
      }
      const dowAcc = occupancyValues.length >= 2 ? occupancyValues : revenueValues;
      if (dowAcc.length >= 2) {
        out.accDow = trendInsightFromSeries(dowAcc, occupancyValues.length >= 2 ? 'occupancy' : 'revenue', loc);
      }
    }
    if (isFnb) {
      if (customersValues.length >= 2) {
        out.fnbCustRev = trendInsightDual(
          { values: customersValues, metric: 'customers' },
          revenueValues.length === customersValues.length ? { values: revenueValues, metric: 'revenue' } : null,
          loc
        );
        out.fnbCustTicket = trendInsightDual(
          { values: customersValues, metric: 'customers' },
          avgTicketValues.length === customersValues.length ? { values: avgTicketValues, metric: 'avgTicket' } : null,
          loc
        );
      }
      if (revenueValues.length >= 2) {
        out.fnbRevTicket = trendInsightDual(
          { values: revenueValues, metric: 'revenue' },
          avgTicketValues.length === revenueValues.length ? { values: avgTicketValues, metric: 'avgTicket' } : null,
          loc
        );
      }
      const dowFnb = customersValues.length >= 2 ? customersValues : revenueValues;
      if (dowFnb.length >= 2) {
        out.fnbDow = trendInsightFromSeries(dowFnb, customersValues.length >= 2 ? 'customers' : 'revenue', loc);
      }
    }
    return out;
  }, [
    chartLocale,
    isAccommodation,
    isFnb,
    occupancyValues,
    adrValues,
    revenueValues,
    revparValues,
    customersValues,
    avgTicketValues,
  ]);

  // ── Accommodation one-line signal insights (PART 2) ──────────────────────────────
  const accSignals = useMemo((): {
    chart1: TrendSignal;
    chart2: TrendSignal;
    chart3: TrendSignal;
    chart4: TrendSignal;
    chart5: TrendSignal;
    chart6: TrendSignal;
  } | null => {
    if (!isAccommodation) return null;

    const PCT = 5;
    function dir(cmp: ReturnType<typeof compareLastToPriorWeekTrend>): 'above' | 'below' | 'inline' | null {
      if (!cmp) return null;
      if (cmp.pctDiff > PCT) return 'above';
      if (cmp.pctDiff < -PCT) return 'below';
      return 'inline';
    }

    const occCmp = compareLastToPriorWeekTrend(occupancyValues);
    const adrCmp = compareLastToPriorWeekTrend(adrValues.length === occupancyValues.length ? adrValues : []);
    const revparCmp = compareLastToPriorWeekTrend(revparValues.length === occupancyValues.length ? revparValues : []);
    const occDir = dir(occCmp);
    const adrDir = dir(adrCmp);
    const revparDir = dir(revparCmp);

    // Chart 1: Occ + ADR
    let chart1: TrendSignal;
    if (occDir === 'above' && adrDir === 'above') chart1 = { signal: 'green', text: t('accTrendSignals.occAdrBothUp') };
    else if (occDir === 'above' && adrDir === 'below') chart1 = { signal: 'amber', text: t('accTrendSignals.occAdrOccUpAdrDown') };
    else if (occDir === 'below' && adrDir === 'above') chart1 = { signal: 'amber', text: t('accTrendSignals.occAdrOccDownAdrUp') };
    else if (occDir === 'below' && adrDir === 'below') chart1 = { signal: 'red', text: t('accTrendSignals.occAdrBothDown') };
    else chart1 = { signal: 'info', text: t('accTrendSignals.occAdrStable') };

    // Chart 2: Occ + RevPAR
    let chart2: TrendSignal;
    if (occDir === 'above' && revparDir === 'above') chart2 = { signal: 'green', text: t('accTrendSignals.occRevBothUp') };
    else if (occDir === 'above' && revparDir === 'below') chart2 = { signal: 'amber', text: t('accTrendSignals.occRevOccUpRevDown') };
    else if (occDir === 'below' && revparDir === 'above') chart2 = { signal: 'amber', text: t('accTrendSignals.occRevOccDownRevUp') };
    else if (occDir === 'below' && revparDir === 'below') chart2 = { signal: 'red', text: t('accTrendSignals.occRevBothDown') };
    else chart2 = { signal: 'info', text: t('accTrendSignals.occRevStable') };

    // Chart 3: RevPAR + ADR band
    const bandResult = computeAdrBandSignalKey(
      adrValues.length === revparValues.length ? adrValues : [],
      occupancyValues.length === revparValues.length ? occupancyValues : [],
      chartDates.length === revparValues.length ? chartDates : []
    );
    const chart3: TrendSignal = { signal: bandResult.signal, text: t(`accTrendSignals.${bandResult.key}`) };

    // Chart 4: Breakeven RevPAR
    let chart4: TrendSignal;
    const { points: bkPts, hasBreakeven: bkHas, costDataMissing: bkMissing } = computeBreakevenSeries(dailyMetrics90, totalRooms);
    if (bkMissing) {
      chart4 = { signal: 'info', text: t('accTrendSignals.breakevenNoData') };
    } else if (bkPts.length < 7 || !bkHas) {
      chart4 = { signal: 'info', text: t('accTrendSignals.breakevenNotEnough') };
    } else {
      const bkLast = bkPts[bkPts.length - 1]!;
      const bkLast3 = bkPts.slice(-3);
      const consecutive = bkLast3.length === 3 && bkLast3.every((p) => p.breakevenRevpar != null && p.actualRevpar < p.breakevenRevpar!);
      if (consecutive) chart4 = { signal: 'red', text: t('accTrendSignals.breakevenConsecutiveBelow') };
      else if (bkLast.breakevenRevpar != null && bkLast.actualRevpar < bkLast.breakevenRevpar) chart4 = { signal: 'amber', text: t('accTrendSignals.breakevenLastBelow') };
      else chart4 = { signal: 'green', text: t('accTrendSignals.breakevenAbove') };
    }

    // Chart 5: Day of week occupancy gap
    let chart5: TrendSignal;
    const dowSrc = occupancyValues.length >= 7 ? occupancyValues : [];
    if (dowSrc.length < 7 || chartDates.length < 7) {
      chart5 = { signal: 'info', text: t('accTrendSignals.dowNoData') };
    } else {
      const buckets: number[][] = [[], [], [], [], [], [], []]; // 0=Mon … 6=Sun
      chartDates.slice(0, dowSrc.length).forEach((ds, i) => {
        const d = new Date(`${ds}T12:00:00`);
        const dow = (d.getDay() + 6) % 7;
        buckets[dow]!.push(dowSrc[i]!);
      });
      const allAvgs = buckets.map((b) => (b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : null));
      const weekdayAvgs = allAvgs.slice(0, 5).filter((v): v is number => v !== null); // Mon–Fri
      const weekendAvgs = allAvgs.slice(5).filter((v): v is number => v !== null);    // Sat–Sun
      if (weekdayAvgs.length === 0 || weekendAvgs.length === 0) {
        chart5 = { signal: 'info', text: t('accTrendSignals.dowNoData') };
      } else {
        const weekdayAvg = Math.round(weekdayAvgs.reduce((s, v) => s + v, 0) / weekdayAvgs.length);
        const weekendAvg = Math.round(weekendAvgs.reduce((s, v) => s + v, 0) / weekendAvgs.length);
        const gap = weekendAvg - weekdayAvg; // positive = weekends busier (pp)
        if (gap < 0) {
          chart5 = { signal: 'info', text: t('accTrendSignals.dowWeekdayBusier', { weekday_avg: String(weekdayAvg), weekend_avg: String(weekendAvg) }) };
        } else if (gap > 30) {
          chart5 = { signal: 'amber', text: t('accTrendSignals.dowWideGap', { gap: String(gap), weekend_avg: String(weekendAvg), weekday_avg: String(weekdayAvg) }) };
        } else if (gap >= 15) {
          chart5 = { signal: 'amber', text: t('accTrendSignals.dowModerateGap', { gap: String(gap) }) };
        } else {
          chart5 = { signal: 'green', text: t('accTrendSignals.dowBalanced', { gap: String(gap) }) };
        }
      }
    }

    // Chart 6: Heatmap — overall week-over-week occupancy trend
    let chart6: TrendSignal;
    const heatSrc = occupancyValues.length >= 2 ? occupancyValues : revparValues;
    const heatCmp = compareLastToPriorWeekTrend(heatSrc);
    const heatDir = dir(heatCmp);
    if (heatDir === 'above') chart6 = { signal: 'green', text: t('accTrendSignals.heatmapAbove') };
    else if (heatDir === 'below') chart6 = { signal: 'amber', text: t('accTrendSignals.heatmapBelow') };
    else chart6 = { signal: 'info', text: t('accTrendSignals.heatmapStable') };

    return { chart1, chart2, chart3, chart4, chart5, chart6 };
  }, [
    isAccommodation,
    occupancyValues,
    adrValues,
    revparValues,
    chartDates,
    dailyMetrics90,
    totalRooms,
    t,
  ]);

  // ── F&B one-line signal insights ─────────────────────────────────────────────────
  const fnbSignals = useMemo((): {
    chart1: TrendSignal;
    chart2: TrendSignal;
    chart3: TrendSignal;
    chart4: TrendSignal;
    fcChart: TrendSignal;
    bkChart: TrendSignal;
    hmChart: TrendSignal;
  } | null => {
    if (!isFnb) return null;

    const PCT = 5;
    function dir(cmp: ReturnType<typeof compareLastToPriorWeekTrend>): 'above' | 'below' | 'inline' | null {
      if (!cmp) return null;
      if (cmp.pctDiff > PCT) return 'above';
      if (cmp.pctDiff < -PCT) return 'below';
      return 'inline';
    }

    const custDir = dir(compareLastToPriorWeekTrend(customersValues));
    const revDir = dir(compareLastToPriorWeekTrend(revenueValues));
    const ticketDir = dir(compareLastToPriorWeekTrend(avgTicketValues.length === customersValues.length ? avgTicketValues : []));

    // Chart 1: Customers + Revenue
    let chart1: TrendSignal;
    if (custDir === 'above' && revDir === 'above') chart1 = { signal: 'green', text: t('fnbSignals.custRevBothUp') };
    else if (custDir === 'above' && revDir === 'below') chart1 = { signal: 'amber', text: t('fnbSignals.custUpRevDown') };
    else if (custDir === 'below' && revDir === 'above') chart1 = { signal: 'amber', text: t('fnbSignals.custDownRevUp') };
    else if (custDir === 'below' && revDir === 'below') chart1 = { signal: 'red', text: t('fnbSignals.custRevBothDown') };
    else chart1 = { signal: 'info', text: t('fnbSignals.custRevNoData') };

    // Chart 2: Customers + Avg Ticket
    let chart2: TrendSignal;
    if (custDir === 'above' && ticketDir === 'above') chart2 = { signal: 'green', text: t('fnbSignals.custUpTicketUp') };
    else if (custDir === 'above' && ticketDir === 'below') chart2 = { signal: 'amber', text: t('fnbSignals.custUpTicketDown') };
    else if (custDir === 'below' && ticketDir === 'above') chart2 = { signal: 'amber', text: t('fnbSignals.custDownTicketUp') };
    else if (custDir === 'below' && ticketDir === 'below') chart2 = { signal: 'red', text: t('fnbSignals.custTicketBothDown') };
    else chart2 = { signal: 'info', text: t('fnbSignals.custTicketNoData') };

    // Chart 3: Revenue + Avg Ticket
    let chart3: TrendSignal;
    if (revDir === 'above' && ticketDir === 'above') chart3 = { signal: 'green', text: t('fnbSignals.revUpTicketUp') };
    else if (revDir === 'above' && ticketDir === 'below') chart3 = { signal: 'amber', text: t('fnbSignals.revUpTicketDown') };
    else if (revDir === 'below' && ticketDir === 'above') chart3 = { signal: 'amber', text: t('fnbSignals.revDownTicketUp') };
    else if (revDir === 'below' && ticketDir === 'below') chart3 = { signal: 'red', text: t('fnbSignals.revTicketBothDown') };
    else chart3 = { signal: 'info', text: t('fnbSignals.revTicketNoData') };

    // Chart 4: DOW customers
    let chart4: TrendSignal;
    const dowSrc = customersValues.length >= 7 ? customersValues : [];
    if (dowSrc.length < 7 || chartDates.length < 7) {
      chart4 = { signal: 'info', text: t('fnbSignals.dowNoDataFnb') };
    } else {
      const buckets: number[][] = [[], [], [], [], [], [], []];
      chartDates.slice(0, dowSrc.length).forEach((ds, i) => {
        const d = new Date(`${ds}T12:00:00`);
        const dow = (d.getDay() + 6) % 7;
        buckets[dow]!.push(dowSrc[i]!);
      });
      const allAvgs = buckets.map((b) => (b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : null));
      const wdAvgs = allAvgs.slice(0, 5).filter((v): v is number => v !== null);
      const weAvgs = allAvgs.slice(5).filter((v): v is number => v !== null);
      if (wdAvgs.length === 0 || weAvgs.length === 0) {
        chart4 = { signal: 'info', text: t('fnbSignals.dowNoDataFnb') };
      } else {
        const wdAvg = Math.round(wdAvgs.reduce((s, v) => s + v, 0) / wdAvgs.length);
        const weAvg = Math.round(weAvgs.reduce((s, v) => s + v, 0) / weAvgs.length);
        const gap = weAvg - wdAvg;
        if (gap < 0) chart4 = { signal: 'info', text: t('fnbSignals.dowWeekdayBusierFnb', { weekday_avg: String(wdAvg), weekend_avg: String(weAvg) }) };
        else if (gap > 30) chart4 = { signal: 'amber', text: t('fnbSignals.dowWideGapFnb', { gap: String(gap), weekend_avg: String(weAvg), weekday_avg: String(wdAvg) }) };
        else if (gap >= 15) chart4 = { signal: 'amber', text: t('fnbSignals.dowModerateGapFnb', { gap: String(gap) }) };
        else chart4 = { signal: 'green', text: t('fnbSignals.dowBalancedFnb', { gap: String(gap) }) };
      }
    }

    // Food cost chart signal
    let fcChart: TrendSignal;
    const weeksWithData = fnbFoodCostChartData.filter((w) => w.weeklyRevenue > 0 && w.foodBevAmount > 0);
    if (weeksWithData.length === 0) {
      fcChart = { signal: 'info', text: t('fnbSignals.fcNoData') };
    } else {
      const avgFc = weeksWithData.reduce((s, w) => s + (w.foodBevAmount / w.weeklyRevenue) * 100, 0) / weeksWithData.length;
      const avg = String(Math.round(avgFc * 10) / 10);
      if (avgFc > 45) fcChart = { signal: 'red', text: t('fnbSignals.fcCritical', { avg }) };
      else if (avgFc > 35) fcChart = { signal: 'amber', text: t('fnbSignals.fcWarning', { avg }) };
      else if (avgFc >= 28) fcChart = { signal: 'green', text: t('fnbSignals.fcGoodInRange', { avg }) };
      else fcChart = { signal: 'green', text: t('fnbSignals.fcGoodBelow28', { avg }) };
    }

    // Breakeven chart signal
    let bkChart: TrendSignal;
    const bkPts = fnbBreakevenChartPoints.filter((p) => p.breakevenCustomers != null);
    if (bkPts.length === 0) {
      bkChart = { signal: 'info', text: t('fnbSignals.bkNoData') };
    } else {
      const below = bkPts.filter((p) => p.actualCustomers < p.breakevenCustomers!).length;
      if (below === 0) {
        const best = bkPts.reduce((b, p) => (p.actualCustomers > b.actualCustomers ? p : b));
        const dayIdx = new Date(`${best.date}T12:00:00`).getDay();
        const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        bkChart = { signal: 'green', text: t('fnbSignals.bkAllAbove', { day: names[dayIdx] ?? 'Sunday' }) };
      } else if (below <= 5) {
        bkChart = { signal: 'amber', text: t('fnbSignals.bkModerate', { n: String(below) }) };
      } else {
        bkChart = { signal: 'red', text: t('fnbSignals.bkCritical', { n: String(below) }) };
      }
    }

    // Heatmap chart signal — strongest / weakest revenue day
    let hmChart: TrendSignal;
    if (revenueValues.length < 7) {
      hmChart = { signal: 'info', text: t('fnbSignals.hmCustomersEven', { strongest: 'Monday' }) };
    } else {
      const hmBuckets: number[][] = [[], [], [], [], [], [], []];
      chartDates.slice(0, revenueValues.length).forEach((ds, i) => {
        const dow = (new Date(`${ds}T12:00:00`).getDay() + 6) % 7;
        hmBuckets[dow]!.push(revenueValues[i]!);
      });
      const hmAvgs = hmBuckets.map((b) => (b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : 0));
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const maxVal = Math.max(...hmAvgs);
      const minVal = Math.min(...hmAvgs.filter((v) => v > 0));
      const strongestIdx = hmAvgs.indexOf(maxVal);
      const weakestIdx = hmAvgs.indexOf(minVal);
      const strongest = dayNames[strongestIdx] ?? 'Monday';
      const weakest = dayNames[weakestIdx] ?? 'Sunday';
      const x = String(Math.round(maxVal));
      const y = String(Math.round(minVal));
      hmChart = { signal: 'info', text: t('fnbSignals.hmRevenue', { strongest, weakest, x, y }) };
    }

    return { chart1, chart2, chart3, chart4, fcChart, bkChart, hmChart };
  }, [
    isFnb,
    customersValues,
    revenueValues,
    avgTicketValues,
    chartDates,
    fnbFoodCostChartData,
    fnbBreakevenChartPoints,
    t,
  ]);

  const hasAnyData = revenueValues.length >= 2 || occupancyValues.length >= 2 || customersValues.length >= 2;
  const loading = kpiLoading || dailyLoading;
  const emptyMsg = locale === 'th' ? 'ไม่มีข้อมูล' : 'No data';

  if (!mounted) {
    return (
      <PageLayout title={locale === 'th' ? 'เทรนด์' : 'Trends'} subtitle="">
        <div style={{ padding: `${PAGE_PADDING_TOP}px ${PAGE_PADDING_SIDES}px ${PAGE_PADDING_BOTTOM}px ${PAGE_PADDING_SIDES}px` }}>
          <div style={{ fontSize: 14, color: '#6b7280' }}>{locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}</div>
        </div>
      </PageLayout>
    );
  }

  if (!branch) {
    return (
      <PageLayout title={locale === 'th' ? 'เทรนด์' : 'Trends'} subtitle="">
        <ErrorState
          message={locale === 'th' ? 'ไม่พบสาขา' : 'No branch selected'}
          action={{
            label: locale === 'th' ? 'ไปที่ภาพรวม' : 'Go to Overview',
            onClick: () => router.push(paths.branchOverview || '/branch/overview'),
          }}
        />
      </PageLayout>
    );
  }

  if (!isAccommodation && !isFnb) {
    return (
      <PageLayout title={locale === 'th' ? 'เทรนด์' : 'Trends'} subtitle="">
        <div style={{ padding: `${PAGE_PADDING_TOP}px ${PAGE_PADDING_SIDES}px ${PAGE_PADDING_BOTTOM}px ${PAGE_PADDING_SIDES}px` }}>
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            {locale === 'th' ? 'เลือกสาขาประเภทที่พักหรือ F&B เพื่อดูเทรนด์' : 'Select an accommodation or F&B branch to view trends.'}
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="" subtitle="">
      <div style={{ padding: `${PAGE_PADDING_TOP}px ${PAGE_PADDING_SIDES}px ${PAGE_PADDING_BOTTOM}px ${PAGE_PADDING_SIDES}px` }}>
        {!hasAnyData && !loading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', fontSize: 15, color: '#6b7280' }}>
            {locale === 'th'
              ? 'เทรนด์จะปรากฏหลังจากมีข้อมูล 10+ วัน'
              : 'Trends will appear after 10+ days of data.'}
          </div>
        ) : (
          <>
            <style>{`
              @media (max-width: 900px) {
                .trends-page-grid > * { grid-column: span 12 !important; }
              }
            `}</style>
            <div
              className="trends-page-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(12, 1fr)',
                gap: GRID_GAP,
                marginTop: SECTION_GAP,
                alignItems: 'stretch',
              }}
            >
              {isAccommodation && (
                <>
                  {/* Section header: Revenue & Rate Performance (charts 1–4) */}
                  <div style={{ gridColumn: 'span 12', paddingTop: 4, paddingBottom: 2 }}>
                    <p style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#9ca3af',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      margin: 0,
                    }}>
                      {t('accTrendSignals.revenueRatePerformance')}
                    </p>
                  </div>

                  {/* 1. Occupancy + ADR (dual axis) — Primary */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy', color: '#2563eb' },
                      { label: locale === 'th' ? 'ราคาห้องเฉลี่ย' : 'ADR', color: '#7c3aed' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={accSignals?.chart1 ?? null}
                  >
                    <DecisionTrendChart
                      values={occupancyValues}
                      valuesRight={adrValues.length === occupancyValues.length ? adrValues : undefined}
                      dates={chartDates.length === occupancyValues.length ? chartDates : undefined}
                      color="#2563eb"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => `${Math.round(v)}%`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy (%)'}
                      rightLabel={locale === 'th' ? 'ราคาห้องเฉลี่ย (฿)' : 'ADR (฿)'}
                      emptyMessage={emptyMsg}
                      locale={chartLocale}
                      insightRevenue={aligned(revenueValues, occupancyValues.length)}
                      insightCustomers={aligned(customersValues, occupancyValues.length)}
                    />
                  </TrendChartCard>

                  {/* 2. Occupancy + RevPAR — Primary (demand vs room yield). Left: Occupancy, Right: RevPAR */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้ต่อห้อง' : 'RevPAR', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={accSignals?.chart2 ?? null}
                  >
                    <DecisionTrendChart
                      values={occupancyValues}
                      valuesRight={revparValues.length === occupancyValues.length ? revparValues : undefined}
                      dates={chartDates.length === occupancyValues.length ? chartDates : undefined}
                      color="#2563eb"
                      colorRight="#16a34a"
                      showBaseline={true}
                      formatLeft={(v) => `${Math.round(v)}%`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy (%)'}
                      rightLabel={locale === 'th' ? 'รายได้ต่อห้อง (฿)' : 'RevPAR (฿)'}
                      emptyMessage={emptyMsg}
                      locale={chartLocale}
                      insightCustomers={aligned(customersValues, occupancyValues.length)}
                    />
                  </TrendChartCard>

                  {/* 3. RevPAR + ADR with ADR Opportunity Band — Secondary */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'รายได้ต่อห้อง' : 'RevPAR', color: '#16a34a' },
                      { label: locale === 'th' ? 'ราคาห้องเฉลี่ย' : 'ADR', color: '#7c3aed' },
                    ]}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={accSignals?.chart3 ?? null}
                  >
                    <AdrOpportunityBandChart
                      revparValues={revparValues}
                      adrValues={adrValues.length === revparValues.length ? adrValues : []}
                      occupancyValues={occupancyValues.length === revparValues.length ? occupancyValues : []}
                      dates={chartDates.length === revparValues.length ? chartDates : []}
                      locale={chartLocale}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 4. RevPAR vs. Breakeven RevPAR — Row 2 right (half width) */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'RevPAR เทียบกับจุดคุ้มทุน' : 'RevPAR vs. Breakeven'}
                    legend={[
                      { label: locale === 'th' ? 'RevPAR จริง' : 'Actual RevPAR', color: '#16a34a' },
                      { label: locale === 'th' ? 'RevPAR จุดคุ้มทุน' : 'Breakeven RevPAR', color: '#ef4444' },
                    ]}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={accSignals?.chart4 ?? null}
                  >
                    <BreakevenRevParChart
                      dailyMetrics={dailyMetrics90.length >= 7 ? dailyMetrics90 : []}
                      roomsAvailable={totalRooms}
                      locale={chartLocale}
                    />
                  </TrendChartCard>

                  {/* Section header: Demand Patterns (charts 5–6) */}
                  <div style={{ gridColumn: 'span 12', paddingTop: 8, paddingBottom: 2 }}>
                    <p style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#9ca3af',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      margin: 0,
                    }}>
                      {t('accTrendSignals.demandPatterns')}
                    </p>
                  </div>

                  {/* 5. Occupancy by day of week — Row 3 left (half width) */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'อัตราการเข้าพักตามวันในสัปดาห์' : 'Occupancy by day of week'}
                    subtitle={locale === 'th' ? 'อัตราการเข้าพักเฉลี่ยต่อวันในสัปดาห์ (30 วันล่าสุด)' : 'Average occupancy % per day of week (last 30 days)'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={accSignals?.chart5 ?? null}
                  >
                    <DayOfWeekChart
                      values={occupancyValues.length >= 2 ? occupancyValues : revenueValues}
                      dates={chartDates.slice(0, (occupancyValues.length >= 2 ? occupancyValues : revenueValues).length)}
                      highlightWeekend={true}
                      formatValue={(v) => (occupancyValues.length >= 2 ? `${Math.round(v)}%` : `฿${Math.round(v)}`)}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 6. Weekly Performance Heatmap — Row 3 right (half width) */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'ตารางประสิทธิภาพรายสัปดาห์' : 'Weekly Performance Heatmap'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={accSignals?.chart6 ?? null}
                  >
                    <WeeklyHeatmapChart
                      dailyMetrics={dailyMetrics90.length >= 7 ? dailyMetrics90 : dailyMetrics}
                      roomsAvailable={totalRooms}
                      locale={chartLocale}
                    />
                  </TrendChartCard>
                </>
              )}

              {isFnb && (
                <>
                  {/* Section header: Revenue & Traffic Performance */}
                  <div style={{ gridColumn: 'span 12', paddingTop: 4, paddingBottom: 2 }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
                      {t('fnbSignals.revenueTraffic')}
                    </p>
                  </div>

                  {/* 1. Customers + Revenue — Primary (customers left axis, revenue right) */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'จำนวนลูกค้า' : 'Customers', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.chart1 ?? null}
                  >
                    <DecisionTrendChart
                      values={customersValues}
                      valuesRight={
                        revenueValues.length === customersValues.length ? revenueValues : undefined
                      }
                      dates={chartDates.length === customersValues.length ? chartDates : undefined}
                      color="#2563eb"
                      colorRight="#16a34a"
                      showBaseline={true}
                      formatLeft={(v) => String(Math.round(v))}
                      formatRight={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      leftLabel={locale === 'th' ? 'จำนวนลูกค้า' : 'Customers'}
                      rightLabel={locale === 'th' ? 'รายได้ (฿)' : 'Revenue (฿)'}
                      emptyMessage={emptyMsg}
                      locale={chartLocale}
                    />
                  </TrendChartCard>

                  {/* 2. Customers + Avg Ticket — Primary */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'จำนวนลูกค้า' : 'Customers', color: '#2563eb' },
                      { label: locale === 'th' ? 'ค่าใช้จ่ายเฉลี่ยต่อบิล' : 'Avg Ticket', color: '#7c3aed' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.chart2 ?? null}
                  >
                    <DecisionTrendChart
                      values={customersValues}
                      valuesRight={avgTicketValues.length === customersValues.length ? avgTicketValues : undefined}
                      dates={chartDates.length === customersValues.length ? chartDates : undefined}
                      color="#2563eb"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => String(Math.round(v))}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'จำนวนลูกค้า' : 'Customers'}
                      rightLabel={locale === 'th' ? 'ค่าใช้จ่ายเฉลี่ยต่อบิล (฿)' : 'Avg Ticket (฿)'}
                      emptyMessage={emptyMsg}
                      locale={chartLocale}
                      insightRevenue={aligned(revenueValues, customersValues.length)}
                    />
                  </TrendChartCard>

                  {/* 3. Revenue + Avg Ticket — Secondary */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                      { label: locale === 'th' ? 'ค่าใช้จ่ายเฉลี่ยต่อบิล' : 'Avg Ticket', color: '#7c3aed' },
                    ]}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.chart3 ?? null}
                  >
                    <DecisionTrendChart
                      values={revenueValues}
                      valuesRight={avgTicketValues.length === revenueValues.length ? avgTicketValues : undefined}
                      dates={chartDates.length === revenueValues.length ? chartDates : undefined}
                      color="#16a34a"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'รายได้ (฿)' : 'Revenue (฿)'}
                      rightLabel={locale === 'th' ? 'ค่าใช้จ่ายเฉลี่ยต่อบิล (฿)' : 'Avg Ticket (฿)'}
                      emptyMessage={emptyMsg}
                      locale={chartLocale}
                      insightCustomers={aligned(customersValues, revenueValues.length)}
                    />
                  </TrendChartCard>

                  {/* 4. Customers by day of week — Secondary */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'จำนวนลูกค้าตามวันในสัปดาห์' : 'Customers by day of week'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.chart4 ?? null}
                  >
                    <DayOfWeekChart
                      values={customersValues.length >= 2 ? customersValues : revenueValues}
                      dates={chartDates.slice(0, (customersValues.length >= 2 ? customersValues : revenueValues).length)}
                      highlightWeekend={true}
                      formatValue={(v) => (customersValues.length >= 2 ? String(Math.round(v)) : `฿${Math.round(v)}`)}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* Section header: Cost & Profitability */}
                  <div style={{ gridColumn: 'span 12', paddingTop: 8, paddingBottom: 2 }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
                      {t('fnbSignals.costProfitability')}
                    </p>
                  </div>

                  {/* 5. Food Cost % by Week */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'ต้นทุนอาหาร % รายสัปดาห์' : 'Food Cost % by Week'}
                    subtitle={locale === 'th' ? 'อัตราส่วนการซื้อวัตถุดิบต่อรายได้ (เป้าหมาย 28–35%)' : 'Purchase cost as % of revenue (target 28–35%)'}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.fcChart ?? null}
                  >
                    <FnbFoodCostChart
                      weeklyData={fnbFoodCostChartData}
                      locale={chartLocale}
                      emptyMessage={locale === 'th' ? 'บันทึกการซื้อวัตถุดิบเพื่อดูกราฟ' : 'Log food purchases to see this chart'}
                    />
                  </TrendChartCard>

                  {/* 6. Actual vs. Breakeven Customers */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'ลูกค้าจริง vs. จุดคุ้มทุน' : 'Actual vs. Breakeven Customers'}
                    legend={[
                      { label: locale === 'th' ? 'ลูกค้าจริง' : 'Actual', color: '#2563eb' },
                      { label: locale === 'th' ? 'จุดคุ้มทุน' : 'Breakeven', color: '#ef4444' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.bkChart ?? null}
                  >
                    <FnbBreakevenCustomersChart
                      points={fnbBreakevenChartPoints}
                      locale={chartLocale}
                      emptyMessage={locale === 'th' ? 'ตั้งค่าต้นทุนคงที่ใน Settings เพื่อดูกราฟ' : 'Set monthly fixed costs in Settings to see this chart'}
                    />
                  </TrendChartCard>

                  {/* Section header: Demand Patterns */}
                  <div style={{ gridColumn: 'span 12', paddingTop: 8, paddingBottom: 2 }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
                      {t('fnbSignals.demandPatterns')}
                    </p>
                  </div>

                  {/* 7. Weekly Revenue Heatmap — F&B */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'ตารางประสิทธิภาพรายสัปดาห์' : 'Weekly Performance Heatmap'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    insight={fnbSignals?.hmChart ?? null}
                  >
                    <FnbWeeklyHeatmapChart
                      dailyMetrics={dailyMetrics.length >= 7 ? dailyMetrics : []}
                      locale={chartLocale}
                    />
                  </TrendChartCard>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
