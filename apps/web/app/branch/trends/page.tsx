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
import { getDailyMetrics } from '../../services/db/daily-metrics-service';
import { getBranchTrendSeriesWithFallback } from '../../services/db/latest-metrics-service';
import { TrendChartCard } from '../../components/charts/trend-chart-card';
import { DecisionTrendChart } from '../../components/charts/decision-trend-chart';
import { DayOfWeekChart } from '../../components/charts/day-of-week-chart';
import { headlineDelta, formatHeadline } from '../../utils/trends-headline';

const PAGE_PADDING = 24;
const SECTION_GAP = 32;
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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!branch?.id) {
      setKpiLoading(false);
      setDailyLoading(false);
      setTrendSeries(null);
      return;
    }
    Promise.all([
      getBranchKpiMetrics(branch.id, DEFAULT_DAYS),
      getDailyMetrics(branch.id, DEFAULT_DAYS),
      getBranchTrendSeriesWithFallback(branch.id, DEFAULT_DAYS),
    ])
      .then(([rows, daily, series]) => {
        setKpiRows(rows ?? []);
        setDailyMetrics(daily ?? []);
        setTrendSeries(series ?? null);
        setKpiLoading(false);
        setDailyLoading(false);
      })
      .catch(() => {
        setKpiRows([]);
        setDailyMetrics([]);
        setTrendSeries(null);
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
    if (trendSeries && trendSeries.revpar.length >= 2) return trendSeries.revpar;
    if (dailyMetrics.length >= 2) {
      return dailyMetrics.map((m) => {
        const avail = m.roomsAvailable ?? 0;
        return avail > 0 ? m.revenue / avail : 0;
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

  const hasAnyData = revenueValues.length >= 2 || occupancyValues.length >= 2 || customersValues.length >= 2;
  const loading = kpiLoading || dailyLoading;

  if (!mounted) {
    return (
      <PageLayout title={locale === 'th' ? 'เทรนด์' : 'Trends'} subtitle="">
        <div style={{ padding: PAGE_PADDING }}>
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
        <div style={{ padding: PAGE_PADDING }}>
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            {locale === 'th' ? 'เลือกสาขาประเภทที่พักหรือ F&B เพื่อดูเทรนด์' : 'Select an accommodation or F&B branch to view trends.'}
          </div>
        </div>
      </PageLayout>
    );
  }

  const emptyMsg = locale === 'th' ? 'ไม่มีข้อมูล' : 'No data';
  const pageSubtitle = locale === 'th'
    ? 'ดูสิ่งที่เปลี่ยนและสิ่งที่ควรทำต่อ'
    : 'See what\'s changing and what to do next';

  return (
    <PageLayout title={locale === 'th' ? 'เทรนด์' : 'Trends'} subtitle={pageSubtitle}>
      <div style={{ padding: PAGE_PADDING }}>
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
                alignItems: 'start',
              }}
            >
              {isAccommodation && (
                <>
                  {/* 1. Occupancy + ADR (dual axis) — Primary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'อัตราการเข้าพัก + ADR' : 'Occupancy + ADR'}
                    headline={formatHeadline(
                      headlineDelta(occupancyValues).current,
                      headlineDelta(occupancyValues).pctVsLastWeek,
                      'percent'
                    )}
                    cols={12}
                    insight={
                      occupancyValues.length >= 7 && occupancyValues[occupancyValues.length - 1]! < 50
                        ? (locale === 'th' ? 'อัตราการเข้าพักวันธรรมดาต่ำ → พิจารณาโปรโมชั่นวันธรรมดา' : 'Weekdays consistently weaker → run weekday promotion')
                        : (locale === 'th' ? 'เทรนด์ 30 วันล่าสุด' : 'Last 30 days trend')
                    }
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
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 2. Revenue — Primary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'รายได้' : 'Revenue'}
                    headline={formatHeadline(
                      headlineDelta(revenueValues).current,
                      headlineDelta(revenueValues).pctVsLastWeek,
                      'currency'
                    )}
                    cols={12}
                    insight={locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Last 30 days revenue'}
                  >
                    <DecisionTrendChart
                      values={revenueValues}
                      dates={chartDates.length === revenueValues.length ? chartDates : undefined}
                      color="#059669"
                      showBaseline={true}
                      formatLeft={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 3. RevPAR + ADR — Secondary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'RevPAR + ADR' : 'RevPAR + ADR'}
                    headline={
                      revparValues.length >= 2
                        ? formatHeadline(
                            headlineDelta(revparValues).current,
                            headlineDelta(revparValues).pctVsLastWeek,
                            'currency'
                          )
                        : undefined
                    }
                    cols={6}
                    insight={
                      revparValues.length >= 7
                        ? (locale === 'th' ? 'RevPAR รวมอัตราการเข้าพักและราคา → โฟกัสทั้งสอง' : 'RevPAR combines occupancy and rate → focus on both')
                        : undefined
                    }
                  >
                    <DecisionTrendChart
                      values={revparValues}
                      valuesRight={adrValues.length === revparValues.length ? adrValues : undefined}
                      dates={chartDates.length === revparValues.length ? chartDates : undefined}
                      color="#059669"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => `฿${Math.round(v)}`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 4. Weekday vs Weekend — Secondary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'วันธรรมดา vs สุดสัปดาห์' : 'Weekday vs Weekend'}
                    cols={6}
                    insight={
                      locale === 'th'
                        ? 'รูปแบบตามวันในสัปดาห์ (เสาร์–อาทิตย์เน้นสี)'
                        : 'Day-of-week pattern (weekend highlighted)'
                    }
                  >
                    <DayOfWeekChart
                      values={occupancyValues.length >= 2 ? occupancyValues : revenueValues}
                      dates={chartDates.slice(0, (occupancyValues.length >= 2 ? occupancyValues : revenueValues).length)}
                      highlightWeekend={true}
                      formatValue={(v) => (occupancyValues.length >= 2 ? `${Math.round(v)}%` : `฿${Math.round(v)}`)}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>
                </>
              )}

              {isFnb && (
                <>
                  {/* 1. Revenue + Customers — Primary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'รายได้ + จำนวนลูกค้า' : 'Revenue + Customers'}
                    headline={formatHeadline(
                      headlineDelta(revenueValues).current,
                      headlineDelta(revenueValues).pctVsLastWeek,
                      'currency'
                    )}
                    cols={12}
                    insight={locale === 'th' ? 'ความต้องการและรายได้ 30 วัน' : 'Demand and revenue — last 30 days'}
                  >
                    <DecisionTrendChart
                      values={revenueValues}
                      valuesRight={customersValues.length === revenueValues.length ? customersValues : undefined}
                      dates={chartDates.length === revenueValues.length ? chartDates : undefined}
                      color="#059669"
                      colorRight="#2563eb"
                      showBaseline={true}
                      formatLeft={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      formatRight={(v) => String(Math.round(v))}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 2. Customers + Avg Ticket — Primary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'จำนวนลูกค้า + ค่าเฉลี่ยต่อบิล' : 'Customers + Avg Ticket'}
                    headline={
                      customersValues.length >= 2
                        ? formatHeadline(
                            headlineDelta(customersValues).current,
                            headlineDelta(customersValues).pctVsLastWeek,
                            'number'
                          )
                        : undefined
                    }
                    cols={12}
                    insight={
                      avgTicketValues.length >= 7
                        ? (locale === 'th' ? 'ลูกค้าและคุณภาพการขาย → พิจารณาอัปเซลล์' : 'Traffic and monetization → consider upsells')
                        : undefined
                    }
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
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 3. Revenue + Avg Ticket — Secondary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'รายได้ + ค่าเฉลี่ยต่อบิล' : 'Revenue + Avg Ticket'}
                    cols={6}
                    insight={locale === 'th' ? 'คุณภาพมูลค่ารายได้' : 'Revenue value quality'}
                  >
                    <DecisionTrendChart
                      values={revenueValues}
                      valuesRight={avgTicketValues.length === revenueValues.length ? avgTicketValues : undefined}
                      dates={chartDates.length === revenueValues.length ? chartDates : undefined}
                      color="#059669"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 4. Day-of-week pattern — Secondary */}
                  <TrendChartCard
                    title={locale === 'th' ? 'รูปแบบตามวันในสัปดาห์' : 'Day-of-week Pattern'}
                    cols={6}
                    insight={
                      locale === 'th'
                        ? 'จังหวะความต้องการ (เสาร์–อาทิตย์เน้นสี)'
                        : 'Demand timing (weekend highlighted)'
                    }
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
