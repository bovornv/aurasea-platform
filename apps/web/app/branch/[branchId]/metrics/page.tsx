/**
 * Submit Latest Metrics Page
 * 
 * Clean, module-based metrics entry page
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageLayout } from '../../../components/page-layout';
import { useOrgBranchPaths } from '../../../hooks/use-org-branch-paths';
import { useI18n } from '../../../hooks/use-i18n';
import { useCurrentBranch } from '../../../hooks/use-current-branch';
import { useBusinessSetup } from '../../../contexts/business-setup-context';
import { useAlertStore } from '../../../contexts/alert-store-context';
import { useTestMode } from '../../../providers/test-mode-provider';
import { useOrganizationData } from '../../../hooks/use-organization-data';
import { useOrganization } from '../../../contexts/organization-context';
import { operationalSignalsService, convertSignalToMetrics, convertMetricsToSignal } from '../../../services/operational-signals-service';
import { monitoringService } from '../../../services/monitoring-service';
import { businessGroupService } from '../../../services/business-group-service';
import { ModuleType } from '../../../models/business-group';
import type { BranchMetrics } from '../../../models/branch-metrics';
import { calculateDataConfidence } from '../../../models/branch-metrics';
import { LoadingSpinner } from '../../../components/loading-spinner';
import { ErrorState } from '../../../components/error-state';
import { SectionCard } from '../../../components/section-card';
import { saveDailyMetric } from '../../../services/db/daily-metrics-service';

// Format number with commas for display (rounded, no decimals)
function formatNumberWithCommas(value: number | null): string {
  if (value === null || value === undefined) return '';
  return Math.round(value).toLocaleString('en-US');
}

export default function BranchMetricsPage() {
  // Hooks must never be called conditionally
  // ALL HOOKS MUST BE CALLED FIRST - NO CONDITIONALS, NO EARLY RETURNS
  const router = useRouter();
  const params = useParams();
  const branchId = (params?.branchId as string) || null;
  const paths = useOrgBranchPaths();
  const { locale } = useI18n();
  const { branch: currentBranch } = useCurrentBranch();
  const { setup } = useBusinessSetup();
  const { setAlerts } = useAlertStore();
  const { testMode } = useTestMode();
  const { branches: organizationBranches, isLoading: organizationBranchesLoading } = useOrganizationData();
  const { activeOrganizationId } = useOrganization();
  
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // PART 2: Today-only fields - Shared Business Financials
  const [sharedFinancials, setSharedFinancials] = useState({
    cashBalance: '', // Today's cash balance
    revenue: '', // Today's revenue
    cost: '', // Today's cost
  });

  // PART 2: Accommodation module data - Today-only
  const [accommodationData, setAccommodationData] = useState({
    roomsSold: '', // Today's rooms sold
    averageDailyRate: '', // Today's ADR
    totalRooms: '', // Total rooms available (config, not daily)
    staffCount: '', // Accommodation staff (config, not daily)
  });

  // PART 2: F&B module data - Today-only
  const [fnbData, setFnbData] = useState({
    customers: '', // Today's customers
    avgTicket: '', // Today's average ticket
    staffCount: '', // F&B staff (config, not daily)
  });

  // Collapsible state - ALWAYS DECLARED
  const [accommodationExpanded, setAccommodationExpanded] = useState(true);
  const [fnbExpanded, setFnbExpanded] = useState(true);
  
  // Ensure we're on client side
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Get branch from ID - prioritize organization branches from Supabase, fallback to businessGroupService
  const branch = useMemo(() => {
    if (typeof window === 'undefined') return null; // SSR guard
    if (!branchId) return currentBranch || null;
    
    // If currentBranch matches the URL branchId, use it
    if (currentBranch?.id === branchId) {
      return currentBranch;
    }
    
    // First, try to find in organization branches (from Supabase)
    // Wait for organizationBranches to be loaded (check if array exists, even if empty initially)
    if (organizationBranches !== undefined) {
      const orgBranch = organizationBranches.find(b => b.id === branchId);
      if (orgBranch) {
        const mt = orgBranch.module_type;
        const modules: ModuleType[] = mt === 'accommodation' ? [ModuleType.ACCOMMODATION] : mt === 'fnb' ? [ModuleType.FNB] : [];
        return {
          id: orgBranch.id,
          branchName: orgBranch.name,
          businessGroupId: orgBranch.organization_id,
          moduleType: mt === 'accommodation' || mt === 'fnb' ? mt : undefined,
          modules,
          isDefault: false,
        };
      }
      
      // If organizationBranches is loaded but branch not found, don't fallback yet
      // Wait a bit for branches to finish loading
      if (organizationBranches.length === 0) {
        // Still loading, return null for now
        return null;
      }
    }
    
    // Fallback to businessGroupService (for legacy/localStorage branches)
    // Only if organizationBranches has been checked and branch not found
    try {
      const branches = businessGroupService.getAllBranches();
      return branches.find(b => b.id === branchId) || null;
    } catch (error) {
      console.error('Error loading branch:', error);
      return null;
    }
  }, [branchId, currentBranch?.id, organizationBranches]);

  useEffect(() => {
    // PART 2: Load today's daily metric - only after mount and branch is available
    if (!mounted || !branch?.id) return;
    
    const loadTodayMetric = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];
        
        // Load today's accommodation daily metric
        const { getDailyMetrics } = await import('../../../services/db/daily-metrics-service');
        const dailyMetrics = await getDailyMetrics(branch.id, 1);
        const todayMetric = dailyMetrics.find(m => m.date === todayStr);
        
        if (todayMetric) {
          // Unified fields: Use canonical revenue, cost, cashBalance
          // Revenue may be stored directly or calculated from roomsSold * adr
          const todayRevenue = todayMetric.revenue || 
            (todayMetric.roomsSold && todayMetric.adr ? todayMetric.roomsSold * todayMetric.adr : 0);
          
          setSharedFinancials({
            cashBalance: formatNumberWithCommas(todayMetric.cashBalance ?? null),
            revenue: formatNumberWithCommas(todayRevenue),
            cost: formatNumberWithCommas(todayMetric.cost || 0),
          });
          
          // Accommodation fields (if present)
          if (todayMetric.roomsSold !== undefined) {
            setAccommodationData({
              roomsSold: todayMetric.roomsSold.toString(),
              averageDailyRate: formatNumberWithCommas(todayMetric.adr || 0),
              totalRooms: todayMetric.roomsAvailable?.toString() || '',
              staffCount: todayMetric.accommodationStaff?.toString() || '',
            });
          }
        }
        
        // Unified daily_metrics: F&B data is in same table
        // Check if today's metric has F&B fields
        if (todayMetric && branch.modules?.includes(ModuleType.FNB)) {
          if (todayMetric.customers !== undefined) {
            setFnbData({
              customers: todayMetric.customers.toString(),
              avgTicket: formatNumberWithCommas(todayMetric.avgTicket || 0),
              staffCount: todayMetric.fnbStaff?.toString() || '',
            });
          }
        }
        
        // Load branch config (rooms_available, staff) from latest computed metrics
        const groupId = activeOrganizationId || businessGroupService.getBusinessGroup()?.id;
        if (groupId) {
          const latestMetrics = operationalSignalsService.getLatestMetrics(
            branch.id,
            groupId,
            branch.modules
          );
          
          if (latestMetrics?.modules.accommodation) {
            setAccommodationData(prev => ({
              ...prev,
              totalRooms: latestMetrics.modules.accommodation!.totalRoomsAvailable.toString(),
              staffCount: latestMetrics.modules.accommodation!.totalStaffAccommodation.toString(),
            }));
          }
          
          if (latestMetrics?.modules.fnb) {
            setFnbData(prev => ({
              ...prev,
              staffCount: latestMetrics.modules.fnb!.totalStaffFnb.toString(),
            }));
          }
        }
      } catch (error) {
        console.error('Error loading today\'s daily metric:', error);
      }
    };
    
    loadTodayMetric();
  }, [branch?.id, activeOrganizationId, mounted]);

  // Module detection - MUST be defined before useEffect that uses them
  const hasAccommodation = useMemo(() => {
    return branch?.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
  }, [branch?.modules]);

  const hasFnb = useMemo(() => {
    return branch?.modules?.includes(ModuleType.FNB) ?? false;
  }, [branch?.modules]);

  // PART 2: Auto-calculate revenue from accommodation (roomsSold * ADR) or F&B (customers * avgTicket)
  useEffect(() => {
    if (!mounted) return;
    
    let calculatedRevenue = 0;
    
    // Calculate accommodation revenue
    if (hasAccommodation) {
      const roomsSold = parseFormattedNumber(accommodationData.roomsSold) || 0;
      const avgRoomRate = parseFormattedNumber(accommodationData.averageDailyRate) || 0;
      calculatedRevenue += roomsSold * avgRoomRate;
    }
    
    // Calculate F&B revenue
    if (hasFnb) {
      const customers = parseFormattedNumber(fnbData.customers) || 0;
      const avgTicket = parseFormattedNumber(fnbData.avgTicket) || 0;
      calculatedRevenue += customers * avgTicket;
    }
    
    // Update shared revenue (read-only, auto-calculated)
    if (calculatedRevenue > 0 || sharedFinancials.revenue === '') {
      setSharedFinancials(prev => ({
        ...prev,
        revenue: formatNumberWithCommas(calculatedRevenue),
      }));
    }
  }, [accommodationData.roomsSold, accommodationData.averageDailyRate, fnbData.customers, fnbData.avgTicket, hasAccommodation, hasFnb, mounted]);

  // Format number with commas as user types
  const formatInputNumber = (value: string): string => {
    // Remove all non-digit characters
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned === '') return '';
    // Parse and format with commas
    const num = parseInt(cleaned, 10);
    if (isNaN(num)) return '';
    return Math.round(num).toLocaleString('en-US');
  };

  const parseFormattedNumber = (value: string): number | null => {
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    const rounded = Math.round(parsed);
    return rounded < 0 ? 0 : rounded;
  };

  const parsePercentage = (value: string): number | null => {
    const cleaned = value.replace(/[^0-9.]/g, '').trim();
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    return Math.max(0, Math.min(100, parsed));
  };

  const handleSave = async () => {
    if (!branch || !branch.id) return;

    const newErrors: Record<string, string> = {};
    
    // Validate based on enabled modules
    const hasAccommodation = branch.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
    const hasFnb = branch.modules?.includes(ModuleType.FNB) ?? false;

    // PART 2: Validate today-only fields
    const cashBalance = parseFormattedNumber(sharedFinancials.cashBalance);
    const cost = parseFormattedNumber(sharedFinancials.cost);

    // Validate required fields
    if (cashBalance === null || cashBalance < 0) {
      newErrors.cashBalance = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    if (cost === null || cost < 0) {
      newErrors.cost = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
    }
    
    // Revenue is auto-calculated, no need to validate
    // For accommodation: revenue = roomsSold * ADR
    // For F&B: revenue = customers * avgTicket

    // Validate accommodation fields
    if (hasAccommodation) {
      const roomsSold = parseFormattedNumber(accommodationData.roomsSold);
      const avgRoomRate = parseFormattedNumber(accommodationData.averageDailyRate);
      
      if (roomsSold === null || roomsSold < 0) {
        newErrors.roomsSold = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
      }
      if (avgRoomRate === null || avgRoomRate < 0) {
        newErrors.avgRoomRate = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
      }
    }

    // Validate F&B fields
    if (hasFnb) {
      const customers = parseFormattedNumber(fnbData.customers);
      const avgTicket = parseFormattedNumber(fnbData.avgTicket);
      
      if (customers === null || customers < 0) {
        newErrors.customers = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
      }
      if (avgTicket === null || avgTicket < 0) {
        newErrors.avgTicket = locale === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      setErrors({});

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Unified daily_metrics: Save single record with all fields
      // Calculate revenue from accommodation (roomsSold * adr) or F&B (customers * avgTicket)
      let calculatedRevenue = 0;
      
      if (hasAccommodation) {
        const roomsSold = parseFormattedNumber(accommodationData.roomsSold) || 0;
        const adr = parseFormattedNumber(accommodationData.averageDailyRate) || 0;
        calculatedRevenue += roomsSold * adr;
      }
      
      if (hasFnb) {
        const customers = parseFormattedNumber(fnbData.customers) || 0;
        const avgTicket = parseFormattedNumber(fnbData.avgTicket) || 0;
        calculatedRevenue += customers * avgTicket;
      }
      
      // Save unified daily metric with canonical fields
      await saveDailyMetric({
        branchId: branch.id,
        date: todayStr,
        revenue: calculatedRevenue,
        cost: cost!,
        cashBalance: cashBalance!,
        // Accommodation fields (if applicable)
        ...(hasAccommodation ? {
          roomsSold: parseFormattedNumber(accommodationData.roomsSold) || undefined,
          roomsAvailable: parseFormattedNumber(accommodationData.totalRooms) || undefined,
          adr: parseFormattedNumber(accommodationData.averageDailyRate) || undefined,
          accommodationStaff: parseFormattedNumber(accommodationData.staffCount) || undefined,
        } : {}),
        // F&B fields (if applicable)
        ...(hasFnb ? {
          customers: parseFormattedNumber(fnbData.customers) || undefined,
          avgTicket: parseFormattedNumber(fnbData.avgTicket) || undefined,
          fnbStaff: parseFormattedNumber(fnbData.staffCount) || undefined,
          promoSpend: undefined, // Optional, not in form yet
        } : {}),
      });

      // Trigger monitoring evaluation
      const { alerts } = await monitoringService.evaluate(setup.isCompleted ? setup : null, {
        businessType: testMode.businessType,
        scenario: testMode.scenario,
        version: testMode.version,
      });

      setAlerts(alerts);
      monitoringService.resetReminderState();

      setSuccess(true);
      
      setTimeout(() => {
        router.push(paths.branchOverview || '/branch/overview');
      }, 1500);
    } catch (err) {
      console.error('Failed to save metrics:', err);
      setErrors({ submit: locale === 'th' ? 'ไม่สามารถบันทึกข้อมูลได้' : 'Failed to save data' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(paths.branchOverview || '/branch/overview');
  };

  // Module detection - Already defined above (before useEffect)
  const hasBoth = useMemo(() => {
    return hasAccommodation && hasFnb;
  }, [hasAccommodation, hasFnb]);

  // Early returns AFTER all hooks
  if (!mounted) {
    return (
      <PageLayout title="" subtitle="">
        <LoadingSpinner />
      </PageLayout>
    );
  }

  // Show loading while organization branches are being fetched
  if (organizationBranchesLoading && !branch) {
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

  // If branch has no modules, show clear message instead of crashing
  if (!hasAccommodation && !hasFnb) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={locale === 'th' 
            ? 'สาขานี้ยังไม่ได้กำหนดโมดูล กรุณาตั้งค่าโมดูลก่อน' 
            : 'This branch has no modules configured. Please configure modules first.'}
          action={{
            label: locale === 'th' ? 'ไปที่การตั้งค่า' : 'Go to Settings',
            onClick: () => router.push(paths.branchSettings || '/branch/settings'),
          }}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title={locale === 'th' ? 'ส่งตัวเลขล่าสุด' : 'Submit Latest Metrics'}
      subtitle={locale === 'th' 
        ? 'เราใช้ข้อมูลนี้เพื่อตรวจสอบสุขภาพทางการเงินและตรวจจับความเสี่ยง'
        : 'We use this to monitor financial health and detect risks.'}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '120px' }}>
        {/* PART 2: Guidance Banner - Today-only entry */}
        <div style={{
          border: '1px solid #dbeafe',
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          backgroundColor: '#eff6ff',
          marginBottom: '2rem',
          color: '#1e40af',
          fontSize: '14px',
        }}>
          {locale === 'th' 
            ? 'กรุณากรอกตัวเลขของวันนี้เท่านั้น ระบบจะคำนวณแนวโน้มและตัวเลขรวมอัตโนมัติ'
            : 'Enter today\'s numbers only. System calculates trends automatically.'}
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
              : 'Metrics saved successfully! Redirecting to overview...'}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* SECTION 1: Shared Business Financials */}
          <SectionCard 
            title={locale === 'th' ? 'ข้อมูลการเงินของธุรกิจ (ใช้ร่วมกัน)' : 'Business Financials (Shared)'}
            collapsible={false}
            expanded={true}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                  {locale === 'th' ? 'เงินสดคงเหลือปัจจุบัน' : 'Current Cash Balance'} <span style={{ color: '#ef4444' }}>*</span>
                  <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                    {locale === 'th' ? 'THB' : 'THB'}
                  </div>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={sharedFinancials.cashBalance}
                    onChange={(e) => {
                      const formatted = formatInputNumber(e.target.value);
                      setSharedFinancials({ ...sharedFinancials, cashBalance: formatted });
                      if (errors.cashBalance) setErrors({ ...errors, cashBalance: '' });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.625rem 3rem 0.625rem 0.75rem',
                      border: errors.cashBalance ? '1px solid #ef4444' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      textAlign: 'right',
                    }}
                    placeholder="0"
                  />
                  <span style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}>THB</span>
                </div>
                {errors.cashBalance && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.cashBalance}
                  </div>
                )}
              </div>

              {/* PART 2: Revenue field - auto-calculated from accommodation (roomsSold * ADR) or F&B (customers * avgTicket) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                  {locale === 'th' ? 'รายได้ (วันนี้)' : 'Revenue (Today)'}
                  <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                    {locale === 'th' ? 'คำนวณอัตโนมัติ' : 'Auto-calculated'} • {locale === 'th' ? 'THB' : 'THB'}
                  </div>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={sharedFinancials.revenue}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '0.625rem 3rem 0.625rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      textAlign: 'right',
                      backgroundColor: '#f9fafb',
                      color: '#6b7280',
                      cursor: 'not-allowed',
                    }}
                    placeholder="0"
                  />
                  <span style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}>THB</span>
                </div>
              </div>

              {/* PART 2: Today-only cost field */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                  {locale === 'th' ? 'ต้นทุนดำเนินงาน (วันนี้)' : 'Operating Cost (Today)'} <span style={{ color: '#ef4444' }}>*</span>
                  <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                    {locale === 'th' ? 'THB' : 'THB'}
                  </div>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={sharedFinancials.cost}
                    onChange={(e) => {
                      const formatted = formatInputNumber(e.target.value);
                      setSharedFinancials({ ...sharedFinancials, cost: formatted });
                      if (errors.cost) setErrors({ ...errors, cost: '' });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.625rem 3rem 0.625rem 0.75rem',
                      border: errors.cost ? '1px solid #ef4444' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      textAlign: 'right',
                    }}
                    placeholder="0"
                  />
                  <span style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}>THB</span>
                </div>
                {errors.cost && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.cost}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* SECTION 2: Accommodation Module */}
          {hasAccommodation && (
            <SectionCard 
              title={locale === 'th' ? 'โมดูลที่พัก' : 'Accommodation Module'}
              collapsible={hasBoth}
              expanded={accommodationExpanded}
              onToggle={() => setAccommodationExpanded(!accommodationExpanded)}
            >
              {accommodationExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {/* PART 2: Today-only rooms sold */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'ห้องที่ขายได้ (วันนี้)' : 'Rooms Sold (Today)'} <span style={{ color: '#ef4444' }}>*</span>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'จำนวนห้อง' : 'Number of rooms'}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={accommodationData.roomsSold}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setAccommodationData({ ...accommodationData, roomsSold: value });
                        if (errors.roomsSold) setErrors({ ...errors, roomsSold: '' });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: errors.roomsSold ? '1px solid #ef4444' : '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                      placeholder="0"
                    />
                    {errors.roomsSold && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                        {errors.roomsSold}
                      </div>
                    )}
                  </div>

                  {/* PART 2: Today-only ADR */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'ราคาเฉลี่ยต่อห้องต่อวัน (วันนี้)' : 'Average Daily Room Rate (Today)'} <span style={{ color: '#ef4444' }}>*</span>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'THB' : 'THB'}
                      </div>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={accommodationData.averageDailyRate}
                        onChange={(e) => {
                          const formatted = formatInputNumber(e.target.value);
                          setAccommodationData({ ...accommodationData, averageDailyRate: formatted });
                          if (errors.avgRoomRate) setErrors({ ...errors, avgRoomRate: '' });
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 3rem 0.625rem 0.75rem',
                          border: errors.avgRoomRate ? '1px solid #ef4444' : '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          textAlign: 'right',
                        }}
                        placeholder="0"
                      />
                      <span style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '13px',
                        color: '#6b7280',
                      }}>THB</span>
                    </div>
                    {errors.avgRoomRate && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                        {errors.avgRoomRate}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'จำนวนห้องทั้งหมด' : 'Total Rooms Available'}
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'ความจุของทรัพย์สิน' : 'Property Capacity'}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={accommodationData.totalRooms}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setAccommodationData({ ...accommodationData, totalRooms: value });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'จำนวนพนักงานทั้งหมด' : 'Total Staff'}
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'ที่พัก' : 'Accommodation'}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={accommodationData.staffCount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setAccommodationData({ ...accommodationData, staffCount: value });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* SECTION 3: F&B Module */}
          {hasFnb && (
            <SectionCard 
              title={locale === 'th' ? 'โมดูล F&B' : 'F&B Module'}
              collapsible={hasBoth}
              expanded={fnbExpanded}
              onToggle={() => setFnbExpanded(!fnbExpanded)}
            >
              {fnbExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {/* PART 2: Today-only customers */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'จำนวนลูกค้า (วันนี้)' : 'Customers (Today)'} <span style={{ color: '#ef4444' }}>*</span>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'จำนวนคน' : 'Number of customers'}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={fnbData.customers}
                      onChange={(e) => {
                        const formatted = formatInputNumber(e.target.value);
                        setFnbData({ ...fnbData, customers: formatted });
                        if (errors.customers) setErrors({ ...errors, customers: '' });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: errors.customers ? '1px solid #ef4444' : '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                      placeholder="0"
                    />
                    {errors.customers && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                        {errors.customers}
                      </div>
                    )}
                  </div>

                  {/* PART 2: Today-only average ticket */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'ค่าเฉลี่ยต่อบิล (วันนี้)' : 'Average Ticket (Today)'} <span style={{ color: '#ef4444' }}>*</span>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'THB' : 'THB'}
                      </div>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={fnbData.avgTicket}
                        onChange={(e) => {
                          const formatted = formatInputNumber(e.target.value);
                          setFnbData({ ...fnbData, avgTicket: formatted });
                          if (errors.avgTicket) setErrors({ ...errors, avgTicket: '' });
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 3rem 0.625rem 0.75rem',
                          border: errors.avgTicket ? '1px solid #ef4444' : '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          textAlign: 'right',
                        }}
                        placeholder="0"
                      />
                      <span style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '13px',
                        color: '#6b7280',
                      }}>THB</span>
                    </div>
                    {errors.avgTicket && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                        {errors.avgTicket}
                      </div>
                    )}
                  </div>

                  {/* F&B Staff (config, not daily) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'จำนวนพนักงานทั้งหมด' : 'Total Staff'}
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginTop: '0.125rem' }}>
                        {locale === 'th' ? 'F&B' : 'F&B'}
                      </div>
                    </label>
                    <input
                      type="text"
                      value={fnbData.staffCount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setFnbData({ ...fnbData, staffCount: value });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      {/* Sticky Footer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        padding: '1rem 1.5rem',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
        zIndex: 100,
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={handleCancel}
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#0a0a0a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                minWidth: '200px',
              }}
            >
              {saving 
                ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                : (locale === 'th' ? 'บันทึกและคำนวณคะแนนสุขภาพใหม่' : 'Save & Recalculate Health Score')}
            </button>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
              {locale === 'th' 
                ? 'การอัปเดตเป็นประจำช่วยเพิ่มความแม่นยำและความเชื่อมั่นของการแจ้งเตือน'
                : 'Updating regularly improves alert accuracy and confidence.'}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
