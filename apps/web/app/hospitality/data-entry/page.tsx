// Data Entry Page - For ongoing operational signals
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { Button } from '../../components/button';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useBusinessSetup } from '../../contexts/business-setup-context';
import { useAlertStore } from '../../contexts/alert-store-context';
import { useTestMode } from '../../providers/test-mode-provider';
import { useOrganization } from '../../contexts/organization-context';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { monitoringService } from '../../services/monitoring-service';
import { businessGroupService } from '../../services/business-group-service';
import { ModuleType } from '../../models/business-group';

// Format number with commas for display (rounded, no decimals)
function formatNumberWithCommas(value: number | null): string {
  if (value === null || value === undefined) return '';
  return Math.round(value).toLocaleString('en-US');
}

export default function DataEntryPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch, isAllBranches } = useCurrentBranch();
  const { setAlerts } = useAlertStore();
  const { testMode } = useTestMode();
  const { activeOrganizationId } = useOrganization();
  
  // Initialize form data - will be populated in useEffect to avoid SSR issues
  const [formData, setFormData] = useState({
    cashBalance: '',
    revenue7Days: '',
    revenue30Days: '',
    costs7Days: '',
    costs30Days: '',
    staffCount: '',
    occupancyRate: '',
    customerVolume: '',
  });
  
  // ALL useState hooks must be declared before useEffect hooks
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Load latest signal in useEffect to avoid SSR issues
  useEffect(() => {
    // Get latest signal for current branch to pre-fill form
    // If "All Branches" view, get latest signal from any branch (for convenience)
    // Otherwise, get latest signal from selected branch
    const branchId = isAllBranches ? null : branch?.id;
    // Use active organization ID if available, otherwise fallback to businessGroup
    const groupId = activeOrganizationId || businessGroupService.getBusinessGroup()?.id;
    if (!groupId) return;
    const latestSignal = operationalSignalsService.getLatestSignal(branchId, groupId);
    
    if (latestSignal) {
      setFormData({
        cashBalance: formatNumberWithCommas(latestSignal.cashBalance),
        revenue7Days: formatNumberWithCommas(latestSignal.revenue7Days),
        revenue30Days: formatNumberWithCommas(latestSignal.revenue30Days),
        costs7Days: formatNumberWithCommas(latestSignal.costs7Days),
        costs30Days: formatNumberWithCommas(latestSignal.costs30Days),
        staffCount: latestSignal.staffCount.toString(),
        occupancyRate: latestSignal.occupancyRate !== undefined ? (latestSignal.occupancyRate * 100).toString() : '',
        customerVolume: latestSignal.customerVolume !== undefined ? formatNumberWithCommas(latestSignal.customerVolume) : '',
      });
    }
  }, [branch?.id, isAllBranches, activeOrganizationId]);

  // Parse number from formatted string (remove commas, round to whole number)
  const parseFormattedNumber = (value: string): number | null => {
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    // Round to whole number and ensure non-negative
    const rounded = Math.round(parsed);
    return rounded < 0 ? 0 : rounded;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse formatted numbers
    const cashBalance = parseFormattedNumber(formData.cashBalance);
    const revenue7Days = parseFormattedNumber(formData.revenue7Days);
    const revenue30Days = parseFormattedNumber(formData.revenue30Days);
    const costs7Days = parseFormattedNumber(formData.costs7Days);
    const costs30Days = parseFormattedNumber(formData.costs30Days);
    const staffCount = parseFormattedNumber(formData.staffCount);
    const occupancyRate = parseFormattedNumber(formData.occupancyRate);
    const customerVolume = parseFormattedNumber(formData.customerVolume);
    
    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (cashBalance === null || cashBalance < 0) {
      newErrors.cashBalance = t('dataEntry.errors.required');
    }
    if (revenue7Days === null || revenue7Days < 0) {
      newErrors.revenue7Days = t('dataEntry.errors.required');
    }
    if (revenue30Days === null || revenue30Days < 0) {
      newErrors.revenue30Days = t('dataEntry.errors.required');
    }
    if (costs7Days === null || costs7Days < 0) {
      newErrors.costs7Days = t('dataEntry.errors.required');
    }
    if (costs30Days === null || costs30Days < 0) {
      newErrors.costs30Days = t('dataEntry.errors.required');
    }
    
    // Validate logical constraints
    if (revenue30Days !== null && revenue7Days !== null && revenue30Days < revenue7Days) {
      newErrors.revenue30Days = locale === 'th' 
        ? 'รายได้ 30 วันควรมากกว่าหรือเท่ากับรายได้ 7 วัน'
        : '30-day revenue should be greater than or equal to 7-day revenue';
    }
    if (costs30Days !== null && costs7Days !== null && costs30Days < costs7Days) {
      newErrors.costs30Days = locale === 'th'
        ? 'ค่าใช้จ่าย 30 วันควรมากกว่าหรือเท่ากับค่าใช้จ่าย 7 วัน'
        : '30-day costs should be greater than or equal to 7-day costs';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setSuccess(false);
      setErrors({});
      
      // Save operational signal FIRST - this persists user-entered data
      operationalSignalsService.saveSignal({
        cashBalance: cashBalance!,
        revenue7Days: revenue7Days!,
        revenue30Days: revenue30Days!,
        costs7Days: costs7Days!,
        costs30Days: costs30Days!,
        staffCount: staffCount || 0,
        occupancyRate: occupancyRate ? parseFloat(occupancyRate.toString()) / 100 : undefined, // Convert percentage to decimal
        customerVolume: customerVolume || undefined,
      });

      // Verify the signal was saved
      const groupId = activeOrganizationId || businessGroupService.getBusinessGroup()?.id;
      const branchId = isAllBranches ? null : branch?.id;
      const savedSignal = operationalSignalsService.getLatestSignal(branchId, groupId);
      if (!savedSignal || savedSignal.cashBalance !== cashBalance!) {
        throw new Error('Failed to persist operational signal');
      }

      // Trigger monitoring evaluation with the saved signal
      // This will use the signal we just saved, not recalculate from hospitalityData
      // Pass testMode for global TEST_MODE support
      const { alerts, status } = await monitoringService.evaluate(setup.isCompleted ? setup : null, {
        businessType: testMode.businessType,
        scenario: testMode.scenario,
        version: testMode.version,
      });

      // Update alert store with new alerts
      setAlerts(alerts);
      
      // Reset reminder state since data was just updated
      monitoringService.resetReminderState();

      // Verify monitoring status was updated
      const updatedStatus = monitoringService.getStatus();
      if (!updatedStatus.isActive || !updatedStatus.lastEvaluated) {
        console.warn('Monitoring status may not have updated correctly');
      }

      // Show success message
      setSuccess(true);
      
      // Redirect to dashboard after short delay
      setTimeout(() => {
        router.push(paths.branchOverview || '/branch/overview');
      }, 2000);
    } catch (err) {
      console.error('Failed to save data:', err);
      setErrors({ submit: t('dataEntry.errors.saveFailed') });
      setSuccess(false);
    } finally {
      setSaving(false);
    }
  };

  // Check modules from branch (module-based architecture)
  const hasAccommodation = branch?.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
  const hasFnb = branch?.modules?.includes(ModuleType.FNB) ?? false;
  
  // Fallback to setup businessType for backward compatibility during initial setup
  const isHotelOrResort = hasAccommodation || (setup?.businessType === 'hotel_resort' || setup?.businessType === 'hotel_with_cafe');
  const isCafeOrRestaurant = hasFnb || (setup?.businessType === 'cafe_restaurant' || setup?.businessType === 'hotel_with_cafe');

  const displaySubtitle = isAllBranches
    ? t('dataEntry.subtitle')
    : branch
    ? `${branch.branchName} • ${t('dataEntry.subtitle')}`
    : t('dataEntry.subtitle');

  return (
    <PageLayout 
      title={t('dataEntry.title')} 
      subtitle={displaySubtitle}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Branch Context Banner */}
        {!isAllBranches && branch && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            backgroundColor: '#f9fafb',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#374151', margin: 0 }}>
                {locale === 'th' 
                  ? `กำลังบันทึกข้อมูลสำหรับสาขา: ${branch.branchName}`
                  : `Recording data for branch: ${branch.branchName}`}
              </p>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                {locale === 'th'
                  ? 'ข้อมูลจะถูกบันทึกและเชื่อมโยงกับสาขานี้โดยอัตโนมัติ'
                  : 'Data will be automatically saved and linked to this branch'}
              </p>
            </div>
          </div>
        )}

        {/* Page Purpose Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
            {t('dataEntry.purposeTitle')}
          </h2>
          <p style={{ fontSize: '15px', color: '#374151', marginBottom: '0.75rem', lineHeight: '1.6' }}>
            {t('dataEntry.purposeSubtitle')}
          </p>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '1rem', lineHeight: '1.5', fontStyle: 'italic' }}>
            {t('dataEntry.purposeHelper')}
          </p>
          
          {/* Update Frequency Guidance */}
          <div style={{
            border: '1px solid #dbeafe',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#eff6ff',
            marginTop: '1rem',
          }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1e40af', marginBottom: '0.5rem', marginTop: 0 }}>
              {locale === 'th' ? 'ความถี่ในการอัปเดต' : 'Update Frequency'}
            </h4>
            <p style={{ fontSize: '13px', color: '#1e3a8a', marginBottom: '0.75rem', lineHeight: '1.6' }}>
              {locale === 'th'
                ? 'แนะนำ: อัปเดตทุกสัปดาห์ (ขั้นต่ำที่แนะนำ)'
                : 'Recommended: Weekly updates (recommended minimum)'}
            </p>
            <p style={{ fontSize: '13px', color: '#1e3a8a', marginBottom: '0.5rem', fontWeight: 500 }}>
              {locale === 'th' ? 'อัปเดตทันทีเมื่อเงื่อนไขเปลี่ยนแปลงอย่างมีนัยสำคัญ:' : 'Update anytime conditions materially change:'}
            </p>
            <ul style={{ fontSize: '13px', color: '#1e3a8a', margin: 0, paddingLeft: '1.25rem', lineHeight: '1.8' }}>
              <li>{locale === 'th' ? 'การจองลดลงอย่างกะทันหัน' : 'Sudden drop in bookings'}</li>
              <li>{locale === 'th' ? 'การเปลี่ยนแปลงบุคลากร' : 'Staffing changes'}</li>
              <li>{locale === 'th' ? 'ค่าใช้จ่ายที่ไม่คาดคิด' : 'Unexpected expenses'}</li>
              <li>{locale === 'th' ? 'การเปลี่ยนแปลงราคา' : 'Price changes'}</li>
            </ul>
            <p style={{ fontSize: '12px', color: '#3b82f6', marginTop: '0.75rem', marginBottom: 0, fontStyle: 'italic' }}>
              {locale === 'th'
                ? 'การอัปเดตบ่อยขึ้นจะปรับปรุงความแม่นยำของการแจ้งเตือนและความเชื่อมั่น'
                : 'Updating more frequently improves alert accuracy and confidence'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* SECTION A: Cash Position */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
              {t('dataEntry.sectionCash')}
            </h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="cashBalance"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.cashBalance')} *
              </label>
              <input
                id="cashBalance"
                type="text"
                inputMode="numeric"
                value={formData.cashBalance}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                  const parsed = parseFormattedNumber(cleaned);
                  const rounded = parsed !== null ? Math.round(parsed) : null;
                  const formatted = rounded !== null ? formatNumberWithCommas(rounded) : cleaned.replace(/,/g, '');
                  setFormData({ ...formData, cashBalance: formatted });
                  setErrors({ ...errors, cashBalance: '' });
                }}
                required
                aria-required="true"
                aria-invalid={errors.cashBalance ? 'true' : 'false'}
                aria-describedby={errors.cashBalance ? 'cashBalance-error' : 'cashBalance-help'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.cashBalance ? '1px solid #dc2626' : '1px solid #d1d5db',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.cashBalancePlaceholder')}
              />
              {errors.cashBalance && (
                <p id="cashBalance-error" role="alert" style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.cashBalance}</p>
              )}
              <p id="cashBalance-help" style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', lineHeight: '1.5' }}>
                {t('dataEntry.cashBalanceHelp')}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: '#e5e7eb', marginBottom: '2.5rem' }} />

          {/* SECTION B: Revenue Signals */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
              {t('dataEntry.sectionRevenue')}
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1.5rem' }}>
              {t('dataEntry.revenueSignalsNote')}
            </p>

            {/* Revenue - 7 Days */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="revenue7Days"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.revenue7Days')} *
              </label>
              <input
                id="revenue7Days"
                type="text"
                inputMode="numeric"
                value={formData.revenue7Days}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                  const parsed = parseFormattedNumber(cleaned);
                  const rounded = parsed !== null ? Math.round(parsed) : null;
                  const formatted = rounded !== null ? formatNumberWithCommas(rounded) : cleaned.replace(/,/g, '');
                  setFormData({ ...formData, revenue7Days: formatted });
                  setErrors({ ...errors, revenue7Days: '' });
                }}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.revenue7Days ? '1px solid #dc2626' : '1px solid #d1d5db',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.revenue7DaysPlaceholder')}
              />
              {errors.revenue7Days && (
                <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.revenue7Days}</p>
              )}
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', lineHeight: '1.5' }}>
                {t('dataEntry.revenue7DaysHelp')}
              </p>
            </div>

            {/* Revenue - 30 Days */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="revenue30Days"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.revenue30Days')} *
              </label>
              <input
                id="revenue30Days"
                type="text"
                inputMode="numeric"
                value={formData.revenue30Days}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                  const parsed = parseFormattedNumber(cleaned);
                  const rounded = parsed !== null ? Math.round(parsed) : null;
                  const formatted = rounded !== null ? formatNumberWithCommas(rounded) : cleaned.replace(/,/g, '');
                  setFormData({ ...formData, revenue30Days: formatted });
                  setErrors({ ...errors, revenue30Days: '' });
                }}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.revenue30Days ? '1px solid #dc2626' : '1px solid #d1d5db',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.revenue30DaysPlaceholder')}
              />
              {errors.revenue30Days && (
                <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.revenue30Days}</p>
              )}
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', lineHeight: '1.5' }}>
                {t('dataEntry.revenue30DaysHelp')}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: '#e5e7eb', marginBottom: '2.5rem' }} />

          {/* SECTION C: Cost & Capacity Signals */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
              {t('dataEntry.sectionCosts')}
            </h3>

            {/* Costs - 7 Days */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="costs7Days"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.costs7Days')} *
              </label>
              <input
                id="costs7Days"
                type="text"
                inputMode="numeric"
                value={formData.costs7Days}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                  const parsed = parseFormattedNumber(cleaned);
                  const rounded = parsed !== null ? Math.round(parsed) : null;
                  const formatted = rounded !== null ? formatNumberWithCommas(rounded) : cleaned.replace(/,/g, '');
                  setFormData({ ...formData, costs7Days: formatted });
                  setErrors({ ...errors, costs7Days: '' });
                }}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.costs7Days ? '1px solid #dc2626' : '1px solid #d1d5db',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.costs7DaysPlaceholder')}
              />
              {errors.costs7Days && (
                <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.costs7Days}</p>
              )}
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', lineHeight: '1.5' }}>
                {t('dataEntry.costs7DaysHelp')}
              </p>
            </div>

            {/* Costs - 30 Days */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="costs30Days"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.costs30Days')} *
              </label>
              <input
                id="costs30Days"
                type="text"
                inputMode="numeric"
                value={formData.costs30Days}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                  const parsed = parseFormattedNumber(cleaned);
                  const rounded = parsed !== null ? Math.round(parsed) : null;
                  const formatted = rounded !== null ? formatNumberWithCommas(rounded) : cleaned.replace(/,/g, '');
                  setFormData({ ...formData, costs30Days: formatted });
                  setErrors({ ...errors, costs30Days: '' });
                }}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: errors.costs30Days ? '1px solid #dc2626' : '1px solid #d1d5db',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.costs30DaysPlaceholder')}
              />
              {errors.costs30Days && (
                <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.costs30Days}</p>
              )}
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', lineHeight: '1.5' }}>
                {t('dataEntry.costs30DaysHelp')}
              </p>
            </div>

            {/* Staff Count */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="staffCount"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.staffCount')}
              </label>
              <input
                id="staffCount"
                type="text"
                inputMode="numeric"
                value={formData.staffCount}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                  const parsed = cleaned ? Math.round(parseFloat(cleaned)) : '';
                  setFormData({ ...formData, staffCount: parsed.toString() });
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#0a0a0a',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.staffCountPlaceholder')}
              />
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '0.5rem', lineHeight: '1.5' }}>
                {t('dataEntry.staffCountHelp')}
              </p>
            </div>
          </div>

          {/* Occupancy Rate (Hotels/Resorts) */}
          {isHotelOrResort && (
            <div style={{ marginBottom: '2rem' }}>
              <label
                htmlFor="occupancyRate"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.occupancyRate')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="occupancyRate"
                  type="text"
                  inputMode="decimal"
                  value={formData.occupancyRate}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                // Round to whole number for percentage
                const parsed = cleaned ? Math.round(parseFloat(cleaned)) : '';
                setFormData({ ...formData, occupancyRate: parsed.toString() });
              }}
                  style={{
                    flex: 1,
                    padding: '0.625rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '15px',
                    color: '#374151',
                    backgroundColor: '#ffffff',
                  }}
                  placeholder={t('dataEntry.occupancyRatePlaceholder')}
                />
                <span style={{ fontSize: '15px', color: '#6b7280' }}>%</span>
              </div>
              <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '0.5rem' }}>
                {t('dataEntry.occupancyRateHelp')}
              </p>
            </div>
          )}

          {/* Customer Volume (Cafes/Restaurants) */}
          {isCafeOrRestaurant && (
            <div style={{ marginBottom: '2rem' }}>
              <label
                htmlFor="customerVolume"
                style={{
                  display: 'block',
                  fontSize: '15px',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                  color: '#374151',
                }}
              >
                {t('dataEntry.customerVolume')}
              </label>
              <input
                id="customerVolume"
                type="text"
                inputMode="numeric"
                value={formData.customerVolume}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                const parsed = parseFormattedNumber(cleaned);
                const rounded = parsed !== null ? Math.round(parsed) : null;
                const formatted = rounded !== null ? formatNumberWithCommas(rounded) : cleaned.replace(/,/g, '');
                setFormData({ ...formData, customerVolume: formatted });
              }}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '15px',
                  color: '#374151',
                  backgroundColor: '#ffffff',
                }}
                placeholder={t('dataEntry.customerVolumePlaceholder')}
              />
              <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '0.5rem' }}>
                {t('dataEntry.customerVolumeHelp')}
              </p>
            </div>
          )}

          {success && (
            <div style={{ 
              padding: '1.75rem', 
              borderRadius: '12px', 
              backgroundColor: '#f0fdf4', 
              border: '1px solid #bbf7d0',
              marginBottom: '2rem',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', letterSpacing: '-0.01em' }}>
                {t('dataEntry.successTitle')}
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                <li style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', display: 'flex', gap: '0.75rem' }}>
                  <span style={{ color: '#16a34a' }}>•</span>
                  <span>{t('dataEntry.successBullet1')}</span>
                </li>
                <li style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', display: 'flex', gap: '0.75rem' }}>
                  <span style={{ color: '#16a34a' }}>•</span>
                  <span>{t('dataEntry.successBullet2')}</span>
                </li>
                <li style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', display: 'flex', gap: '0.75rem' }}>
                  <span style={{ color: '#16a34a' }}>•</span>
                  <span>{t('dataEntry.successBullet3')}</span>
                </li>
              </ul>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, fontStyle: 'italic' }}>
                {t('dataEntry.successNote')}
              </p>
            </div>
          )}

          {errors.submit && (
            <div style={{ 
              padding: '0.75rem', 
              borderRadius: '8px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca',
              marginBottom: '1.5rem'
            }}>
              <p style={{ fontSize: '14px', color: '#dc2626', margin: 0 }}>{errors.submit}</p>
            </div>
          )}

          {/* Signal-level data badge */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            marginTop: '2rem',
            marginBottom: '1.5rem'
          }}>
            <span style={{
              fontSize: '12px',
              color: '#6b7280',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
            }}>
              {t('dataEntry.signalLevelBadge')}
            </span>
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
            <button
              type="button"
              onClick={() => router.push(paths.branchOverview || '/branch/overview')}
              aria-label={t('common.cancel')}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '15px',
                fontWeight: 500,
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = '2px solid #3b82f6';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = 'none';
              }}
            >
              {t('common.cancel')}
            </button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
            >
              {saving ? t('dataEntry.saving') : t('dataEntry.saveAndUpdateMonitoring')}
            </Button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
