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
import { TrendChartCard } from '../../components/charts/trend-chart-card';
import { DecisionTrendChart } from '../../components/charts/decision-trend-chart';
import { DayOfWeekChart } from '../../components/charts/day-of-week-chart';
import { AdrOpportunityBandChart } from '../../components/charts/adr-opportunity-band-chart';
import { BreakevenRevParChart } from '../../components/charts/breakeven-revpar-chart';
import { WeeklyHeatmapChart } from '../../components/charts/weekly-heatmap-chart';
import { trendInsightDual, trendInsightFromSeries } from '../../utils/trend-chart-insights';

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
  const { locale } = useI18n();
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
                  {/* 1. Occupancy + ADR (dual axis) — Primary */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy', color: '#2563eb' },
                      { label: locale === 'th' ? 'ราคาห้องเฉลี่ย' : 'ADR', color: '#7c3aed' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={branchTrendInsights.accOccAdr?.problem ?? ''}
                    recommendation={branchTrendInsights.accOccAdr?.recommendation ?? ''}
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
                    problem={branchTrendInsights.accOccRev?.problem ?? ''}
                    recommendation={branchTrendInsights.accOccRev?.recommendation ?? ''}
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
                    problem={branchTrendInsights.accRevparAdr?.problem ?? ''}
                    recommendation={branchTrendInsights.accRevparAdr?.recommendation ?? ''}
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

                  {/* 4. Occupancy by day of week — Secondary */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'อัตราการเข้าพักตามวันในสัปดาห์' : 'Occupancy by day of week'}
                    subtitle={locale === 'th' ? 'อัตราการเข้าพักเฉลี่ยต่อวันในสัปดาห์ (30 วันล่าสุด)' : 'Average occupancy % per day of week (last 30 days)'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={branchTrendInsights.accDow?.problem ?? ''}
                    recommendation={branchTrendInsights.accDow?.recommendation ?? ''}
                  >
                    <DayOfWeekChart
                      values={occupancyValues.length >= 2 ? occupancyValues : revenueValues}
                      dates={chartDates.slice(0, (occupancyValues.length >= 2 ? occupancyValues : revenueValues).length)}
                      highlightWeekend={true}
                      formatValue={(v) => (occupancyValues.length >= 2 ? `${Math.round(v)}%` : `฿${Math.round(v)}`)}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 5. RevPAR vs. Breakeven RevPAR — Half width */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'RevPAR เทียบกับจุดคุ้มทุน' : 'RevPAR vs. Breakeven'}
                    legend={[
                      { label: locale === 'th' ? 'RevPAR จริง' : 'Actual RevPAR', color: '#16a34a' },
                      { label: locale === 'th' ? 'RevPAR จุดคุ้มทุน' : 'Breakeven RevPAR', color: '#ef4444' },
                    ]}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                  >
                    <BreakevenRevParChart
                      dailyMetrics={dailyMetrics.length >= 7 ? dailyMetrics : []}
                      roomsAvailable={totalRooms}
                      locale={chartLocale}
                    />
                  </TrendChartCard>

                  {/* 6. Weekly Performance Heatmap — Half width */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'ตารางประสิทธิภาพรายสัปดาห์' : 'Weekly Performance Heatmap'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
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
                  {/* 1. Customers + Revenue — Primary (customers left axis, revenue right) */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'จำนวนลูกค้า' : 'Customers', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={branchTrendInsights.fnbCustRev?.problem ?? ''}
                    recommendation={branchTrendInsights.fnbCustRev?.recommendation ?? ''}
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
                    problem={branchTrendInsights.fnbCustTicket?.problem ?? ''}
                    recommendation={branchTrendInsights.fnbCustTicket?.recommendation ?? ''}
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
                    problem={branchTrendInsights.fnbRevTicket?.problem ?? ''}
                    recommendation={branchTrendInsights.fnbRevTicket?.recommendation ?? ''}
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
                    problem={branchTrendInsights.fnbDow?.problem ?? ''}
                    recommendation={branchTrendInsights.fnbDow?.recommendation ?? ''}
                  >
                    <DayOfWeekChart
                      values={customersValues.length >= 2 ? customersValues : revenueValues}
                      dates={chartDates.slice(0, (customersValues.length >= 2 ? customersValues : revenueValues).length)}
                      highlightWeekend={true}
                      formatValue={(v) => (customersValues.length >= 2 ? String(Math.round(v)) : `฿${Math.round(v)}`)}
                      emptyMessage={emptyMsg}
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
