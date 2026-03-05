/**
 * Portfolio Alert Summary Component
 * 
 * PART 3: Current Company Risks
 * Must show:
 * - Number of branches with risk
 * - % of total revenue exposed
 * - Count of critical alerts
 * - Risk tier (Low / Moderate / High)
 */
'use client';

import { useMemo } from 'react';
import { SectionCard } from '../section-card';
import { formatCurrency } from '../../utils/formatting';
import { calculateRevenueExposureFromAlerts } from '../../utils/revenue-exposure-calculator';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../services/monitoring-service';

interface PortfolioAlertSummaryProps {
  alerts: AlertContract[];
  totalCompanyRevenue?: number; // Total revenue across all branches (30 days)
  locale: string;
}

export function PortfolioAlertSummary({ alerts, totalCompanyRevenue = 0, locale }: PortfolioAlertSummaryProps) {
  // PART 3: Calculate company risk metrics
  const riskMetrics = useMemo(() => {
    if (!alerts || alerts.length === 0) {
      return {
        revenueExposed: 0,
        riskRatio: 0,
        riskTier: 'Low' as 'Low' | 'Moderate' | 'High',
        branchesWithRisk: 0,
        criticalAlertCount: 0,
        hasInsufficientData: totalCompanyRevenue === 0,
      };
    }

    // PART 3: revenueExposed = sum(alert.revenueImpact)
    const revenueExposed = calculateRevenueExposureFromAlerts(alerts);
    
    // PART 3: riskRatio = revenueExposed / totalCompanyRevenue
    // PART 9: Guard against division by zero
    let riskRatio = 0;
    if (totalCompanyRevenue > 0 && isFinite(totalCompanyRevenue) && !isNaN(totalCompanyRevenue)) {
      riskRatio = revenueExposed / totalCompanyRevenue;
      // PART 9: Ensure result is valid
      if (!isFinite(riskRatio) || isNaN(riskRatio)) {
        riskRatio = 0;
      }
    }

    // PART 3: Tier logic: <10% → Low, 10–25% → Moderate, ≥25% → High
    let riskTier: 'Low' | 'Moderate' | 'High' = 'Low';
    if (riskRatio >= 0.25) {
      riskTier = 'High';
    } else if (riskRatio >= 0.10) {
      riskTier = 'Moderate';
    } else {
      riskTier = 'Low';
    }

    // PART 3: Count branches with risk (branches that have alerts)
    const branchesWithRiskSet = new Set<string>();
    alerts.forEach(alert => {
      if (alert.branchId) {
        branchesWithRiskSet.add(alert.branchId);
      }
    });
    const branchesWithRisk = branchesWithRiskSet.size;

    // PART 3: Count of critical alerts
    const criticalAlertCount = alerts.filter(a => a.severity === 'critical').length;

    return {
      revenueExposed,
      riskRatio,
      riskTier,
      branchesWithRisk,
      criticalAlertCount,
      hasInsufficientData: totalCompanyRevenue === 0 || !isFinite(totalCompanyRevenue) || isNaN(totalCompanyRevenue),
    };
  }, [alerts, totalCompanyRevenue]);

  const topAlerts = alerts
    .slice(0, 5)
    .sort((a, b) => {
      const severityWeight = { critical: 3, warning: 2, informational: 1 };
      return (severityWeight[b.severity as keyof typeof severityWeight] || 0) - 
             (severityWeight[a.severity as keyof typeof severityWeight] || 0);
    });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      case 'warning': return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
      default: return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
    }
  };

  // PART 3: Guard - If totalCompanyRevenue = 0 → show "Insufficient Data"
  if (riskMetrics.hasInsufficientData) {
    return (
      <SectionCard title={locale === 'th' ? 'ความเสี่ยงบริษัทปัจจุบัน' : 'Current Company Risks'}>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          {locale === 'th' 
            ? 'ข้อมูลไม่เพียงพอ'
            : 'Insufficient Data'}
        </div>
      </SectionCard>
    );
  }

  if (topAlerts.length === 0) {
    return (
      <SectionCard title={locale === 'th' ? 'ความเสี่ยงบริษัทปัจจุบัน' : 'Current Company Risks'}>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          {locale === 'th' 
            ? 'บริษัทกำลังดำเนินงานภายในเกณฑ์ที่ปลอดภัย'
            : 'Company is operating within safe thresholds.'}
        </div>
      </SectionCard>
    );
  }

  // PART 3: Get risk tier color
  const getRiskTierColor = (tier: 'Low' | 'Moderate' | 'High') => {
    switch (tier) {
      case 'High': return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      case 'Moderate': return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
      default: return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
    }
  };

  const tierColors = getRiskTierColor(riskMetrics.riskTier);

  return (
    <SectionCard title={locale === 'th' ? 'ความเสี่ยงบริษัทปัจจุบัน' : 'Current Company Risks'}>
      {/* PART 3: Risk Summary Header */}
      <div style={{ 
        padding: '1rem', 
        backgroundColor: tierColors.bg, 
        border: `1px solid ${tierColors.border}`,
        borderRadius: '6px',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
              {locale === 'th' ? 'ระดับความเสี่ยง' : 'Risk Tier'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: tierColors.text }}>
              {riskMetrics.riskTier}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
              {locale === 'th' ? '% ของรายได้ที่เสี่ยง' : '% Revenue Exposed'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: tierColors.text }}>
              {(riskMetrics.riskRatio * 100).toFixed(1)}%
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '12px', color: '#6b7280' }}>
          <div>
            {locale === 'th' ? 'สาขาที่มีความเสี่ยง:' : 'Branches with risk:'} <strong>{riskMetrics.branchesWithRisk}</strong>
          </div>
          <div>
            {locale === 'th' ? 'การแจ้งเตือนวิกฤต:' : 'Critical alerts:'} <strong>{riskMetrics.criticalAlertCount}</strong>
          </div>
          <div>
            {locale === 'th' ? 'รายได้ที่เสี่ยง:' : 'Revenue exposed:'} <strong>฿{formatCurrency(riskMetrics.revenueExposed)}/mo</strong>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {topAlerts.map((alert, idx) => {
          const colors = getSeverityColor(alert.severity);
          const extendedAlert = alert as ExtendedAlertContract;
          const revenueImpact = extendedAlert.revenueImpact || 0;

          return (
            <div
              key={alert.id || idx}
              style={{
                padding: '0.875rem 1rem',
                backgroundColor: '#ffffff',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {alert.severity}
                </span>
                <span style={{ fontSize: '14px', color: '#0a0a0a', fontWeight: 500 }}>
                  {alert.message.split('.')[0] || alert.message.substring(0, 60)}
                </span>
              </div>
              {revenueImpact > 0 && (
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444', whiteSpace: 'nowrap' }}>
                  ฿{formatCurrency(revenueImpact)}/mo
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
