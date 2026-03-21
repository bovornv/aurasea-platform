'use client';

import { useRouter } from 'next/navigation';
import { formatCurrency } from '../../utils/formatting';
import type { CompanyPortfolioTrendSnapshot } from '../../services/db/latest-metrics-service';

interface Props {
  snapshot: CompanyPortfolioTrendSnapshot | null;
  loading: boolean;
  locale: string;
  coverageDays: number;
  trendsUrl: string | null;
}

export function CompanyBusinessTrendSummary({
  snapshot,
  loading,
  locale,
  coverageDays,
  trendsUrl,
}: Props) {
  const router = useRouter();
  const th = locale === 'th';
  const numLoc = th ? 'th-TH' : 'en-US';

  const linkBtn = trendsUrl ? (
    <button
      type="button"
      onClick={() => router.push(trendsUrl)}
      style={{
        alignSelf: 'flex-start',
        marginTop: '0.35rem',
        padding: '0.5rem 0.875rem',
        fontSize: '13px',
        fontWeight: 500,
        color: '#1e40af',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      {th ? 'ดูแนวโน้มแบบละเอียด →' : 'View full trends →'}
    </button>
  ) : null;

  if (snapshot?.ready) {
  const pct = snapshot.revenueChangePct;
  const pctColor =
    pct == null ? '#64748b' : pct >= 0 ? '#15803d' : '#b91c1c';
  const pctLabel =
    pct == null
      ? th
        ? 'ยังเปรียบเทียบ 7 วันก่อนหน้าไม่ได้ (ต้องมีอย่างน้อย 14 วันที่มีข้อมูล)'
        : 'Need 14 days of data to compare to the previous week.'
      : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

  const mixTotal = snapshot.accommodationRevenue7d + snapshot.fnbRevenue7d;
  const mixLine =
    mixTotal > 0 && snapshot.accommodationRevenue7d > 0 && snapshot.fnbRevenue7d > 0
      ? th
        ? `สัดส่วนรายได้ 7 วัน: ที่พัก ${Math.round((snapshot.accommodationRevenue7d / mixTotal) * 100)}% · F&B ${Math.round((snapshot.fnbRevenue7d / mixTotal) * 100)}%`
        : `7-day revenue mix: Rooms ${Math.round((snapshot.accommodationRevenue7d / mixTotal) * 100)}% · F&B ${Math.round((snapshot.fnbRevenue7d / mixTotal) * 100)}%`
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <ul
        style={{
          margin: 0,
          paddingLeft: '1.2rem',
          fontSize: '14px',
          color: '#374151',
          lineHeight: 1.55,
        }}
      >
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ fontWeight: 600 }}>
            {th
              ? `รายได้รวมทุกสาขา (${snapshot.currentWindowDays} วันล่าสุด)`
              : `Combined revenue, last ${snapshot.currentWindowDays} day(s)`}
            :{' '}
          </span>
          ฿{formatCurrency(snapshot.totalRevenue7d, numLoc)}
          {snapshot.latestMetricDate ? (
            <span style={{ color: '#64748b', fontWeight: 400 }}>
              {' '}
              ({th ? 'ล่าสุด' : 'latest'} {snapshot.latestMetricDate})
            </span>
          ) : null}
        </li>
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ fontWeight: 600 }}>{th ? 'เทียบ 7 วันก่อนหน้า' : 'vs prior 7 days'}: </span>
          <span style={{ color: pctColor, fontWeight: 600 }}>{pctLabel}</span>
          {pct != null && snapshot.priorTotalRevenue7d != null ? (
            <span style={{ color: '#64748b' }}>
              {' '}
              ({th ? 'ก่อนหน้า' : 'prior'} ฿{formatCurrency(snapshot.priorTotalRevenue7d, numLoc)})
            </span>
          ) : null}
        </li>
        {snapshot.avgOccupancy7d != null ? (
          <li style={{ marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>{th ? 'อัตราเข้าพักเฉลี่ย (รายวันในกลุ่ม)' : 'Avg occupancy (daily, portfolio)'}: </span>
            {snapshot.avgOccupancy7d.toFixed(1)}%
          </li>
        ) : null}
        {snapshot.totalCustomers7d != null ? (
          <li style={{ marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>{th ? 'ลูกค้า F&B รวม' : 'F&B customers (total)'}: </span>
            {formatCurrency(snapshot.totalCustomers7d, numLoc)}
          </li>
        ) : null}
        {mixLine ? <li style={{ marginBottom: 0 }}>{mixLine}</li> : null}
      </ul>
      {linkBtn}
    </div>
  );
  }

  if (loading) {
    return (
      <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
        {th ? 'กำลังโหลดแนวโน้ม…' : 'Loading trends…'}
      </p>
    );
  }

  if (coverageDays < 7) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
          {th
            ? 'ข้อมูลรายวันของบางสาขายังไม่ครบ 7 วัน — เมื่อครบจะเปรียบเทียบช่วง 7 วันล่าสุดกับ 7 วันก่อนหน้าได้ชัดเจนขึ้น'
            : 'Some branches are still building toward 7 days of daily data — then we can compare the latest week to the prior week.'}
        </p>
        {linkBtn}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
        {th
          ? 'ยังไม่พบข้อมูลรายได้รายวันจากเมตริกรายวันของสาขาในกลุ่ม — ตรวจสอบการบันทึกข้อมูล'
          : 'No daily revenue from branch metrics yet — check accommodation / F&B daily metrics are recorded.'}
      </p>
      {linkBtn}
    </div>
  );
}
