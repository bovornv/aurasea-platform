// F&B Data Entry Page - For café/restaurant operational data
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
import { operationalSignalsService } from '../../services/operational-signals-service';
import { monitoringService } from '../../services/monitoring-service';
import { businessGroupService } from '../../services/business-group-service';
import { getBusinessCapabilities } from '../../services/business-capabilities-service';

// Format number with commas for display (rounded, no decimals)
function formatNumberWithCommas(value: number | null): string {
  if (value === null || value === undefined) return '';
  return Math.round(value).toLocaleString('en-US');
}

export default function FnbDataEntryPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch, isAllBranches } = useCurrentBranch();
  const { setAlerts } = useAlertStore();
  const { testMode } = useTestMode();

  const capabilities = getBusinessCapabilities(setup);
  if (!capabilities.hasFnb) {
    const updateUrl = paths.orgId && branch?.id ? `/org/${paths.orgId}/branch/${branch.id}/metrics` : (paths.branchOverview || '/branch/update');
    router.replace(updateUrl);
    return null;
  }
  
  // Initialize form data - F&B-specific fields only
  const [formData, setFormData] = useState({
    cashBalance: '',
    revenue7Days: '',
    revenue30Days: '',
    costs7Days: '',
    costs30Days: '',
    staffCount: '',
    customerVolume: '',
    weekdayRevenue: '',
    weekendRevenue: '',
    topMenuItem1: '',
    topMenuItem1Revenue: '',
    topMenuItem2: '',
    topMenuItem2Revenue: '',
  });
  
  // Load latest signal in useEffect to avoid SSR issues
  useEffect(() => {
    const branchId = isAllBranches ? null : branch?.id;
    const businessGroup = businessGroupService.getBusinessGroup();
    const latestSignal = operationalSignalsService.getLatestSignal(branchId, businessGroup?.id);
    
    if (latestSignal) {
      setFormData({
        cashBalance: formatNumberWithCommas(latestSignal.cashBalance),
        revenue7Days: formatNumberWithCommas(latestSignal.revenue7Days),
        revenue30Days: formatNumberWithCommas(latestSignal.revenue30Days),
        costs7Days: formatNumberWithCommas(latestSignal.costs7Days),
        costs30Days: formatNumberWithCommas(latestSignal.costs30Days),
        staffCount: latestSignal.staffCount.toString(),
        customerVolume: latestSignal.customerVolume !== undefined ? formatNumberWithCommas(latestSignal.customerVolume) : '',
        weekdayRevenue: '',
        weekendRevenue: '',
        topMenuItem1: '',
        topMenuItem1Revenue: '',
        topMenuItem2: '',
        topMenuItem2Revenue: '',
      });
    }
  }, [branch?.id, isAllBranches]);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Parse number from formatted string
  const parseFormattedNumber = (value: string): number | null => {
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
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
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setSuccess(false);
      setErrors({});
      
      // Save operational signal - F&B data only (no occupancy rate)
      operationalSignalsService.saveSignal({
        cashBalance: cashBalance!,
        revenue7Days: revenue7Days!,
        revenue30Days: revenue30Days!,
        costs7Days: costs7Days || revenue7Days! * 0.6,
        costs30Days: costs30Days || revenue30Days! * 0.6,
        staffCount: staffCount || 0,
        customerVolume: customerVolume || undefined,
        // Explicitly no occupancyRate for F&B
        occupancyRate: undefined,
      });

      // Trigger monitoring evaluation
      const { alerts, status } = await monitoringService.evaluate(setup.isCompleted ? setup : null, {
        businessType: testMode.businessType,
        scenario: testMode.scenario,
        version: testMode.version,
      });

      setAlerts(alerts);
      monitoringService.resetReminderState();

      setSuccess(true);
      
      setTimeout(() => {
        router.push(paths.branchOverview ? `${paths.branchOverview}?tab=cafe` : '/branch/overview?tab=cafe');
      }, 2000);
    } catch (err) {
      console.error('Failed to save F&B data:', err);
      setErrors({ submit: t('dataEntry.errors.saveFailed') });
      setSuccess(false);
    } finally {
      setSaving(false);
    }
  };

  const displaySubtitle = isAllBranches
    ? (locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงานสำหรับคาเฟ่ / ร้านอาหาร' : 'Update operational data for café / restaurant')
    : branch
    ? `${branch.branchName} • ${locale === 'th' ? 'อัปเดตข้อมูล F&B' : 'Update F&B data'}`
    : (locale === 'th' ? 'อัปเดตข้อมูล F&B' : 'Update F&B data');

  return (
    <PageLayout 
      title={locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงาน → คาเฟ่ / ร้านอาหาร' : 'Update Operational Data → Café / Restaurant'} 
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
                  ? `กำลังบันทึกข้อมูล F&B สำหรับสาขา: ${branch.branchName}`
                  : `Recording F&B data for branch: ${branch.branchName}`}
              </p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div style={{
            border: '1px solid #10b981',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#f0fdf4',
            marginBottom: '2rem',
            color: '#166534',
          }}>
            {locale === 'th' 
              ? 'บันทึกข้อมูลสำเร็จ! กำลังนำคุณไปยังภาพรวม...'
              : 'Data saved successfully! Redirecting to overview...'}
          </div>
        )}

        {/* Error Message */}
        {errors.submit && (
          <div style={{
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#fef2f2',
            marginBottom: '2rem',
            color: '#991b1b',
          }}>
            {errors.submit}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Cash Balance */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'ยอดเงินสดคงเหลือ' : 'Current Cash Balance'} *
              </label>
              <input
                type="text"
                value={formData.cashBalance}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9,]/g, '');
                  setFormData({ ...formData, cashBalance: value });
                  if (errors.cashBalance) {
                    setErrors({ ...errors, cashBalance: '' });
                  }
                }}
                placeholder={locale === 'th' ? 'เช่น 500,000' : 'e.g., 500,000'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid ${errors.cashBalance ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              {errors.cashBalance && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                  {errors.cashBalance}
                </p>
              )}
            </div>

            {/* Revenue 7 Days */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'รายได้ 7 วันล่าสุด' : 'Revenue (Last 7 Days)'} *
              </label>
              <input
                type="text"
                value={formData.revenue7Days}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9,]/g, '');
                  setFormData({ ...formData, revenue7Days: value });
                  if (errors.revenue7Days) {
                    setErrors({ ...errors, revenue7Days: '' });
                  }
                }}
                placeholder={locale === 'th' ? 'เช่น 85,000' : 'e.g., 85,000'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid ${errors.revenue7Days ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              {errors.revenue7Days && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                  {errors.revenue7Days}
                </p>
              )}
            </div>

            {/* Revenue 30 Days */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'รายได้ 30 วันล่าสุด' : 'Revenue (Last 30 Days)'} *
              </label>
              <input
                type="text"
                value={formData.revenue30Days}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9,]/g, '');
                  setFormData({ ...formData, revenue30Days: value });
                  if (errors.revenue30Days) {
                    setErrors({ ...errors, revenue30Days: '' });
                  }
                }}
                placeholder={locale === 'th' ? 'เช่น 350,000' : 'e.g., 350,000'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid ${errors.revenue30Days ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              {errors.revenue30Days && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                  {errors.revenue30Days}
                </p>
              )}
            </div>

            {/* Customer Volume */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'จำนวนลูกค้า (7 วันล่าสุด)' : 'Customer Volume (Last 7 Days)'}
              </label>
              <input
                type="text"
                value={formData.customerVolume}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9,]/g, '');
                  setFormData({ ...formData, customerVolume: value });
                }}
                placeholder={locale === 'th' ? 'เช่น 1,700' : 'e.g., 1,700'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            {/* Staff Count */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'จำนวนพนักงาน' : 'Staff Count'}
              </label>
              <input
                type="text"
                value={formData.staffCount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setFormData({ ...formData, staffCount: value });
                }}
                placeholder={locale === 'th' ? 'เช่น 8' : 'e.g., 8'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            {/* Costs (Optional - auto-calculated if not provided) */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'ต้นทุน 7 วัน (ไม่บังคับ - จะคำนวณอัตโนมัติ)' : 'Costs (7 Days) - Optional - Auto-calculated'}
              </label>
              <input
                type="text"
                value={formData.costs7Days}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9,]/g, '');
                  setFormData({ ...formData, costs7Days: value });
                }}
                placeholder={locale === 'th' ? 'เช่น 51,000' : 'e.g., 51,000'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <Button
                type="submit"
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '0.75rem 1.5rem',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {saving 
                  ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                  : (locale === 'th' ? 'บันทึกข้อมูล' : 'Save Data')}
              </Button>
              <Button
                type="button"
                onClick={() => router.back()}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                }}
              >
                {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
