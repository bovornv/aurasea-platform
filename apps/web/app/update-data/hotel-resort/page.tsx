// Hotel / Resort Operational Data Entry Page
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

export default function HotelResortOperationalDataPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch, isAllBranches } = useCurrentBranch();
  const { setAlerts } = useAlertStore();
  const { testMode } = useTestMode();
  const hotelOverviewUrl = paths.branchOverview ? `${paths.branchOverview}?tab=hotel` : '/branch/overview?tab=hotel';

  const capabilities = getBusinessCapabilities(setup);
  const [shouldRender, setShouldRender] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    // Cash Position
    cashBalance: '',
    // Revenue Signals
    revenue7Days: '',
    revenue30Days: '',
    weekdayRevenue30d: '',
    weekendRevenue30d: '',
    averageDailyRate: '',
    // Cost Signals
    costs7Days: '',
    costs30Days: '',
    // Trend Stability (optional)
    revenue90Days: '',
    costs90Days: '',
    // Capacity & Operations
    occupancyRate: '',
    totalRooms: '',
    staffCount: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Redirect only on client to avoid SSR "location is not defined"
  useEffect(() => {
    if (!capabilities.hasHotel) {
      router.replace('/update-data/cafe-restaurant');
      setShouldRender(false);
    } else {
      setShouldRender(true);
    }
  }, [capabilities.hasHotel, router]);

  // Load latest signal in useEffect to avoid SSR issues
  useEffect(() => {
    const branchId = isAllBranches ? null : branch?.id;
    const businessGroup = businessGroupService.getBusinessGroup();
    const latestSignal = operationalSignalsService.getLatestSignal(branchId, businessGroup?.id);
    
    if (latestSignal) {
      setFormData({
        cashBalance: formatNumberWithCommas(latestSignal.cashBalance ?? null),
        revenue7Days: formatNumberWithCommas(latestSignal.revenue7Days ?? null),
        revenue30Days: formatNumberWithCommas(latestSignal.revenue30Days ?? null),
        weekdayRevenue30d: formatNumberWithCommas(latestSignal.weekdayRevenue30d ?? null),
        weekendRevenue30d: formatNumberWithCommas(latestSignal.weekendRevenue30d ?? null),
        averageDailyRate: formatNumberWithCommas(latestSignal.averageDailyRate ?? null),
        costs7Days: formatNumberWithCommas(latestSignal.costs7Days ?? null),
        costs30Days: formatNumberWithCommas(latestSignal.costs30Days ?? null),
        revenue90Days: formatNumberWithCommas(latestSignal.revenue90Days ?? null),
        costs90Days: formatNumberWithCommas(latestSignal.costs90Days ?? null),
        occupancyRate: latestSignal.occupancyRate !== undefined ? (latestSignal.occupancyRate * 100).toString() : '',
        totalRooms: latestSignal.totalRooms?.toString() || '',
        staffCount: latestSignal.staffCount.toString(),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse formatted numbers
    const cashBalance = parseFormattedNumber(formData.cashBalance);
    const revenue7Days = parseFormattedNumber(formData.revenue7Days);
    const revenue30Days = parseFormattedNumber(formData.revenue30Days);
    const weekdayRevenue30d = parseFormattedNumber(formData.weekdayRevenue30d);
    const weekendRevenue30d = parseFormattedNumber(formData.weekendRevenue30d);
    const averageDailyRate = parseFormattedNumber(formData.averageDailyRate);
    const costs7Days = parseFormattedNumber(formData.costs7Days);
    const costs30Days = parseFormattedNumber(formData.costs30Days);
    const revenue90Days = parseFormattedNumber(formData.revenue90Days);
    const costs90Days = parseFormattedNumber(formData.costs90Days);
    const staffCount = parseFormattedNumber(formData.staffCount);
    const occupancyRate = parseFormattedNumber(formData.occupancyRate);
    const totalRooms = parseFormattedNumber(formData.totalRooms);
    
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
      
      // Save operational signal - Hotel data with all new fields
      operationalSignalsService.saveSignal({
        cashBalance: cashBalance!,
        revenue7Days: revenue7Days!,
        revenue30Days: revenue30Days!,
        weekdayRevenue30d: weekdayRevenue30d || undefined,
        weekendRevenue30d: weekendRevenue30d || undefined,
        averageDailyRate: averageDailyRate || undefined,
        costs7Days: costs7Days!,
        costs30Days: costs30Days!,
        revenue90Days: revenue90Days || undefined,
        costs90Days: costs90Days || undefined,
        staffCount: staffCount || 0,
        occupancyRate: occupancyRate ? parseFloat(occupancyRate.toString()) / 100 : undefined, // Convert percentage to decimal
        totalRooms: totalRooms || undefined,
        // Explicitly no customerVolume for hotel
        customerVolume: undefined,
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
        router.push(hotelOverviewUrl);
      }, 2000);
    } catch (err) {
      console.error('Failed to save hotel data:', err);
      setErrors({ submit: t('dataEntry.errors.saveFailed') });
      setSuccess(false);
    } finally {
      setSaving(false);
    }
  };

  const displaySubtitle = isAllBranches
    ? (locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงานสำหรับโรงแรม / รีสอร์ท' : 'Update operational data for hotel / resort')
    : branch
    ? `${branch.branchName} • ${locale === 'th' ? 'อัปเดตข้อมูลโรงแรม' : 'Update hotel data'}`
    : (locale === 'th' ? 'อัปเดตข้อมูลโรงแรม' : 'Update hotel data');

  return (
    <PageLayout 
      title={locale === 'th' ? 'อัปเดตข้อมูลการดำเนินงาน → โรงแรม / รีสอร์ท' : 'Update Operational Data → Hotel / Resort'} 
      subtitle={displaySubtitle}
    >
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
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
                  ? `กำลังบันทึกข้อมูลโรงแรมสำหรับสาขา: ${branch.branchName}`
                  : `Recording hotel data for branch: ${branch.branchName}`}
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
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, fontStyle: 'italic' }}>
            {locale === 'th'
              ? 'หมายเหตุ: จำนวนเงินทั้งหมดเป็นสกุลเงินบาทไทย (THB)'
              : 'Note: All monetary amounts are in Thai Baht (THB)'}
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
            {/* Section 1: Cash Position */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                {locale === 'th' ? 'เงินสด' : 'Cash Position'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'ยอดเงินสดคงเหลือ (THB)' : 'Current Cash Balance (THB)'} *
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
            </div>

            {/* Section 2: Revenue Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                {locale === 'th' ? 'สัญญาณรายได้' : 'Revenue Signals'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'รายได้ 7 วันล่าสุด (THB)' : 'Revenue (Last 7 Days) (THB)'} *
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

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'รายได้ 30 วันล่าสุด (THB)' : 'Revenue (Last 30 Days) (THB)'} *
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

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'รายได้วันธรรมดา (30 วันล่าสุด) (THB)' : 'Weekday Revenue (Last 30 Days) (THB)'}
                  </label>
                  <input
                    type="text"
                    value={formData.weekdayRevenue30d}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9,]/g, '');
                      setFormData({ ...formData, weekdayRevenue30d: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 200,000' : 'e.g., 200,000'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                    {locale === 'th' ? 'รายได้รวมจากวันจันทร์-พฤหัสบดี' : 'Total revenue from Monday-Thursday'}
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'รายได้วันหยุดสุดสัปดาห์ (30 วันล่าสุด) (THB)' : 'Weekend Revenue (Last 30 Days) (THB)'}
                  </label>
                  <input
                    type="text"
                    value={formData.weekendRevenue30d}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9,]/g, '');
                      setFormData({ ...formData, weekendRevenue30d: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 150,000' : 'e.g., 150,000'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                    {locale === 'th' ? 'รายได้รวมจากวันศุกร์-อาทิตย์' : 'Total revenue from Friday-Sunday'}
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'อัตราราคาห้องเฉลี่ยต่อวัน (ADR) (THB)' : 'Average Daily Rate (ADR) (THB)'}
                  </label>
                  <input
                    type="text"
                    value={formData.averageDailyRate}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9,]/g, '');
                      setFormData({ ...formData, averageDailyRate: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 2,500' : 'e.g., 2,500'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                    {locale === 'th' ? 'ราคาห้องเฉลี่ยต่อคืน' : 'Average room rate per night'}
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Cost Signals */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                {locale === 'th' ? 'สัญญาณต้นทุน' : 'Cost Signals'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'ต้นทุน 7 วันล่าสุด (THB)' : 'Costs (Last 7 Days) (THB)'} *
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

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'ต้นทุน 30 วันล่าสุด (THB)' : 'Costs (Last 30 Days) (THB)'} *
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
            </div>

            {/* Section 4: Trend Stability (Optional) */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                {locale === 'th' ? 'ความเสถียรของแนวโน้ม (ไม่บังคับ)' : 'Trend Stability (Optional)'}
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem', fontStyle: 'italic' }}>
                {locale === 'th'
                  ? 'ข้อมูล 90 วันช่วยเพิ่มความแม่นยำในการประเมิน แต่ไม่จำเป็นสำหรับการทำงานพื้นฐาน'
                  : '90-day data improves assessment accuracy but is not required for basic operation'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'รายได้ 90 วันล่าสุด (THB)' : 'Revenue (Last 90 Days) (THB)'}
                  </label>
                  <input
                    type="text"
                    value={formData.revenue90Days}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9,]/g, '');
                      setFormData({ ...formData, revenue90Days: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 1,050,000' : 'e.g., 1,050,000'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'ต้นทุน 90 วันล่าสุด (THB)' : 'Costs (Last 90 Days) (THB)'}
                  </label>
                  <input
                    type="text"
                    value={formData.costs90Days}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9,]/g, '');
                      setFormData({ ...formData, costs90Days: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 630,000' : 'e.g., 630,000'}
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
            </div>

            {/* Section 5: Capacity & Operations */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                {locale === 'th' ? 'ความจุและการดำเนินงาน' : 'Capacity & Operations'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'จำนวนห้องทั้งหมด' : 'Total Rooms Available'}
                  </label>
                  <input
                    type="text"
                    value={formData.totalRooms}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      setFormData({ ...formData, totalRooms: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 50' : 'e.g., 50'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>
                    {locale === 'th' ? 'อัตราการเข้าพัก (%)' : 'Occupancy Rate (%)'}
                  </label>
                  <input
                    type="text"
                    value={formData.occupancyRate}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      setFormData({ ...formData, occupancyRate: value });
                    }}
                    placeholder={locale === 'th' ? 'เช่น 75' : 'e.g., 75'}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

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
                    placeholder={locale === 'th' ? 'เช่น 25' : 'e.g., 25'}
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
