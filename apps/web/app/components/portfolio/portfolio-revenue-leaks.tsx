/**
 * Portfolio Revenue Leaks — Company Today: always up to 3 rows by impact_estimate (revenueImpact), no “stable” empty.
 */
'use client';

import { useMemo } from 'react';
import { SectionCard } from '../section-card';
import { formatCurrency } from '../../utils/formatting';
import type { ExtendedAlertContract } from '../../services/monitoring-service';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';

interface PortfolioRevenueLeaksProps {
  alerts: AlertContract[];
  locale: string;
}

function impactThb(alert: AlertContract): number {
  const extended = alert as ExtendedAlertContract;
  const impact = extended.revenueImpact;
  if (typeof impact !== 'number' || !isFinite(impact) || isNaN(impact) || impact < 0) return 0;
  return impact;
}

export function PortfolioRevenueLeaks({ alerts, locale }: PortfolioRevenueLeaksProps) {
  const branchNamesMap = useMemo(() => {
    if (typeof window === 'undefined') return new Map<string, string>();
    try {
      const { businessGroupService } = require('../../services/business-group-service');
      const map = new Map<string, string>();
      businessGroupService.getAllBranches().forEach((b: { id: string; branchName?: string }) => {
        if (b.id && b.branchName) map.set(b.id, b.branchName);
      });
      return map;
    } catch {
      return new Map<string, string>();
    }
  }, [alerts]);

  const topThree = useMemo(() => {
    const list = Array.isArray(alerts) ? [...alerts] : [];
    const uniqueAlertsMap = new Map<string, ExtendedAlertContract>();
    list.forEach((alert) => {
      const ext = alert as ExtendedAlertContract;
      const code = (alert as { code?: string }).code || alert.id;
      const branchId = alert.branchId || 'unknown';
      const uniqueKey = `${code}_${branchId}`;
      if (!uniqueAlertsMap.has(uniqueKey)) {
        uniqueAlertsMap.set(uniqueKey, ext);
      } else {
        const existing = uniqueAlertsMap.get(uniqueKey)!;
        if (impactThb(ext) > impactThb(existing)) uniqueAlertsMap.set(uniqueKey, ext);
      }
    });

    const ranked = Array.from(uniqueAlertsMap.values()).sort(
      (a, b) => impactThb(b as AlertContract) - impactThb(a as AlertContract)
    );

    const take = ranked.slice(0, 3);
    const pad: Array<{ alert: ExtendedAlertContract | null; filler: boolean }> = take.map((a) => ({
      alert: a,
      filler: false,
    }));
    while (pad.length < 3) {
      pad.push({ alert: null, filler: true });
    }
    return pad;
  }, [alerts]);

  const title = locale === 'th' ? '3 รายการเสี่ยงรายได้สูงสุด' : 'Top 3 Revenue Leaks';

  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {topThree.map((row, idx) => {
          if (row.filler || !row.alert) {
            return (
              <div
                key={`filler-${idx}`}
                style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  border: '1px dashed #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#6b7280',
                }}
              >
                {locale === 'th'
                  ? `${idx + 1}. ยังไม่มีสัญญาณเสี่ยงอันดับถัดไป — บันทึกข้อมูลต่อเนื่องเพื่อให้ระบบแสดงความเสี่ยงที่เหลือ`
                  : `${idx + 1}. No further ranked risk in the top 3 — keep logging to surface additional signals.`}
              </div>
            );
          }
          const alert = row.alert;
          const bid = alert.branchId;
          const branchLabel =
            bid && branchNamesMap.has(bid)
              ? branchNamesMap.get(bid)!
              : locale === 'th'
                ? 'ทั้งองค์กร'
                : 'Organization';
          const issue = alert.revenueImpactTitle || alert.message?.split('.')[0] || alert.id;
          const imp = impactThb(alert as AlertContract);
          const reason =
            alert.contributingFactors?.[0]?.factor ||
            alert.message?.split('.').slice(0, 2).join('.').trim() ||
            '—';
          const action =
            alert.revenueImpactDescription ||
            alert.conditions?.find((c) => /recommend|action|review/i.test(c)) ||
            (alert.conditions?.length ? alert.conditions[alert.conditions.length - 1] : null) ||
            (locale === 'th' ? 'ดูหน้าการแจ้งเตือนสำหรับขั้นตอนถัดไป' : 'See Alerts for recommended next steps.');

          return (
            <div
              key={`${alert.id}-${bid ?? idx}`}
              style={{
                padding: '1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                {idx + 1}. {branchLabel} — {issue}
              </div>
              <div style={{ fontSize: '13px', color: '#b91c1c', fontWeight: 600, marginBottom: '0.35rem' }}>
                {locale === 'th' ? 'ผลกระทบ: ' : 'Impact: '}
                ฿{formatCurrency(imp)}
                {locale === 'th' ? ' ต่อเดือน (ประมาณการ)' : '/mo (est.)'}
              </div>
              <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem', lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{locale === 'th' ? 'เหตุผล: ' : 'Reason: '}</span>
                {reason}
              </div>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600 }}>{locale === 'th' ? 'แนะนำ: ' : 'Recommended action: '}</span>
                {action}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
