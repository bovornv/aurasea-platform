/**
 * Portfolio Recommended Actions Component
 * 
 * Prioritized actions ranked by revenue impact
 */
'use client';

import { useRouter } from 'next/navigation';
import { SectionCard } from '../section-card';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { formatCurrency } from '../../utils/formatting';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../services/monitoring-service';

interface PortfolioRecommendedActionsProps {
  alerts: AlertContract[];
  locale: string;
}

export function PortfolioRecommendedActions({ alerts, locale }: PortfolioRecommendedActionsProps) {
  const router = useRouter();
  const paths = useOrgBranchPaths();

  // PART 5: Recommended Actions (Company)
  // Logic:
  // - Collect top 3 highest impact alerts across branches
  // - Generate: Action summary, Branch reference, Estimated improvement
  // - Ensure: No duplicates
  // - Ensure: Not empty if alerts exist
  // - If no alerts: Show "All branches stable."

  // PART 5: Filter to alerts with positive revenue impact
  const alertsWithImpact = alerts.filter((alert): alert is ExtendedAlertContract => {
    const extended = alert as ExtendedAlertContract;
    const impact = extended.revenueImpact;
    // PART 9: Numerical Stability - ensure impact is valid
    if (typeof impact !== 'number' || !isFinite(impact) || isNaN(impact) || impact <= 0) {
      return false;
    }
    return true;
  });

  // PART 5: Deduplicate by alert code (keep highest impact per code)
  const uniqueAlertsMap = new Map<string, ExtendedAlertContract>();
  alertsWithImpact.forEach(alert => {
    const code = (alert as any).code || alert.id;
    if (!uniqueAlertsMap.has(code)) {
      uniqueAlertsMap.set(code, alert);
    } else {
      const existing = uniqueAlertsMap.get(code)!;
      if ((alert.revenueImpact || 0) > (existing.revenueImpact || 0)) {
        uniqueAlertsMap.set(code, alert);
      }
    }
  });

  // PART 5: Sort by impact descending, take top 3
  const top3Alerts = Array.from(uniqueAlertsMap.values())
    .sort((a, b) => {
      const aImpact = isFinite(Number(a.revenueImpact)) && !isNaN(Number(a.revenueImpact)) ? (a.revenueImpact ?? 0) : 0;
      const bImpact = isFinite(Number(b.revenueImpact)) && !isNaN(Number(b.revenueImpact)) ? (b.revenueImpact ?? 0) : 0;
      return bImpact - aImpact;
    })
    .slice(0, 3);

  // PART 5: Generate actions with branch reference
  const actions = top3Alerts.map((alert) => {
    // PART 5: Find all branches affected by this alert type
    const affectedBranches = new Set<string>();
    alerts.forEach(a => {
      const code = (a as any).code || a.id;
      const alertCode = (alert as any).code || alert.id;
      if (code === alertCode && a.branchId) {
        affectedBranches.add(a.branchId);
      }
    });

    return {
      title: alert.revenueImpactTitle || alert.message.split('.')[0] || alert.message.substring(0, 50),
      explanation: alert.revenueImpactDescription || alert.message,
      revenueImpact: alert.revenueImpact || 0,
      affectedBranches: affectedBranches.size || 1,
      branchId: alert.branchId, // PART 5: Include branch reference
      alertId: alert.id,
    };
  });

  // PART 5: If no alerts: Show "All branches stable."
  if (actions.length === 0) {
    return (
      <SectionCard title={locale === 'th' ? 'คำแนะนำ' : 'Recommended Actions'}>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          {locale === 'th' 
            ? 'ทุกสาขามีเสถียรภาพ'
            : 'All branches stable.'}
        </div>
      </SectionCard>
    );
  }

  const handleTakeAction = (alertId: string) => {
    if (paths.companyAlerts) router.push(`${paths.companyAlerts}?alert=${alertId}`);
  };

  return (
    <SectionCard title={locale === 'th' ? 'คำแนะนำ' : 'Recommended Actions'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {actions.map((action, idx) => (
          <div
            key={idx}
            style={{
              padding: '1rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                {action.title}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {action.explanation}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {locale === 'th' ? 'ส่งผลต่อ' : 'Affects'} {action.affectedBranches} {locale === 'th' ? 'สาขา' : 'branches'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', minWidth: '140px' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#10b981' }}>
                ฿{formatCurrency(action.revenueImpact)}/mo
              </div>
              <button
                onClick={() => handleTakeAction(action.alertId || '')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#0a0a0a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {locale === 'th' ? 'ดำเนินการ' : 'Take Action'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
