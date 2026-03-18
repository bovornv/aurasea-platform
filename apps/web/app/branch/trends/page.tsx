/**
 * Branch Trends Page — Decision tomorrow, premium SaaS layout.
 * Layout by branch type only: accommodation OR fnb (no toggle, no mix).
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
import { SimpleTrendLine } from '../../components/charts/simple-trend-line';

const PAGE_PADDING = 24;
const SECTION_GAP = 32;
const GRID_GAP = 16;

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
      getBranchKpiMetrics(branch.id, 30),
      getDailyMetrics(branch.id, 30),
      getBranchTrendSeriesWithFallback(branch.id, 30),
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

  // Primary source: today_summary_clean (has occupancy, revpar, adr in one query). Fallback: dailyMetrics + kpiRows.
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
                {/* Row 1: Occupancy | Revenue */}
                <TrendChartCard
                  title={locale === 'th' ? 'เทรนด์อัตราการเข้าพัก' : 'Occupancy Trend'}
                  cols={6}
                  insight={
                    occupancyValues.length >= 7 && occupancyValues[occupancyValues.length - 1]! < 50
                      ? (locale === 'th' ? 'อัตราการเข้าพักวันธรรมดาต่ำ → พิจารณาโปรโมชั่นวันธรรมดา' : 'Weekday occupancy is consistently lower → consider weekday promotions')
                      : null
                  }
                >
                  <SimpleTrendLine
                    values={occupancyValues}
                    color="#6366f1"
                    emptyMessage={emptyMsg}
                  />
                </TrendChartCard>
                <TrendChartCard
                  title={locale === 'th' ? 'เทรนด์รายได้' : 'Revenue Trend'}
                  cols={6}
                  insight={
                    revenueValues.length >= 2
                      ? (locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Last 30 days revenue')
                      : null
                  }
                >
                  <SimpleTrendLine values={revenueValues} color="#059669" emptyMessage={emptyMsg} />
                </TrendChartCard>

                {/* Row 2: RevPAR full width */}
                <TrendChartCard
                  title={locale === 'th' ? 'เทรนด์ RevPAR' : 'RevPAR Trend'}
                  cols={12}
                  insight={
                    revparValues.length >= 7
                      ? (locale === 'th' ? 'RevPAR รวมอัตราการเข้าพักและราคา → โฟกัสทั้งสองเพื่อเติบโต' : 'RevPAR combines occupancy and rate → focus on both for growth')
                      : null
                  }
                >
                  <SimpleTrendLine values={revparValues} color="#7c3aed" emptyMessage={emptyMsg} />
                </TrendChartCard>

                {/* Row 3: ADR | Occupancy vs ADR */}
                <TrendChartCard title={locale === 'th' ? 'เทรนด์ ADR' : 'ADR Trend'} cols={6}>
                  <SimpleTrendLine values={adrValues} color="#0ea5e9" emptyMessage={emptyMsg} />
                </TrendChartCard>
                <TrendChartCard
                  title={locale === 'th' ? 'อัตราการเข้าพัก vs ADR' : 'Occupancy vs ADR'}
                  cols={6}
                >
                  <SimpleTrendLine values={occupancyValues.length >= 2 ? occupancyValues : []} color="#8b5cf6" emptyMessage={emptyMsg} />
                </TrendChartCard>
              </>
            )}

            {isFnb && (
              <>
                {/* Row 1: Revenue | Customers */}
                <TrendChartCard
                  title={locale === 'th' ? 'เทรนด์รายได้' : 'Revenue Trend'}
                  cols={6}
                  insight={
                    revenueValues.length >= 2
                      ? (locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Last 30 days revenue')
                      : null
                  }
                >
                  <SimpleTrendLine values={revenueValues} color="#059669" emptyMessage={emptyMsg} />
                </TrendChartCard>
                <TrendChartCard
                  title={locale === 'th' ? 'เทรนด์จำนวนลูกค้า' : 'Customers Trend'}
                  cols={6}
                  insight={
                    customersValues.length >= 7
                      ? (locale === 'th' ? 'จำนวนลูกค้าต่อวัน' : 'Daily customer count')
                      : null
                  }
                >
                  <SimpleTrendLine values={customersValues} color="#6366f1" emptyMessage={emptyMsg} />
                </TrendChartCard>

                {/* Row 2: Avg Ticket full width */}
                <TrendChartCard
                  title={locale === 'th' ? 'เทรนด์ค่าเฉลี่ยต่อบิล' : 'Avg Ticket Trend'}
                  cols={12}
                  insight={
                    avgTicketValues.length >= 7
                      ? (locale === 'th' ? 'ค่าเฉลี่ยต่อบิลสะท้อนความสามารถในการขายเพิ่ม → พิจารณาอัปเซลล์' : 'Avg ticket reflects monetization power → consider upsells')
                      : null
                  }
                >
                  <SimpleTrendLine values={avgTicketValues} color="#7c3aed" emptyMessage={emptyMsg} />
                </TrendChartCard>

                {/* Row 3: Revenue vs Customers | Day-of-week */}
                <TrendChartCard
                  title={locale === 'th' ? 'รายได้ vs จำนวนลูกค้า' : 'Revenue vs Customers'}
                  cols={6}
                >
                  <SimpleTrendLine values={revenueValues} color="#0ea5e9" emptyMessage={emptyMsg} />
                </TrendChartCard>
                <TrendChartCard
                  title={locale === 'th' ? 'รูปแบบตามวันในสัปดาห์' : 'Day-of-week Pattern'}
                  cols={6}
                >
                  <SimpleTrendLine values={customersValues.length >= 2 ? customersValues : []} color="#8b5cf6" emptyMessage={emptyMsg} />
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
