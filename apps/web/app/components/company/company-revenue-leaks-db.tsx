'use client';

import type { CSSProperties } from 'react';
import { SectionCard } from '../section-card';
import { formatCurrency } from '../../utils/formatting';
import type { NormalizedRevenueLeakRow } from '../../services/db/company-today-data-service';

interface Props {
  rows: NormalizedRevenueLeakRow[];
  locale: string;
  /** View is top-3; cap display for consistency. */
  maxItems?: number;
}

const ACTION_FALLBACK = { en: 'Review performance', th: 'ทบทวนประสิทธิภาพ' };

const lineClamp: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** Top revenue leaks from `alerts_top3_revenue_leaks`, sorted by impact DESC in service. */
export function CompanyRevenueLeaksDb({ rows, locale, maxItems = 3 }: Props) {
  const th = locale === 'th';
  const title = th ? '3 รายการเสี่ยงรายได้สูงสุด' : 'Top 3 Revenue Leaks';
  const numLocale = th ? 'th-TH' : 'en-US';
  const visible = rows.slice(0, maxItems);

  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {visible.length === 0 ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            {th
              ? 'ไม่มีแถวใน alerts_top3_revenue_leaks สำหรับสาขาที่เลือก'
              : 'No rows in alerts_top3_revenue_leaks for selected branches.'}
          </p>
        ) : (
          visible.map((r) => {
            const actionText = r.recommendedAction?.trim() || (th ? ACTION_FALLBACK.th : ACTION_FALLBACK.en);
            const titleLine =
              r.alertType.trim() !== '' ? `${r.branchName} — ${r.alertType}` : r.branchName;
            return (
              <div
                key={r.rowKey}
                style={{
                  padding: '1rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginBottom: '0.35rem',
                    ...lineClamp,
                  }}
                  title={titleLine}
                >
                  {titleLine}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: '#b91c1c',
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                    ...lineClamp,
                  }}
                >
                  {th ? 'ผลกระทบ: ' : 'Impact: '}฿{formatCurrency(r.impactThb, numLocale)}
                </div>
                {r.cause.trim() !== '' ? (
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#4b5563',
                      marginBottom: '0.25rem',
                      lineHeight: 1.4,
                      ...lineClamp,
                    }}
                    title={r.cause}
                  >
                    <span style={{ fontWeight: 600 }}>{th ? 'เหตุผล: ' : 'Reason: '}</span>
                    {r.cause}
                  </div>
                ) : null}
                <div
                  style={{ fontSize: '13px', color: '#374151', lineHeight: 1.4, ...lineClamp }}
                  title={actionText}
                >
                  <span style={{ fontWeight: 600 }}>{th ? 'แนะนำ: ' : 'Recommended action: '}</span>
                  {actionText}
                </div>
              </div>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}
