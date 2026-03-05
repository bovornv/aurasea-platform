// Café Operational Data Entry Page
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

const DAYS_OF_WEEK = [
  { value: 'monday', label: { en: 'Monday', th: 'จันทร์' } },
  { value: 'tuesday', label: { en: 'Tuesday', th: 'อังคาร' } },
  { value: 'wednesday', label: { en: 'Wednesday', th: 'พุธ' } },
  { value: 'thursday', label: { en: 'Thursday', th: 'พฤหัสบดี' } },
  { value: 'friday', label: { en: 'Friday', th: 'ศุกร์' } },
  { value: 'saturday', label: { en: 'Saturday', th: 'เสาร์' } },
  { value: 'sunday', label: { en: 'Sunday', th: 'อาทิตย์' } },
];

export default function CafeOperationalDataPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch, isAllBranches } = useCurrentBranch();
  const { setAlerts } = useAlertStore();
  const { testMode } = useTestMode();

  const capabilities = getBusinessCapabilities(setup);
  const cafeOverviewUrl = paths.branchOverview ? `${paths.branchOverview}?tab=cafe` : '/branch/overview?tab=cafe';
  const [shouldRender, setShouldRender] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    cashBalance: '',
    revenue7Days: '',
    revenue30Days: '',
    costs7Days: '',
    costs30Days: '',
    avgCustomersPerDay: '',
    operatingDaysPerWeek: '',
    peakDays: [] as string[],
    staffCount: '',
    avgStaffPerShift: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!capabilities.hasFnb) {
      router.replace(cafeOverviewUrl);
      setShouldRender(false);
    } else {
      setShouldRender(true);
    }
  }, [capabilities.hasFnb, router, cafeOverviewUrl]);

  useEffect(() => {
    const branchId = isAllBranches ? null : branch?.id;
    const businessGroup = businessGroupService.getBusinessGroup();
    const latestSignal = operationalSignalsService.getLatestSignal(branchId, businessGroup?.id);
    
    if (latestSignal) {
      // Calculate avgCustomersPerDay from customerVolume if available
      const avgCustomers = latestSignal.customerVolume 
        ? Math.round(latestSignal.customerVolume / 7) 
        : '';
      
      setFormData({
        cashBalance: formatNumberWithCommas(latestSignal.cashBalance),
        revenue7Days: formatNumberWithCommas(latestSignal.revenue7Days),
        revenue30Days: formatNumberWithCommas(latestSignal.revenue30Days),
        costs7Days: formatNumberWithCommas(latestSignal.costs7Days),
        costs30Days: formatNumberWithCommas(latestSignal.costs30Days),
        avgCustomersPerDay: avgCustomers.toString(),
        operatingDaysPerWeek: '7', // Default to 7 days
        peakDays: [], // No default peak days
        staffCount: latestSignal.staffCount.toString(),
        avgStaffPerShift: '', // No default
      });
    }
  }, [branch?.id, isAllBranches]);

  if (shouldRender === false) return null;
  if (shouldRender === null) return <PageLayout title="">Loading…</PageLayout>;

  // Parse number from formatted string (remove commas, round to whole number)
  const parseFormattedNumber = (value: string): number | null => {
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    const rounded = Math.round(parsed);
    return rounded < 0 ? 0 : rounded;
  };

  const handlePeakDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      peakDays: prev.peakDays.includes(day)
        ? prev.peakDays.filter(d => d !== day)
        : [...prev.peakDays, day],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse formatted numbers
    const cashBalance = parseFormattedNumber(formData.cashBalance);
    const revenue7Days = parseFormattedNumber(formData.revenue7Days);
    const revenue30Days = parseFormattedNumber(formData.revenue30Days);
    const costs7Days = parseFormattedNumber(formData.costs7Days);
    const costs30Days = parseFormattedNumber(formData.costs30Days);
    const avgCustomersPerDay = parseFormattedNumber(formData.avgCustomersPerDay);
    const operatingDaysPerWeek = parseFormattedNumber(formData.operatingDaysPerWeek);
    const staffCount = parseFormattedNumber(formData.staffCount);
    const avgStaffPerShift = parseFormattedNumber(formData.avgStaffPerShift);
    
    // Calculate customerVolume from avgCustomersPerDay * 7
    const customerVolume = avgCustomersPerDay ? avgCustomersPerDay * 7 : undefined;
    
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
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setSuccess(false);
      setErrors({});
      
      // Save operational signal - Café data only (no occupancy rate)
      operationalSignalsService.saveSignal({
        cashBalance: cashBalance!,
        revenue7Days: revenue7Days!,
        revenue30Days: revenue30Days!,
        costs7Days: costs7Days || revenue7Days! * 0.6,
        costs30Days: costs30Days || revenue30Days! * 0.6,
        staffCount: staffCount || 0,
        customerVolume: customerVolume || undefined,
        // Explicitly no occupancyRate for café
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
        router.push(cafeOverviewUrl);
      }, 2000);
    } catch (err) {
      console.error('Failed to save café data:', err);
      setErrors({ submit: t('dataEntry.errors.saveFailed') });
      setSuccess(false);
    } finally {
      setSaving(false);
    }
  };

  const displaySubtitle = isAllBranches
    ? (locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงานสำหรับคาเฟ่ / ร้านอาหาร' : 'Update operational data for café / restaurant')
    : branch
    ? `${branch.branchName} • ${locale === 'th' ? 'อัปเดตข้อมูลคาเฟ่' : 'Update café data'}`
    : (locale === 'th' ? 'อัปเดตข้อมูลคาเฟ่' : 'Update café data');

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
                  ? `กำลังบันทึกข้อมูลคาเฟ่สำหรับสาขา: ${branch.branchName}`
                  : `Recording café data for branch: ${branch.branchName}`}
              </p>
            </div>
          </div>
        )}

        {/* Page Purpose Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงาน' : 'Update Operational Data'}
          </h2>
          <p style={{ fontSize: '15px', color: '#374151', marginBottom: '0.75rem', lineHeight: '1.6' }}>
            {locale === 'th'
              ? 'คุณอัปเดตข้อมูลเป็นครั้งคราว — ระบบตรวจสอบความเสี่ยงอย่างต่อเนื่อง'
              : 'You update data occasionally — the system monitors risks continuously'}
          </p>
        </div>

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
            {/* SECTION 1: Revenue Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '1. สัญญาณรายได้' : '1. Revenue Signals'}
              </h3>
              
              {/* Revenue 7 Days */}
              <div style={{ marginBottom: '1rem' }}>
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
              <div style={{ marginBottom: '1rem' }}>
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
            </div>

            {/* SECTION 2: Cost Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '2. สัญญาณต้นทุน' : '2. Cost Signals'}
              </h3>
              
              {/* Costs 7 Days */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ต้นทุน 7 วันล่าสุด' : 'Costs (Last 7 Days)'} *
                </label>
                <input
                  type="text"
                  value={formData.costs7Days}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, costs7Days: value });
                    if (errors.costs7Days) {
                      setErrors({ ...errors, costs7Days: '' });
                    }
                  }}
                  placeholder={locale === 'th' ? 'เช่น 51,000' : 'e.g., 51,000'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid ${errors.costs7Days ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
                {errors.costs7Days && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                    {errors.costs7Days}
                  </p>
                )}
              </div>

              {/* Costs 30 Days */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ต้นทุน 30 วันล่าสุด' : 'Costs (Last 30 Days)'} *
                </label>
                <input
                  type="text"
                  value={formData.costs30Days}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, costs30Days: value });
                    if (errors.costs30Days) {
                      setErrors({ ...errors, costs30Days: '' });
                    }
                  }}
                  placeholder={locale === 'th' ? 'เช่น 210,000' : 'e.g., 210,000'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid ${errors.costs30Days ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
                {errors.costs30Days && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                    {errors.costs30Days}
                  </p>
                )}
              </div>
            </div>

            {/* SECTION 3: Demand & Capacity */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '3. ความต้องการและความจุ' : '3. Demand & Capacity'}
              </h3>
              
              {/* Average Customers Per Day */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ลูกค้าเฉลี่ยต่อวัน' : 'Average Customers Per Day'}
                </label>
                <input
                  type="text"
                  value={formData.avgCustomersPerDay}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, avgCustomersPerDay: value });
                  }}
                  placeholder={locale === 'th' ? 'เช่น 250' : 'e.g., 250'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              {/* Operating Days Per Week */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'วันเปิดทำการต่อสัปดาห์' : 'Operating Days Per Week'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={formData.operatingDaysPerWeek}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    const num = parseInt(value) || '';
                    setFormData({ ...formData, operatingDaysPerWeek: num.toString() });
                  }}
                  placeholder={locale === 'th' ? 'เช่น 7' : 'e.g., 7'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              {/* Peak Days */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'วันที่มีลูกค้ามากที่สุด' : 'Peak Days'}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => handlePeakDayToggle(day.value)}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: `1px solid ${formData.peakDays.includes(day.value) ? '#3b82f6' : '#d1d5db'}`,
                        backgroundColor: formData.peakDays.includes(day.value) ? '#eff6ff' : '#ffffff',
                        color: formData.peakDays.includes(day.value) ? '#1e40af' : '#374151',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {day.label[locale]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SECTION 4: Staffing */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '4. บุคลากร' : '4. Staffing'}
              </h3>
              
              {/* Staff Count */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'จำนวนพนักงานทั้งหมด' : 'Total Staff Count'}
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

              {/* Average Staff Per Shift */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'พนักงานเฉลี่ยต่อกะ' : 'Average Staff Per Shift'}
                </label>
                <input
                  type="text"
                  value={formData.avgStaffPerShift}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setFormData({ ...formData, avgStaffPerShift: value });
                  }}
                  placeholder={locale === 'th' ? 'เช่น 4' : 'e.g., 4'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

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
                  : (locale === 'th' ? 'บันทึกและอัปเดตการตรวจสอบ' : 'Save & Update Monitoring')}
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
