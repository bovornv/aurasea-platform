/**
 * F&B Daily Entry Page
 * 
 * PART 5: Ultra-simple daily input - only 5 fields
 * Works with incomplete data
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { saveDailyMetric, getDailyMetrics, getTodayDateString } from '../../services/db/daily-metrics-service';

export default function FnbDailyEntryPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { locale, t } = useI18n();
  const { branch } = useCurrentBranch();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    totalCustomers: '',
    totalSales: '',
    totalOperatingCost: '',
    cashBalance: '',
    staffOnDuty: '',
    additionalCostToday: '', // Optional THB
  });

  useEffect(() => {
    setMounted(true);
    
    // Load today's data if exists
    if (branch?.id) {
      const todayStr = getTodayDateString();
      getDailyMetrics(branch.id, 1).then(metrics => {
        const todayMetric = metrics.find(m => m.date === todayStr);
        if (todayMetric && todayMetric.customers !== undefined) {
          setFormData({
            totalCustomers: todayMetric.customers.toString(),
            totalSales: formatNumberWithCommas(todayMetric.revenue?.toString() || '0'),
            totalOperatingCost: formatNumberWithCommas(todayMetric.cost?.toString() || '0'),
            cashBalance: formatNumberWithCommas(todayMetric.cashBalance?.toString() ?? '0'),
            staffOnDuty: todayMetric.fnbStaff?.toString() || '',
            additionalCostToday: todayMetric.additionalCostToday != null ? formatNumberWithCommas(String(todayMetric.additionalCostToday)) : '',
          });
        }
      });
    }
  }, [branch?.id]);

  const formatNumberWithCommas = (value: string): string => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned === '') return '';
    const num = parseInt(cleaned, 10);
    if (isNaN(num)) return '';
    return Math.round(num).toLocaleString('en-US');
  };

  const parseFormattedNumber = (value: string): number | null => {
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    return Math.round(parsed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!branch?.id) {
      setErrors({ submit: locale === 'th' ? 'ไม่พบสาขา' : 'Branch not found' });
      return;
    }

    const newErrors: Record<string, string> = {};

    // Validate required fields
    const totalCustomers = parseFormattedNumber(formData.totalCustomers);
    const totalSales = parseFormattedNumber(formData.totalSales);
    const totalOperatingCost = parseFormattedNumber(formData.totalOperatingCost);
    const cashBalance = parseFormattedNumber(formData.cashBalance);
    const staffOnDuty = parseFormattedNumber(formData.staffOnDuty);

    if (totalCustomers === null || totalCustomers < 0) {
      newErrors.totalCustomers = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    if (totalSales === null || totalSales < 0) {
      newErrors.totalSales = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    if (totalOperatingCost === null || totalOperatingCost < 0) {
      newErrors.totalOperatingCost = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    if (cashBalance === null || cashBalance < 0) {
      newErrors.cashBalance = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    const additionalCostToday = parseFormattedNumber(formData.additionalCostToday);
    if (additionalCostToday !== null && additionalCostToday < 0) {
      newErrors.additionalCostToday = locale === 'th' ? 'ต้องมากกว่าหรือเท่ากับ 0' : 'Must be >= 0';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setErrors({});
      setSuccess(false);

      const todayStr = getTodayDateString();
      
      const parsedAdditionalCost = additionalCostToday !== null && additionalCostToday >= 0 ? additionalCostToday : 0;
      const saved = await saveDailyMetric({
        branchId: branch.id,
        date: todayStr,
        revenue: totalSales!,
        cost: totalOperatingCost!,
        cashBalance: cashBalance!,
        customers: totalCustomers!,
        avgTicket: totalCustomers! > 0 ? totalSales! / totalCustomers! : undefined,
        fnbStaff: staffOnDuty != null ? (typeof staffOnDuty === 'string' ? parseInt(staffOnDuty, 10) : staffOnDuty) : undefined,
        additionalCostToday: parsedAdditionalCost,
      });

      if (saved) {
        setSuccess(true);
        setTimeout(() => {
          router.push(paths.branchOverview || '/branch/overview');
        }, 2000);
      } else {
        setErrors({ submit: locale === 'th' ? 'บันทึกไม่สำเร็จ' : 'Failed to save' });
      }
    } catch (err) {
      console.error('Failed to save F&B daily metric:', err);
      setErrors({ submit: locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred' });
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return (
      <PageLayout title="" subtitle="">
        <LoadingSpinner />
      </PageLayout>
    );
  }

  if (!branch) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={locale === 'th' ? 'ไม่พบสาขา' : 'Branch not found'}
          action={{
            label: locale === 'th' ? 'กลับไปที่ภาพรวม' : 'Back to Overview',
            onClick: () => router.push(paths.branchOverview || '/branch/overview'),
          }}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={locale === 'th' ? 'บันทึกข้อมูลรายวัน (F&B)' : 'Submit Daily Metrics (F&B)'}
      subtitle={locale === 'th'
        ? 'กรอกข้อมูลรายวัน - ใช้เวลาน้อยกว่า 1 นาที'
        : 'Daily input - takes less than 1 minute'}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '2rem' }}>
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
              : 'Metrics saved successfully! Redirecting to overview...'}
          </div>
        )}

        {/* Error Message */}
        {errors.submit && (
          <div style={{
            border: '1px solid #dc2626',
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
          <SectionCard title={locale === 'th' ? 'ข้อมูลรายวัน' : 'Daily Metrics'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Total Customers */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}>
                  {locale === 'th' ? 'จำนวนลูกค้า (วันนี้)' : 'Total Customers (Today)'} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.totalCustomers}
                  onChange={(e) => {
                    const formatted = formatNumberWithCommas(e.target.value);
                    setFormData({ ...formData, totalCustomers: formatted });
                    if (errors.totalCustomers) {
                      setErrors({ ...errors, totalCustomers: '' });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.totalCustomers ? '1px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                  }}
                  placeholder="0"
                />
                {errors.totalCustomers && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                    {errors.totalCustomers}
                  </p>
                )}
              </div>

              {/* Total Sales */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}>
                  {locale === 'th' ? 'ยอดขายรวม (วันนี้)' : 'Total Sales (Today)'} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.totalSales}
                  onChange={(e) => {
                    const formatted = formatNumberWithCommas(e.target.value);
                    setFormData({ ...formData, totalSales: formatted });
                    if (errors.totalSales) {
                      setErrors({ ...errors, totalSales: '' });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.totalSales ? '1px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                  }}
                  placeholder="0"
                />
                {errors.totalSales && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                    {errors.totalSales}
                  </p>
                )}
              </div>

              {/* Total Operating Cost */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}>
                  {locale === 'th' ? 'ต้นทุนการดำเนินงาน (วันนี้)' : 'Total Operating Cost (Today)'} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.totalOperatingCost}
                  onChange={(e) => {
                    const formatted = formatNumberWithCommas(e.target.value);
                    setFormData({ ...formData, totalOperatingCost: formatted });
                    if (errors.totalOperatingCost) {
                      setErrors({ ...errors, totalOperatingCost: '' });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.totalOperatingCost ? '1px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                  }}
                  placeholder="0"
                />
                {errors.totalOperatingCost && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                    {errors.totalOperatingCost}
                  </p>
                )}
              </div>

              {/* Cash Balance */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}>
                  {locale === 'th' ? 'ยอดเงินสดคงเหลือ' : 'Current Cash Balance'} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.cashBalance}
                  onChange={(e) => {
                    const formatted = formatNumberWithCommas(e.target.value);
                    setFormData({ ...formData, cashBalance: formatted });
                    if (errors.cashBalance) {
                      setErrors({ ...errors, cashBalance: '' });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.cashBalance ? '1px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                  }}
                  placeholder="0"
                />
                {errors.cashBalance && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                    {errors.cashBalance}
                  </p>
                )}
              </div>

              {/* Staff on Duty (Optional) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}>
                  {locale === 'th' ? 'พนักงานที่ทำงาน (วันนี้)' : 'Staff on Duty (Today)'}
                  <span style={{ color: '#6b7280', fontSize: '12px', marginLeft: '0.5rem' }}>
                    ({locale === 'th' ? 'ไม่บังคับ' : 'optional'})
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.staffOnDuty}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, '');
                    setFormData({ ...formData, staffOnDuty: cleaned });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                  }}
                  placeholder="0"
                />
              </div>

              {/* Additional Cost Today (optional, THB) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}>
                  {locale === 'th' ? 'ต้นทุนเพิ่มเติมวันนี้' : 'Additional Cost Today'}
                  <span style={{ color: '#6b7280', fontSize: '12px', marginLeft: '0.5rem' }}>
                    ({locale === 'th' ? 'ไม่บังคับ' : 'optional'})
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.additionalCostToday}
                  onChange={(e) => {
                    const formatted = formatNumberWithCommas(e.target.value);
                    setFormData({ ...formData, additionalCostToday: formatted });
                    if (errors.additionalCostToday) setErrors({ ...errors, additionalCostToday: '' });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.additionalCostToday ? '1px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '16px',
                  }}
                  placeholder="0"
                />
                {errors.additionalCostToday && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>{errors.additionalCostToday}</p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Submit Button */}
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => router.push(paths.branchOverview || '/branch/overview')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: saving ? '#9ca3af' : '#0a0a0a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving
                ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                : (locale === 'th' ? 'บันทึก' : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
