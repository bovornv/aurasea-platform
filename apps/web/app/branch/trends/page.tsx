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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!branch?.id) {
      setKpiLoading(false);
      return;
    }
    getBranchKpiMetrics(branch.id, 30)
      .then((rows) => {
        setKpiRows(rows ?? []);
        setKpiLoading(false);
      })
      .catch(() => {
        setKpiRows([]);
        setKpiLoading(false);
      });
  }, [branch?.id]);

  const isAccommodation = branch?.moduleType === 'accommodation';
  const isFnb = branch?.moduleType === 'fnb';

  const revenueValues = useMemo(() => {
    const fromKpi = kpiRows
      .filter((r) => r.revenue != null && !Number.isNaN(Number(r.revenue)))
      .map((r) => Number(r.revenue));
    if (fromKpi.length >= 2) return fromKpi;
    const fromHistory = branchMetrics?.dailyHistory?.revenue;
    if (fromHistory && fromHistory.length >= 2) return fromHistory;
    return [];
  }, [kpiRows, branchMetrics?.dailyHistory?.revenue]);

  const occupancyValues = useMemo(() => {
    const occ = branchMetrics?.dailyHistory?.occupancy;
    if (!occ || occ.length < 2) return [];
    return occ.map((v) => (v <= 1 ? v * 100 : v));
  }, [branchMetrics?.dailyHistory?.occupancy]);

  const customersValues = useMemo(() => {
    const c = branchMetrics?.dailyHistory?.customers;
    if (!c || c.length < 2) return [];
    return c;
  }, [branchMetrics?.dailyHistory?.customers]);

  const revparValues = useMemo(() => {
    const rev = branchMetrics?.dailyHistory?.revenue;
    const totalRooms = branchMetrics?.modules?.accommodation?.totalRoomsAvailable ?? 1;
    if (!rev || rev.length < 2) return [];
    return rev.map((r) => (totalRooms > 0 ? r / totalRooms : 0));
  }, [branchMetrics?.dailyHistory?.revenue, branchMetrics?.modules?.accommodation?.totalRoomsAvailable]);

  const adrValues = useMemo(() => {
    const rev = branchMetrics?.dailyHistory?.revenue;
    const occ = branchMetrics?.dailyHistory?.occupancy;
    const totalRooms = branchMetrics?.modules?.accommodation?.totalRoomsAvailable ?? 1;
    if (!rev || !occ || rev.length !== occ.length || rev.length < 2) return [];
    return rev.map((r, i) => {
      const o = occ[i]!;
      const sold = o <= 1 ? o * totalRooms : (o / 100) * totalRooms;
      return sold > 0 ? r / sold : 0;
    });
  }, [branchMetrics?.dailyHistory?.revenue, branchMetrics?.dailyHistory?.occupancy, branchMetrics?.modules?.accommodation?.totalRoomsAvailable]);

  const avgTicketValues = useMemo(() => {
    const rev = branchMetrics?.dailyHistory?.revenue;
    const cust = branchMetrics?.dailyHistory?.customers;
    if (!rev || !cust || rev.length !== cust.length || rev.length < 2) return [];
    return rev.map((r, i) => (cust[i]! > 0 ? r / cust[i]! : 0));
  }, [branchMetrics?.dailyHistory?.revenue, branchMetrics?.dailyHistory?.customers]);

  const hasAnyData = revenueValues.length >= 2 || occupancyValues.length >= 2 || customersValues.length >= 2;

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
        {!hasAnyData && !kpiLoading ? (
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
