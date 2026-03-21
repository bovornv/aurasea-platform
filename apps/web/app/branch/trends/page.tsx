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

  const emptyMsg = locale === 'th' ? 'ไม่มีข้อมูล' : 'No data';

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
                alignItems: 'start',
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
                    problem={
                      occupancyValues.length >= 7 && occupancyValues[occupancyValues.length - 1]! < 50
                        ? (locale === 'th' ? 'วันธรรมดามีอัตราการเข้าพักต่ำอย่างต่อเนื่อง' : 'Weekday occupancy consistently low')
                        : undefined
                    }
                    recommendation={
                      occupancyValues.length >= 7 && occupancyValues[occupancyValues.length - 1]! < 50
                        ? (locale === 'th' ? 'ทำโปรโมชั่นช่วงวันธรรมดา' : 'Run weekday promotion')
                        : undefined
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
                      leftLabel={locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy (%)'}
                      rightLabel={locale === 'th' ? 'ราคาห้องเฉลี่ย (฿)' : 'ADR (฿)'}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 2. Occupancy + Revenue — Primary (demand vs money). Left: Occupancy, Right: Revenue */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={locale === 'th' ? 'รายได้หรืออัตราการเข้าพักไม่สอดคล้องกัน' : 'Revenue and occupancy moving in opposite directions'}
                    recommendation={locale === 'th' ? 'ปรับราคาหรือโปรโมชั่นให้สอดคล้องกับความต้องการ' : 'Align pricing or promotions with demand'}
                  >
                    <DecisionTrendChart
                      values={occupancyValues}
                      valuesRight={revenueValues.length === occupancyValues.length ? revenueValues : undefined}
                      dates={chartDates.length === occupancyValues.length ? chartDates : undefined}
                      color="#2563eb"
                      colorRight="#16a34a"
                      showBaseline={true}
                      formatLeft={(v) => `${Math.round(v)}%`}
                      formatRight={(v) => `฿${(v / 1000).toFixed(0)}k`}
                      leftLabel={locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy (%)'}
                      rightLabel={locale === 'th' ? 'รายได้ (฿)' : 'Revenue (฿)'}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 3. RevPAR + ADR — Secondary */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'รายได้ต่อห้อง' : 'RevPAR', color: '#16a34a' },
                      { label: locale === 'th' ? 'ราคาห้องเฉลี่ย' : 'ADR', color: '#7c3aed' },
                    ]}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={locale === 'th' ? 'RevPAR หรือ ADR ต่ำกระทบรายได้ต่อห้อง' : 'Low RevPAR or ADR hurts revenue per room'}
                    recommendation={locale === 'th' ? 'โฟกัสทั้งอัตราการเข้าพักและราคา' : 'Focus on both occupancy and rate'}
                  >
                    <DecisionTrendChart
                      values={revparValues}
                      valuesRight={adrValues.length === revparValues.length ? adrValues : undefined}
                      dates={chartDates.length === revparValues.length ? chartDates : undefined}
                      color="#16a34a"
                      colorRight="#7c3aed"
                      showBaseline={true}
                      formatLeft={(v) => `฿${Math.round(v)}`}
                      formatRight={(v) => `฿${Math.round(v)}`}
                      leftLabel={locale === 'th' ? 'รายได้ต่อห้อง (฿)' : 'RevPAR (฿)'}
                      rightLabel={locale === 'th' ? 'ราคาห้องเฉลี่ย (฿)' : 'ADR (฿)'}
                      emptyMessage={emptyMsg}
                    />
                  </TrendChartCard>

                  {/* 4. Occupancy by day of week — Secondary */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'อัตราการเข้าพักตามวันในสัปดาห์' : 'Occupancy by day of week'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={locale === 'th' ? 'วันธรรมดามีรายได้หรืออัตราการเข้าพักต่ำ' : 'Weekdays show lower demand or revenue'}
                    recommendation={locale === 'th' ? 'โปรโมชั่นวันธรรมดาหรือแพ็กเกจ' : 'Run weekday promotion or package deals'}
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
                  {/* 1. Customers + Revenue — Primary (customers left axis, revenue right) */}
                  <TrendChartCard
                    legend={[
                      { label: locale === 'th' ? 'จำนวนลูกค้า' : 'Customers', color: '#2563eb' },
                      { label: locale === 'th' ? 'รายได้' : 'Revenue', color: '#16a34a' },
                    ]}
                    cols={12}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={locale === 'th' ? 'รายได้หรือจำนวนลูกค้าลด' : 'Revenue or customer traffic declining'}
                    recommendation={locale === 'th' ? 'โปรโมชั่นหรือแพ็กเกจเพื่อดึงลูกค้า' : 'Run promotion or bundle to attract traffic'}
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
                    problem={locale === 'th' ? 'ลูกค้าน้อยหรือค่าเฉลี่ยต่อบิลต่ำ' : 'Low traffic or low avg ticket'}
                    recommendation={locale === 'th' ? 'อัปเซลล์หรือโปรโมชั่นค่าเฉลี่ยสูง' : 'Upsell or promote higher-ticket items'}
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
                    problem={locale === 'th' ? 'คุณภาพมูลค่ารายได้ต่ำ' : 'Revenue value quality is weak'}
                    recommendation={locale === 'th' ? 'เพิ่มอัปเซลล์หรือเมนูมูลค่าสูง' : 'Increase upsell or higher-value menu'}
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
                    />
                  </TrendChartCard>

                  {/* 4. Customers by day of week — Secondary */}
                  <TrendChartCard
                    titleLabel={locale === 'th' ? 'จำนวนลูกค้าตามวันในสัปดาห์' : 'Customers by day of week'}
                    cols={6}
                    locale={locale === 'th' ? 'th' : 'en'}
                    problem={locale === 'th' ? 'วันธรรมดามีลูกค้าน้อย' : 'Weekdays show lower traffic'}
                    recommendation={locale === 'th' ? 'โปรโมชั่นวันธรรมดาหรือเมนูพิเศษ' : 'Weekday promotion or special menu'}
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
