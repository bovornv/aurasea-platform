/**
 * Portfolio Revenue Leaks Component
 * 
 * Top 3 revenue leaks with impact and actions
 */
'use client';

import { SectionCard } from '../section-card';
import { formatCurrency } from '../../utils/formatting';
import type { ExtendedAlertContract } from '../../services/monitoring-service';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';

interface PortfolioRevenueLeaksProps {
  alerts: AlertContract[];
  locale: string;
}

export function PortfolioRevenueLeaks({ alerts, locale }: PortfolioRevenueLeaksProps) {
  // PART 4: Top 3 Revenue Leaks (Company Level)
  // Must:
  // - Combine all branch revenue leaks
  // - Sort by revenueImpact descending
  // - Return top 3 globally
  // - Ensure: No duplicate alert types per branch
  // - Ensure: No 0-impact leaks
  // - Rolling 30-day calculation only
  
  // PART 4: Filter to alerts with positive revenue impact (no 0-impact leaks)
  const alertsWithImpact = alerts.filter((alert): alert is ExtendedAlertContract => {
    const extended = alert as ExtendedAlertContract;
    const impact = extended.revenueImpact;
    // PART 9: Numerical Stability - ensure impact is valid
    if (typeof impact !== 'number' || !isFinite(impact) || isNaN(impact) || impact <= 0) {
      return false;
    }
    return true;
  });

  // PART 4: Deduplicate by alert code + branchId (no duplicate alert types per branch)
  // Use Map with key = code + branchId to keep separate alerts per branch
  const uniqueAlertsMap = new Map<string, ExtendedAlertContract>();
  alertsWithImpact.forEach(alert => {
    const code = (alert as any).code || alert.id;
    const branchId = alert.branchId || 'unknown';
    const uniqueKey = `${code}_${branchId}`;
    // Keep the alert with highest impact if duplicate exists
    if (!uniqueAlertsMap.has(uniqueKey)) {
      uniqueAlertsMap.set(uniqueKey, alert);
    } else {
      const existing = uniqueAlertsMap.get(uniqueKey)!;
      if ((alert.revenueImpact || 0) > (existing.revenueImpact || 0)) {
        uniqueAlertsMap.set(uniqueKey, alert);
      }
    }
  });

  // PART 4: Sort by revenueImpact descending, return top 3 globally
  const revenueLeakAlerts = Array.from(uniqueAlertsMap.values())
    .map(alert => ({
      ...alert,
      // moneyLeakTHB is the same as revenueImpact (already in THB)
      moneyLeakTHB: alert.revenueImpact || 0,
    }))
    .sort((a, b) => {
      // PART 9: Numerical Stability - ensure values are valid
      const aImpact = isFinite(a.moneyLeakTHB) && !isNaN(a.moneyLeakTHB) ? a.moneyLeakTHB : 0;
      const bImpact = isFinite(b.moneyLeakTHB) && !isNaN(b.moneyLeakTHB) ? b.moneyLeakTHB : 0;
      return bImpact - aImpact;
    })
    .slice(0, 3);

  if (revenueLeakAlerts.length === 0) {
    return (
      <SectionCard title={locale === 'th' ? '3 รายการที่ทำให้สูญเสียรายได้มากที่สุด' : 'Top 3 Revenue Leaks'}>
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '6px',
        }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
            {locale === 'th' ? '✓ ไม่พบความเสี่ยงการสูญเสียรายได้' : '✓ No concentration risk detected'}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {locale === 'th' 
              ? 'ระบบไม่พบการสูญเสียรายได้ที่สำคัญในเดือนนี้'
              : 'No significant revenue leaks or concentration risks detected this month.'}
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={locale === 'th' ? '3 รายการที่ทำให้สูญเสียรายได้มากที่สุด' : 'Top 3 Revenue Leaks'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {revenueLeakAlerts.map((alert, idx) => {
          const actionHint = alert.conditions?.find(c => c.toLowerCase().includes('recommend')) 
            || alert.conditions?.find(c => c.toLowerCase().includes('action'))
            || alert.conditions?.[alert.conditions.length - 1]
            || (locale === 'th' ? 'ตรวจสอบรายละเอียดการแจ้งเตือนสำหรับแนวทางที่แนะนำ' : 'Review alert details for suggested actions');

          return (
            <div
              key={alert.id}
              style={{
                padding: '1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                  {alert.revenueImpactTitle || alert.message.split('.')[0]}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.5rem', lineHeight: '1.5' }}>
                  {alert.revenueImpactDescription || alert.message}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                  💡 {actionHint}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
                  ฿{formatCurrency(alert.revenueImpact)}/mo
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
