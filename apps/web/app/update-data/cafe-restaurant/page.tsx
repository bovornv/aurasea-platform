// Café / Restaurant Operational Data Entry Page
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

export default function CafeRestaurantOperationalDataPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch, isAllBranches } = useCurrentBranch();
  const { setAlerts } = useAlertStore();
  const { testMode } = useTestMode();
  const cafeOverviewUrl = paths.branchOverview ? `${paths.branchOverview}?tab=cafe` : '/branch/overview?tab=cafe';

  const capabilities = getBusinessCapabilities(setup);
  const [shouldRender, setShouldRender] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    // Cash Position
    cashBalance: '',
    
    // Revenue Signals
    revenue7Days: '',
    revenue30Days: '',
    
    // Cost Signals
    costs7Days: '',
    costs30Days: '',
    
    // Utilization Signals (required for alerts)
    avgWeekdayRevenue14d: '',
    avgWeekendRevenue14d: '',
    
    // Demand Signals
    avgCustomersPerWeekday: '',
    avgCustomersPerWeekend: '',
    
    // Staffing
    staffCount: '',
    
    // Menu Mix (optional)
    menuMixTop3Percent: '',
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
      setFormData({
        cashBalance: formatNumberWithCommas(latestSignal.cashBalance),
        revenue7Days: formatNumberWithCommas(latestSignal.revenue7Days),
        revenue30Days: formatNumberWithCommas(latestSignal.revenue30Days),
        costs7Days: formatNumberWithCommas(latestSignal.costs7Days),
        costs30Days: formatNumberWithCommas(latestSignal.costs30Days),
        avgWeekdayRevenue14d: latestSignal.avgWeekdayRevenue14d !== undefined 
          ? formatNumberWithCommas(latestSignal.avgWeekdayRevenue14d) 
          : '',
        avgWeekendRevenue14d: latestSignal.avgWeekendRevenue14d !== undefined 
          ? formatNumberWithCommas(latestSignal.avgWeekendRevenue14d) 
          : '',
        avgCustomersPerWeekday: latestSignal.avgCustomersPerWeekday !== undefined 
          ? latestSignal.avgCustomersPerWeekday.toString() 
          : '',
        avgCustomersPerWeekend: latestSignal.avgCustomersPerWeekend !== undefined 
          ? latestSignal.avgCustomersPerWeekend.toString() 
          : '',
        staffCount: latestSignal.staffCount.toString(),
        menuMixTop3Percent: latestSignal.menuMixTop3Percent !== undefined 
          ? latestSignal.menuMixTop3Percent.toString() 
          : '',
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

  // Parse percentage (0-100)
  const parsePercentage = (value: string): number | null => {
    const cleaned = value.replace(/[^0-9.]/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    const clamped = Math.max(0, Math.min(100, parsed));
    return clamped;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse formatted numbers
    const cashBalance = parseFormattedNumber(formData.cashBalance);
    const revenue7Days = parseFormattedNumber(formData.revenue7Days);
    const revenue30Days = parseFormattedNumber(formData.revenue30Days);
    const costs7Days = parseFormattedNumber(formData.costs7Days);
    const costs30Days = parseFormattedNumber(formData.costs30Days);
    const avgWeekdayRevenue14d = parseFormattedNumber(formData.avgWeekdayRevenue14d);
    const avgWeekendRevenue14d = parseFormattedNumber(formData.avgWeekendRevenue14d);
    const avgCustomersPerWeekday = parseFormattedNumber(formData.avgCustomersPerWeekday);
    const avgCustomersPerWeekend = parseFormattedNumber(formData.avgCustomersPerWeekend);
    const staffCount = parseFormattedNumber(formData.staffCount);
    const menuMixTop3Percent = parsePercentage(formData.menuMixTop3Percent);
    
    // Calculate customerVolume for backward compatibility
    const avgCustomers = avgCustomersPerWeekday || avgCustomersPerWeekend;
    const customerVolume = avgCustomers ? Math.round((avgCustomersPerWeekday || 0) * 5 + (avgCustomersPerWeekend || 0) * 2) : undefined;
    
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
    // Utilization signals are required for café alerts
    if (avgWeekdayRevenue14d === null || avgWeekdayRevenue14d < 0) {
      newErrors.avgWeekdayRevenue14d = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    if (avgWeekendRevenue14d === null || avgWeekendRevenue14d < 0) {
      newErrors.avgWeekendRevenue14d = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setSuccess(false);
      setErrors({});
      
      // Save operational signal with café-specific fields
      operationalSignalsService.saveSignal({
        cashBalance: cashBalance!,
        revenue7Days: revenue7Days!,
        revenue30Days: revenue30Days!,
        costs7Days: costs7Days || revenue7Days! * 0.6,
        costs30Days: costs30Days || revenue30Days! * 0.6,
        staffCount: staffCount || 0,
        customerVolume: customerVolume || undefined,
        // Café-specific fields for F&B alerts
        avgWeekdayRevenue14d: avgWeekdayRevenue14d || undefined,
        avgWeekendRevenue14d: avgWeekendRevenue14d || undefined,
        avgCustomersPerWeekday: avgCustomersPerWeekday || undefined,
        avgCustomersPerWeekend: avgCustomersPerWeekend || undefined,
        menuMixTop3Percent: menuMixTop3Percent || undefined,
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

        {/* Page Purpose Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงาน' : 'Update Operational Data'}
          </h2>
          <p style={{ fontSize: '15px', color: '#374151', marginBottom: '0.75rem', lineHeight: '1.6' }}>
            {locale === 'th'
              ? 'คุณอัปเดตสัญญาณธุรกิจบางอย่าง — ระบบตรวจสอบประสิทธิภาพและความเสี่ยง F&B อย่างต่อเนื่อง'
              : 'You update a few business signals — the system continuously monitors F&B performance and risks'}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* SECTION 1: Cash Position */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '1. ตำแหน่งเงินสด' : '1. Cash Position'}
              </h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ยอดเงินสดคงเหลือ (บาท)' : 'Cash Balance (THB)'} *
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
            </div>

            {/* SECTION 2: Revenue Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '2. สัญญาณรายได้' : '2. Revenue Signals'}
              </h3>
              
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

            {/* SECTION 3: Cost Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '3. สัญญาณต้นทุน' : '3. Cost Signals'}
              </h3>
              
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

            {/* SECTION 4: Utilization Signals (Required for alerts) */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem' }}>
                {locale === 'th' ? '4. สัญญาณการใช้ประโยชน์' : '4. Utilization Signals'}
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem' }}>
                {locale === 'th' 
                  ? 'จำเป็นสำหรับการแจ้งเตือนการใช้งานวันธรรมดาและช่องว่างวันหยุดสุดสัปดาห์-วันธรรมดา'
                  : 'Required for Low Weekday Utilization and Weekend-Weekday Gap alerts'}
              </p>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'รายได้เฉลี่ยวันธรรมดา (14 วันล่าสุด)' : 'Average Weekday Revenue (Last 14 Days)'} *
                </label>
                <input
                  type="text"
                  value={formData.avgWeekdayRevenue14d}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, avgWeekdayRevenue14d: value });
                    if (errors.avgWeekdayRevenue14d) {
                      setErrors({ ...errors, avgWeekdayRevenue14d: '' });
                    }
                  }}
                  placeholder={locale === 'th' ? 'เช่น 8,500' : 'e.g., 8,500'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid ${errors.avgWeekdayRevenue14d ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
                {errors.avgWeekdayRevenue14d && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                    {errors.avgWeekdayRevenue14d}
                  </p>
                )}
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                  {locale === 'th' 
                    ? 'รายได้เฉลี่ยต่อวันธรรมดาในช่วง 14 วันล่าสุด'
                    : 'Average revenue per weekday over the last 14 days'}
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'รายได้เฉลี่ยวันหยุดสุดสัปดาห์ (14 วันล่าสุด)' : 'Average Weekend Revenue (Last 14 Days)'} *
                </label>
                <input
                  type="text"
                  value={formData.avgWeekendRevenue14d}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, avgWeekendRevenue14d: value });
                    if (errors.avgWeekendRevenue14d) {
                      setErrors({ ...errors, avgWeekendRevenue14d: '' });
                    }
                  }}
                  placeholder={locale === 'th' ? 'เช่น 12,000' : 'e.g., 12,000'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid ${errors.avgWeekendRevenue14d ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
                {errors.avgWeekendRevenue14d && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                    {errors.avgWeekendRevenue14d}
                  </p>
                )}
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                  {locale === 'th' 
                    ? 'รายได้เฉลี่ยต่อวันหยุดสุดสัปดาห์ในช่วง 14 วันล่าสุด'
                    : 'Average revenue per weekend day over the last 14 days'}
                </p>
              </div>
            </div>

            {/* SECTION 5: Demand Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '5. สัญญาณความต้องการ' : '5. Demand Signals'}
              </h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ลูกค้าเฉลี่ยต่อวันธรรมดา' : 'Average Customers Per Weekday'}
                </label>
                <input
                  type="text"
                  value={formData.avgCustomersPerWeekday}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, avgCustomersPerWeekday: value });
                  }}
                  placeholder={locale === 'th' ? 'เช่น 150' : 'e.g., 150'}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'ลูกค้าเฉลี่ยต่อวันหยุดสุดสัปดาห์' : 'Average Customers Per Weekend Day'}
                </label>
                <input
                  type="text"
                  value={formData.avgCustomersPerWeekend}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,]/g, '');
                    setFormData({ ...formData, avgCustomersPerWeekend: value });
                  }}
                  placeholder={locale === 'th' ? 'เช่น 220' : 'e.g., 220'}
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

            {/* SECTION 6: Staffing */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
                {locale === 'th' ? '6. บุคลากร' : '6. Staffing'}
              </h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'จำนวนพนักงานปัจจุบัน' : 'Current Staff Count'}
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
            </div>

            {/* SECTION 7: Menu Mix (Optional) */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem' }}>
                {locale === 'th' ? '7. ส่วนผสมเมนู (ไม่บังคับ)' : '7. Menu Mix (Optional)'}
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem' }}>
                {locale === 'th' 
                  ? 'ใช้สำหรับการแจ้งเตือนความเข้มข้นของรายได้เมนู'
                  : 'Used for Menu Revenue Concentration alert'}
              </p>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? '% ของรายได้จากเมนู 3 อันดับแรก' : '% of Revenue from Top 3 Menu Items'}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={formData.menuMixTop3Percent}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      setFormData({ ...formData, menuMixTop3Percent: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 45' : 'e.g., 45'}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>%</span>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                  {locale === 'th' 
                    ? 'เปอร์เซ็นต์ของรายได้ทั้งหมดที่มาจากเมนู 3 อันดับแรก (0-100%)'
                    : 'Percentage of total revenue from top 3 menu items (0-100%)'}
                </p>
              </div>
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
