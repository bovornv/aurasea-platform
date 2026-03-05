/**
 * Branch Scenario Page - True Financial Simulator
 * 
 * Real-time financial projections with risk shift analysis
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useHealthScore } from '../../hooks/use-health-score';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { Toast } from '../../components/toast';
import { formatCurrency } from '../../utils/formatting';
import { businessGroupService } from '../../services/business-group-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../services/monitoring-service';

export default function BranchScenarioPage() {
  // ALL HOOKS MUST BE CALLED FIRST - NO CONDITIONALS, NO EARLY RETURNS
  const { locale } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();
  const { alerts: rawAlerts } = useAlertStore();
  const { groupHealthScore } = useHealthScore();
  const [mounted, setMounted] = useState(false);
  
  // Simulation controls
  const [demandChange, setDemandChange] = useState(0); // percentage
  const [pricingChange, setPricingChange] = useState(0); // percentage
  const [staffingChange, setStaffingChange] = useState(0); // absolute number
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get current baseline data
  const baselineData = useMemo(() => {
    if (!branch) return null;
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      const signals = operationalSignalsService.getAllSignals(branch.id, businessGroup?.id);
      if (signals.length === 0) return null;
      
      const latest = signals[0];
      return {
        revenue30Days: latest.revenue30Days,
        costs30Days: latest.costs30Days,
        cashBalance: latest.cashBalance,
        staffCount: latest.staffCount,
      };
    } catch (e) {
      console.error('Failed to get baseline data:', e);
      return null;
    }
  }, [branch]);

  // Get current health score
  const currentHealthScore = useMemo(() => {
    if (!branch || !groupHealthScore?.branchScores) return null;
    return groupHealthScore.branchScores.find(bs => bs.branchId === branch.id)?.healthScore || null;
  }, [branch, groupHealthScore?.branchScores]);

  // Calculate financial projections
  const projections = useMemo(() => {
    if (!baselineData) return null;
    
    // Calculate projected revenue (demand change + pricing change)
    const revenueMultiplier = (1 + demandChange / 100) * (1 + pricingChange / 100);
    const projectedRevenue = baselineData.revenue30Days * revenueMultiplier;
    
    // Calculate projected costs (staffing change affects labor costs)
    // Assume average staff cost is 15% of total costs per staff member
    const avgStaffCost = baselineData.costs30Days / baselineData.staffCount;
    const staffingCostChange = staffingChange * avgStaffCost;
    const projectedCosts = baselineData.costs30Days + staffingCostChange;
    
    // Calculate net cash flow
    const netCashFlow = projectedRevenue - projectedCosts;
    
    // Calculate cash runway (days)
    // Cap at reasonable maximum (e.g., 10 years) to avoid Infinity
    const MAX_RUNWAY_DAYS = 3650; // 10 years
    const cashRunway = netCashFlow > 0 
      ? Math.min(MAX_RUNWAY_DAYS, Math.floor((baselineData.cashBalance / netCashFlow) * 30))
      : netCashFlow === 0
      ? MAX_RUNWAY_DAYS // Show as very long runway instead of Infinity
      : -1; // Negative indicates cash depletion
    
    // Estimate health score change (simplified)
    // Positive cash flow + revenue increase = better health
    // Negative cash flow or revenue decrease = worse health
    let healthScoreChange = 0;
    if (netCashFlow > 0 && revenueMultiplier > 1) {
      healthScoreChange = Math.min(10, Math.round((revenueMultiplier - 1) * 20));
    } else if (netCashFlow < 0 || revenueMultiplier < 1) {
      healthScoreChange = Math.max(-10, Math.round((1 - revenueMultiplier) * 20));
    }
    
    const projectedHealthScore = currentHealthScore 
      ? Math.max(0, Math.min(100, currentHealthScore + healthScoreChange))
      : null;
    
    // Ensure all values are finite (no Infinity or NaN)
    const safeRevenue = isFinite(projectedRevenue) ? projectedRevenue : baselineData.revenue30Days;
    const safeCosts = isFinite(projectedCosts) ? projectedCosts : baselineData.costs30Days;
    const safeNetCashFlow = isFinite(netCashFlow) ? netCashFlow : 0;
    const safeRevenueChange = isFinite(safeRevenue - baselineData.revenue30Days) ? safeRevenue - baselineData.revenue30Days : 0;
    const safeCostChange = isFinite(safeCosts - baselineData.costs30Days) ? safeCosts - baselineData.costs30Days : 0;
    
    return {
      revenue: safeRevenue,
      costs: safeCosts,
      cashRunway,
      healthScore: projectedHealthScore,
      netCashFlow: safeNetCashFlow,
      revenueChange: safeRevenueChange,
      costChange: safeCostChange,
    };
  }, [baselineData, demandChange, pricingChange, staffingChange, currentHealthScore]);

  // Calculate risk shift analysis
  const riskShiftAnalysis = useMemo(() => {
    if (!branch || !rawAlerts || !projections) return null;
    
    const branchAlerts = rawAlerts.filter(alert => alert.branchId === branch.id);
    
    // FIX: Deduplicate alerts by code first before filtering
    const alertsByCode = new Map<string, AlertContract>();
    branchAlerts.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsByCode.has(code)) {
        alertsByCode.set(code, alert);
      }
    });
    const uniqueBranchAlerts = Array.from(alertsByCode.values());
    
    // Alerts likely to disappear (if revenue improves significantly)
    const alertsToDisappear = uniqueBranchAlerts.filter(alert => {
      const extended = alert as ExtendedAlertContract;
      // Low utilization alerts likely to disappear if demand increases
      if (alert.id.includes('utilization') || alert.id.includes('weekday') && demandChange > 10) {
        return true;
      }
      // Cash runway alerts likely to disappear if cash flow improves
      if (alert.id.includes('runway') || alert.id.includes('liquidity') && projections.netCashFlow > 0) {
        return true;
      }
      return false;
    });
    
    // PART 5: Deduplicate alertsToDisappear by code before rendering
    // Use Map for more efficient deduplication
    const alertsToDisappearByCode = new Map<string, AlertContract>();
    alertsToDisappear.forEach(alert => {
      const code = (alert as any).code || alert.id;
      if (!alertsToDisappearByCode.has(code)) {
        alertsToDisappearByCode.set(code, alert);
      }
    });
    const uniqueAlertsToDisappear = Array.from(alertsToDisappearByCode.values());
    
    // PART 5: Validate scenario page (no duplicates, unique alerts)
    // Note: Validation runs in useEffect, not in useMemo
    
    // Additional deduplication by content (message + severity) to catch duplicates with different codes
    const seenContent = new Set<string>();
    const finalUniqueAlerts = uniqueAlertsToDisappear.filter(alert => {
      const contentKey = `${alert.message || ''}|${alert.severity}`;
      if (seenContent.has(contentKey)) {
        return false;
      }
      seenContent.add(contentKey);
      return true;
    });
    
    // Alerts likely to trigger (if costs increase or revenue decreases)
    const alertsToTrigger: Array<{ name: string; reason: string }> = [];
    if (projections.netCashFlow < 0) {
      alertsToTrigger.push({
        name: locale === 'th' ? 'ความเสี่ยงเงินสด' : 'Cash Flow Risk',
        reason: locale === 'th' ? 'กระแสเงินสดติดลบ' : 'Negative cash flow',
      });
    }
    if (staffingChange > 0 && demandChange <= 0) {
      alertsToTrigger.push({
        name: locale === 'th' ? 'แรงกดดันต้นทุน' : 'Cost Pressure',
        reason: locale === 'th' ? 'เพิ่มพนักงานโดยไม่เพิ่มรายได้' : 'Increased staffing without revenue growth',
      });
    }
    if (demandChange < -10) {
      alertsToTrigger.push({
        name: locale === 'th' ? 'ความเสี่ยงด้านความต้องการ' : 'Demand Risk',
        reason: locale === 'th' ? 'ความต้องการลดลงอย่างมาก' : 'Significant demand decline',
      });
    }
    
    // Calculate net revenue improvement
    // Ensure finite values (no Infinity)
    const revenueChange = isFinite(projections.revenueChange) ? projections.revenueChange : 0;
    const costChange = isFinite(projections.costChange) ? projections.costChange : 0;
    const netRevenueImprovement = revenueChange - costChange;
    
    return {
      alertsToDisappear: uniqueAlertsToDisappear,
      alertsToTrigger,
      netRevenueImprovement,
    };
  }, [branch, rawAlerts, projections, demandChange, staffingChange, locale]);

  // PART 5: Validate scenario page (no duplicates, unique alerts) — runs after riskShiftAnalysis is defined
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && mounted && riskShiftAnalysis?.alertsToDisappear) {
      try {
        const { validateScenarioPage } = require('../../utils/scenario-page-validator');
        const validation = validateScenarioPage(riskShiftAnalysis.alertsToDisappear as any[], { verbose: true });
        if (!validation.passed) {
          console.warn('[Scenario] Validation failed:', validation.errors);
        }
      } catch (e) {
        console.warn('[Scenario] Validation check failed:', e);
      }
    }
  }, [mounted, riskShiftAnalysis]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveSimulation = () => {
    // Save simulation to localStorage (for future reference)
    const simulation = {
      timestamp: new Date().toISOString(),
      branchId: branch?.id,
      inputs: {
        demandChange,
        pricingChange,
        staffingChange,
      },
      projections,
      riskShiftAnalysis,
    };
    
    const savedSimulations = JSON.parse(localStorage.getItem('scenario_simulations') || '[]');
    savedSimulations.push(simulation);
    localStorage.setItem('scenario_simulations', JSON.stringify(savedSimulations));
    
    showToast(
      locale === 'th' ? 'บันทึกสถานการณ์จำลองสำเร็จ' : 'Simulation saved successfully',
      'success'
    );
  };

  const resetSimulation = () => {
    setDemandChange(0);
    setPricingChange(0);
    setStaffingChange(0);
  };

  if (!mounted) {
    return (
      <PageLayout title="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (!branch) {
    return (
      <PageLayout title="">
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

  if (!baselineData) {
    return (
      <PageLayout title="">
        <ErrorState
          message={locale === 'th' ? 'ไม่มีข้อมูลพื้นฐานสำหรับการจำลอง' : 'No baseline data available for simulation'}
          action={{
            label: locale === 'th' ? 'ไปที่อัปเดตตัวเลขล่าสุด' : 'Go to Update Latest Metrics',
            onClick: () => router.push(paths.orgId && branch ? `/org/${paths.orgId}/branch/${branch.id}/metrics` : (paths.branchOverview || '/branch/overview')),
          }}
        />
      </PageLayout>
    );
  }

  const hasChanges = demandChange !== 0 || pricingChange !== 0 || staffingChange !== 0;

  return (
    <PageLayout title="">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Simulation Mode Banner */}
      <div style={{
        padding: '1rem 1.5rem',
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
          {locale === 'th' ? 'โหมดจำลอง' : 'Simulation Mode'}
        </div>
        <div style={{ fontSize: '13px', color: '#1e3a8a' }}>
          {locale === 'th'
            ? 'การจำลองนี้ไม่เปลี่ยนข้อมูลการติดตามแบบเรียลไทม์ ใช้สำหรับการวางแผนเท่านั้น'
            : 'This simulation does not change live monitoring data. Use for planning only.'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* SECTION 1: Simulation Controls */}
        <SectionCard title={locale === 'th' ? 'ตัวควบคุมการจำลอง' : 'Simulation Controls'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Demand Change */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  {locale === 'th' ? 'การเปลี่ยนแปลงความต้องการ (%)' : 'Demand Change (%)'}
                </label>
                <input
                  type="number"
                  value={demandChange}
                  onChange={(e) => setDemandChange(Math.max(-50, Math.min(50, parseInt(e.target.value) || 0)))}
                  style={{
                    width: '80px',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    textAlign: 'center',
                  }}
                />
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={demandChange}
                onChange={(e) => setDemandChange(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Pricing Change */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  {locale === 'th' ? 'การเปลี่ยนแปลงราคา (%)' : 'Pricing Change (%)'}
                </label>
                <input
                  type="number"
                  value={pricingChange}
                  onChange={(e) => setPricingChange(Math.max(-30, Math.min(30, parseInt(e.target.value) || 0)))}
                  style={{
                    width: '80px',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    textAlign: 'center',
                  }}
                />
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                value={pricingChange}
                onChange={(e) => setPricingChange(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Staffing Change */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  {locale === 'th' ? 'การเปลี่ยนแปลงจำนวนพนักงาน' : 'Staffing Change (# employees)'}
                </label>
                <input
                  type="number"
                  value={staffingChange}
                  onChange={(e) => setStaffingChange(Math.max(-10, Math.min(10, parseInt(e.target.value) || 0)))}
                  style={{
                    width: '80px',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    textAlign: 'center',
                  }}
                />
              </div>
              <input
                type="range"
                min="-10"
                max="10"
                value={staffingChange}
                onChange={(e) => setStaffingChange(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </SectionCard>

        {/* SECTION 2: Financial Impact Projection */}
        {projections && (
          <SectionCard title={locale === 'th' ? 'การคาดการณ์ผลกระทบทางการเงิน' : 'Financial Impact Projection'}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'รายได้รายเดือนที่คาดการณ์' : 'Projected Monthly Revenue'}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                  ฿{formatCurrency(projections.revenue)}
                </div>
                <div style={{ fontSize: '12px', color: projections.revenueChange >= 0 ? '#10b981' : '#ef4444' }}>
                  {projections.revenueChange >= 0 ? '+' : ''}฿{formatCurrency(projections.revenueChange)}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ต้นทุนรายเดือนที่คาดการณ์' : 'Projected Monthly Costs'}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                  ฿{formatCurrency(projections.costs)}
                </div>
                <div style={{ fontSize: '12px', color: projections.costChange <= 0 ? '#10b981' : '#ef4444' }}>
                  {projections.costChange >= 0 ? '+' : ''}฿{formatCurrency(projections.costChange)}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ระยะเวลาวิ่งเงินสดที่คาดการณ์' : 'Projected Cash Runway'}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: projections.cashRunway > 0 ? '#0a0a0a' : '#ef4444', marginBottom: '0.25rem' }}>
                  {projections.cashRunway === -1
                    ? (locale === 'th' ? 'หมด' : 'Depleted')
                    : projections.cashRunway >= 3650
                    ? (locale === 'th' ? '10+ ปี' : '10+ years')
                    : `${projections.cashRunway} ${locale === 'th' ? 'วัน' : 'days'}`}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {locale === 'th' ? 'กระแสเงินสดสุทธิ' : 'Net Cash Flow'}: ฿{formatCurrency(projections.netCashFlow)}/mo
                </div>
              </div>
              
              {projections.healthScore !== null && (
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'คะแนนสุขภาพที่คาดการณ์' : 'Projected Health Score'}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: projections.healthScore >= 80 ? '#10b981' : projections.healthScore >= 60 ? '#f59e0b' : '#ef4444', marginBottom: '0.25rem' }}>
                    {Math.round(projections.healthScore)}
                  </div>
                  {currentHealthScore && (
                    <div style={{ fontSize: '12px', color: projections.healthScore >= currentHealthScore ? '#10b981' : '#ef4444' }}>
                      {projections.healthScore >= currentHealthScore ? '+' : ''}{Math.round(projections.healthScore - currentHealthScore)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* SECTION 3: Risk Shift Analysis */}
        {riskShiftAnalysis && hasChanges && (
          <SectionCard title={locale === 'th' ? 'การวิเคราะห์การเปลี่ยนแปลงความเสี่ยง' : 'Risk Shift Analysis'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Alerts likely to disappear */}
              {riskShiftAnalysis.alertsToDisappear.length > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#10b981', marginBottom: '0.75rem' }}>
                    {locale === 'th' ? 'การแจ้งเตือนที่อาจหายไป' : 'Alerts Likely to Disappear'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {riskShiftAnalysis.alertsToDisappear.map((alert, idx) => {
                      // Clean up alert message - remove "within 0 days" patterns
                      let alertMessage = alert.message || alert.id;
                      alertMessage = alertMessage.replace(/\s+within\s+0\s+days?/gi, ' immediately');
                      alertMessage = alertMessage.replace(/\s+within\s+0\.0\s+days?/gi, ' immediately');
                      alertMessage = alertMessage.replace(/\s*\.\s*0\s+days?\s*$/i, '');
                      
                      return (
                        <div key={idx} style={{ fontSize: '13px', color: '#374151', padding: '0.5rem', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>
                          • {alertMessage}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Alerts likely to trigger */}
              {riskShiftAnalysis.alertsToTrigger.length > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444', marginBottom: '0.75rem' }}>
                    {locale === 'th' ? 'การแจ้งเตือนที่อาจเกิดขึ้น' : 'Alerts Likely to Trigger'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {riskShiftAnalysis.alertsToTrigger.map((alert, idx) => (
                      <div key={idx} style={{ fontSize: '13px', color: '#374151', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px' }}>
                        • {alert.name}: {alert.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Net revenue improvement */}
              <div style={{
                padding: '1rem',
                backgroundColor: riskShiftAnalysis.netRevenueImprovement >= 0 ? '#f0fdf4' : '#fef2f2',
                borderRadius: '6px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                  {locale === 'th' ? 'การปรับปรุงรายได้สุทธิโดยประมาณ' : 'Estimated Net Revenue Improvement'}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: riskShiftAnalysis.netRevenueImprovement >= 0 ? '#10b981' : '#ef4444' }}>
                  {riskShiftAnalysis.netRevenueImprovement >= 0 ? '+' : ''}฿{formatCurrency(riskShiftAnalysis.netRevenueImprovement)}/mo
                </div>
                {staffingChange < 0 && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                    {locale === 'th'
                      ? `ลดพนักงาน ${Math.abs(staffingChange)} คน ปรับปรุงระยะเวลาวิ่งเงินสดประมาณ ${Math.abs(staffingChange) * 7} วัน`
                      : `Reducing ${Math.abs(staffingChange)} staff member(s) improves runway by approximately ${Math.abs(staffingChange) * 7} days`}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {/* SECTION 4: Save Simulation */}
        {hasChanges && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={resetSimulation}
              style={{
                padding: '0.625rem 1.25rem',
                backgroundColor: '#ffffff',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {locale === 'th' ? 'รีเซ็ต' : 'Reset'}
            </button>
            <button
              onClick={handleSaveSimulation}
              style={{
                padding: '0.625rem 1.25rem',
                backgroundColor: '#0a0a0a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {locale === 'th' ? 'บันทึกเป็นสถานการณ์การวางแผน' : 'Save as Planning Scenario'}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
