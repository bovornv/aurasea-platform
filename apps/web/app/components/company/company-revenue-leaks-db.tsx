'use client';

import { SectionCard } from '../section-card';
import { formatCurrency } from '../../utils/formatting';
import type { NormalizedRevenueLeakRow } from '../../services/db/company-today-data-service';

interface Props {
  rows: NormalizedRevenueLeakRow[];
  locale: string;
}

/** Top revenue leaks from `alerts_top3_revenue_leaks`. */
export function CompanyRevenueLeaksDb({ rows, locale }: Props) {
  const title = locale === 'th' ? '3 รายการเสี่ยงรายได้สูงสุด' : 'Top 3 Revenue Leaks';

  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            {locale === 'th'
              ? 'ไม่มีแถวใน alerts_top3_revenue_leaks สำหรับสาขาที่เลือก'
              : 'No rows in alerts_top3_revenue_leaks for selected branches.'}
          </p>
        ) : (
          rows.map((r, idx) => (
            <div
              key={`${r.branchId}-${idx}-${r.issue}`}
              style={{
                padding: '1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                {idx + 1}. {r.branchName} — {r.issue || '—'}
              </div>
              <div style={{ fontSize: '13px', color: '#b91c1c', fontWeight: 600, marginBottom: '0.35rem' }}>
                {locale === 'th' ? 'ผลกระทบ: ' : 'Impact: '}
                ฿{formatCurrency(r.impactThb)}
              </div>
              <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem', lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{locale === 'th' ? 'เหตุผล: ' : 'Reason: '}</span>
                {r.reason || '—'}
              </div>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{locale === 'th' ? 'แนะนำ: ' : 'Recommended action: '}</span>
                {r.action || '—'}
              </div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
