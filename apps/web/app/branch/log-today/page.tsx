/**
 * Log Today's Performance Page
 * 
 * FINAL PRODUCTION ARCHITECTURE - PART 4
 * 
 * Ultra-simple daily entry: < 30 seconds
 * Role-based inputs: Staff/Manager/Owner
 * Auto-calculates: cost, margin, trends, alerts, health score
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useUserSession } from '../../contexts/user-session-context';
import { useUserRole } from '../../contexts/user-role-context';
import { useRouteGuard } from '../../hooks/use-route-guard';
import { businessGroupService } from '../../services/business-group-service';
import { saveDailyMetric, getDailyMetrics, getTodayDailyMetric, getLastEntryDate, getTodayDateString, clearDailyMetricsCacheForBranch } from '../../services/db/daily-metrics-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { invalidateBranchState } from '../../utils/cache-invalidation';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { formatCurrency } from '../../utils/formatting';
import { safeNumber } from '../../utils/safe-number';
import { getSupabaseClient } from '../../lib/supabase/client';
import { calculateDailyFlow, type BranchSetup } from '../../services/daily-flow-service';

export default function LogTodayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const { branch } = useCurrentBranch();
  const { permissions } = useUserSession();
  const { role, isLoading: roleLoading } = useUserRole();
  const { refreshAlerts } = useHospitalityAlerts();
  
  // PART 2: Protect UI Routes - Log Today: Owner, manager, branch_manager, branch_user (not viewer)
  useRouteGuard();
  const paths = useOrgBranchPaths();

  // Additional check: redirect viewer role
  useEffect(() => {
    if (!roleLoading && role && role.canViewOnly) {
      router.push(paths.branchOverview || '/branch/overview');
    }
  }, [role, roleLoading, router, paths.branchOverview]);
  
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'recorded' | 'updated'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // PART 3: Data Entered Today indicator state
  const [dataStatus, setDataStatus] = useState<{
    status: 'green' | 'yellow' | 'red';
    message: string;
    lastMetricDate: string | null;
  } | null>(null);
  const [lastEntryDate, setLastEntryDate] = useState<string | null>(null);
  /** Today's existing record id (when loaded). Used to show we're updating, not creating. */
  const [todayRecordId, setTodayRecordId] = useState<string | null>(null);
  /** Snapshot of saved/loaded values; used to detect unsaved changes and highlight edited fields. */
  const [originalValues, setOriginalValues] = useState<{
    revenue: string;
    roomsSold: string;
    customers: string;
    top3MenuRevenue: string;
    additionalCostToday: string;
    totalRoomsAvailable: string;
    accommodationStaffCount: string;
    monthlyFixedCost: string;
    fnbStaffCount: string;
  } | null>(null);
  
  // Determine user role
  const userRole = permissions.role || 'staff';
  const isOwner = userRole === 'owner';
  const isManager = userRole === 'manager' || isOwner;
  
  // Get branch setup data
  const branchSetup = useMemo(() => {
    if (!branch || !mounted) return null;
    try {
      const branchData = businessGroupService.getBranchById(branch.id);
      return branchData || null;
    } catch (e) {
      return null;
    }
  }, [branch, mounted]);
  
  // Branch.module_type from DB determines form; no inference, no default
  const moduleType = useMemo(() => {
    if (!mounted || !branch) return null;
    const fromSetup = branchSetup?.moduleType;
    if (fromSetup === 'accommodation' || fromSetup === 'fnb') return fromSetup;
    if (branch.moduleType === 'accommodation' || branch.moduleType === 'fnb') return branch.moduleType;
    return null;
  }, [mounted, branch, branchSetup]);

  const isAccommodation = moduleType === 'accommodation';
  const isFnb = moduleType === 'fnb';
  const hasModuleConfig = moduleType !== null;
  
  // SECTION 1: Today's Data (Primary)
  const [todayData, setTodayData] = useState({
    revenue: '',
    roomsSold: '',
    customers: '',
    top3MenuRevenue: '',
    additionalCostToday: '', // Optional THB — increases daily cost
  });
  
  // SECTION 2: Optional Finance & Capacity (Advanced)
  const [financeData, setFinanceData] = useState({
    cashBalance: '',
    monthlyFixedCost: '',
    debtPayment: '',
    // Accommodation capacity fields (manager+)
    totalRoomsAvailable: branch?.totalRooms != null ? String(branch.totalRooms) : '',
    accommodationStaffCount: branch?.accommodationStaffCount != null ? String(branch.accommodationStaffCount) : '',
    // F&B capacity fields (manager+)
    fnbStaffCount: '',
  });
  const [financeExpanded, setFinanceExpanded] = useState(false);

  // Expand Advanced Finance when navigated from "Please configure hotel capacity" (?expand=finance)
  useEffect(() => {
    if (searchParams.get('expand') === 'finance') setFinanceExpanded(true);
  }, [searchParams]);
  
  // SECTION 3: System Preview (calculated after save)
  const [previewData, setPreviewData] = useState<{
    estimatedCost: number | null;
    estimatedMargin: number | null;
    occupancy: number | null;
    momentum7d: number | null;
    confidence: number | null;
  } | null>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load today's record + last entry date: pre-fill form when data exists, set status and last-entry line
  useEffect(() => {
    if (!mounted || !branch?.id) return;

    // Set originalValues early so Unsaved Changes indicator works even before async completes (or if it fails)
    const emptySnapshot = {
      revenue: '',
      roomsSold: '',
      customers: '',
      top3MenuRevenue: '',
      additionalCostToday: '',
      totalRoomsAvailable: branch.totalRooms != null ? String(branch.totalRooms) : '',
      accommodationStaffCount: branch.accommodationStaffCount != null ? String(branch.accommodationStaffCount) : '',
      monthlyFixedCost: '',
      fnbStaffCount: branch.fnbStaffCount != null ? String(branch.fnbStaffCount) : '',
    };
    setOriginalValues((prev) => prev ?? emptySnapshot);

    const fromBranch = (): void => {
      setFinanceData((prev) => ({
        ...prev,
        totalRoomsAvailable: branch.totalRooms != null ? String(branch.totalRooms) : prev.totalRoomsAvailable,
        accommodationStaffCount: branch.accommodationStaffCount != null ? String(branch.accommodationStaffCount) : prev.accommodationStaffCount,
        fnbStaffCount: branch.fnbStaffCount != null ? String(branch.fnbStaffCount) : prev.fnbStaffCount,
        monthlyFixedCost: branch.monthlyFixedCost != null ? String(branch.monthlyFixedCost) : prev.monthlyFixedCost,
      }));
    };
    fromBranch();

    // Fallback: if accommodation and branch cache has no capacity fields, fetch from DB (e.g. older cache)
    if (moduleType === 'accommodation' && (branch.totalRooms == null || branch.accommodationStaffCount == null)) {
      const supabase = getSupabaseClient();
      if (supabase) {
        supabase
          .from('branches')
          .select('total_rooms, accommodation_staff_count')
          .eq('id', branch.id)
          .maybeSingle()
          .then(({ data }) => {
            const row = data as { total_rooms?: number | null; accommodation_staff_count?: number | null } | null;
            if (row && (row.total_rooms != null || row.accommodation_staff_count != null)) {
              const tr = row.total_rooms != null ? String(row.total_rooms) : '';
              const asc = row.accommodation_staff_count != null ? String(row.accommodation_staff_count) : '';
              setFinanceData((prev) => ({
                ...prev,
                totalRoomsAvailable: tr || prev.totalRoomsAvailable,
                accommodationStaffCount: asc || prev.accommodationStaffCount,
              }));
              setOriginalValues((prev) => prev ? { ...prev, totalRoomsAvailable: tr || prev.totalRoomsAvailable, accommodationStaffCount: asc || prev.accommodationStaffCount } : null);
            }
          });
      }
    }

    const today = getTodayDateString();
    const toDateOnly = (d: string | undefined) => (d ? String(d).slice(0, 10) : '');

    (async () => {
      try {
        clearDailyMetricsCacheForBranch(branch.id);
        const branchType = moduleType === 'accommodation' ? 'accommodation' : moduleType === 'fnb' ? 'fnb' : undefined;
        let todayMetric = await getTodayDailyMetric(branch.id, branchType);
        if (!todayMetric) {
          const recent = await getDailyMetrics(branch.id, 7);
          todayMetric = recent.find((m) => toDateOnly(m.date) === today) ?? null;
        }

        if (todayMetric) {
          const rev = todayMetric.revenue != null ? String(todayMetric.revenue) : '';
          const rooms = todayMetric.roomsSold != null ? String(todayMetric.roomsSold) : '';
          const cust = todayMetric.customers != null ? String(todayMetric.customers) : '';
          const top3 = todayMetric.top3MenuRevenue != null ? String(todayMetric.top3MenuRevenue) : '';
          const addCost = todayMetric.additionalCostToday != null ? String(todayMetric.additionalCostToday) : '';
          setTodayRecordId(todayMetric.id ?? null);
          setDataStatus({
            status: 'green',
            message: locale === 'th' ? 'อัปเดตวันนี้' : 'Updated Today',
            lastMetricDate: today,
          });
          setTodayData((prev) => ({
            ...prev,
            revenue: rev,
            roomsSold: rooms,
            customers: cust,
            top3MenuRevenue: top3,
            additionalCostToday: addCost,
          }));
          setOriginalValues({
            revenue: rev,
            roomsSold: rooms,
            customers: cust,
            top3MenuRevenue: top3,
            additionalCostToday: addCost,
            totalRoomsAvailable: branch.totalRooms != null ? String(branch.totalRooms) : '',
            accommodationStaffCount: branch.accommodationStaffCount != null ? String(branch.accommodationStaffCount) : '',
            monthlyFixedCost: branch.monthlyFixedCost != null ? String(branch.monthlyFixedCost) : '',
            fnbStaffCount: branch.fnbStaffCount != null ? String(branch.fnbStaffCount) : '',
          });
        } else {
          setTodayRecordId(null);
          setOriginalValues({
            revenue: '',
            roomsSold: '',
            customers: '',
            top3MenuRevenue: '',
            additionalCostToday: '',
            totalRoomsAvailable: branch.totalRooms != null ? String(branch.totalRooms) : '',
            accommodationStaffCount: branch.accommodationStaffCount != null ? String(branch.accommodationStaffCount) : '',
            monthlyFixedCost: branch.monthlyFixedCost != null ? String(branch.monthlyFixedCost) : '',
            fnbStaffCount: branch.fnbStaffCount != null ? String(branch.fnbStaffCount) : '',
          });
          const last2 = await getDailyMetrics(branch.id, 2);
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          const yesterdayMetric = last2.find((m) => toDateOnly(m.date) === yesterdayStr);
          if (yesterdayMetric) {
            setDataStatus({
              status: 'yellow',
              message: locale === 'th' ? 'อัปเดตล่าสุด: เมื่อวาน' : 'Last Updated: Yesterday',
              lastMetricDate: yesterdayStr,
            });
          } else if (last2.length > 0) {
            const sorted = [...last2].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastMetricDate = sorted[0].date;
            const daysDiff = Math.floor((new Date().getTime() - new Date(lastMetricDate).getTime()) / (1000 * 60 * 60 * 24));
            setDataStatus({
              status: 'red',
              message: locale === 'th' ? `ไม่มีข้อมูลวันนี้ (ล่าสุด: ${daysDiff} วันก่อน)` : `No Data Entered Today (Last: ${daysDiff} days ago)`,
              lastMetricDate,
            });
          } else {
            setDataStatus({
              status: 'red',
              message: locale === 'th' ? 'ไม่มีข้อมูลวันนี้' : 'No Data Entered Today',
              lastMetricDate: null,
            });
          }
        }

        const lastDate = await getLastEntryDate(branch.id, branchType);
        setLastEntryDate(lastDate);
      } catch (e) {
        console.error('[LogToday] Failed to load today/last entry:', e);
        setDataStatus({
          status: 'red',
          message: locale === 'th' ? 'ไม่สามารถตรวจสอบสถานะ' : 'Unable to check status',
          lastMetricDate: null,
        });
        setOriginalValues((prev) => prev ?? emptySnapshot);
      }
    })();
  }, [mounted, branch?.id, locale, moduleType]);

  // Save micro-animation: recorded → after 1.5s → updated → after 3s → idle
  useEffect(() => {
    if (saveFeedback !== 'recorded') return;
    const t = window.setTimeout(() => setSaveFeedback('updated'), 1500);
    return () => clearTimeout(t);
  }, [saveFeedback]);
  useEffect(() => {
    if (saveFeedback !== 'updated') return;
    const t = window.setTimeout(() => setSaveFeedback('idle'), 3000);
    return () => clearTimeout(t);
  }, [saveFeedback]);

  // Revenue is always entered directly (no auto-calculation)
  const calculatedRevenue = useMemo(() => {
    if (todayData.revenue) {
      return safeNumber(todayData.revenue, 0);
    }
    return 0;
  }, [todayData.revenue]);
  
  // Format number input - remove commas and non-digits
  const parseInputNumber = (value: string): string => {
    return value.replace(/[^\d]/g, '');
  };

  /** True if any tracked field differs from original (saved/loaded) values. */
  const isDirty = useMemo(() => {
    if (!originalValues) return false;
    return (
      todayData.revenue !== originalValues.revenue ||
      todayData.roomsSold !== originalValues.roomsSold ||
      todayData.customers !== originalValues.customers ||
      todayData.top3MenuRevenue !== originalValues.top3MenuRevenue ||
      todayData.additionalCostToday !== originalValues.additionalCostToday ||
      financeData.totalRoomsAvailable !== originalValues.totalRoomsAvailable ||
      financeData.accommodationStaffCount !== originalValues.accommodationStaffCount ||
      financeData.monthlyFixedCost !== originalValues.monthlyFixedCost ||
      financeData.fnbStaffCount !== originalValues.fnbStaffCount
    );
  }, [originalValues, todayData, financeData]);

  const todayFields = ['revenue', 'roomsSold', 'customers', 'top3MenuRevenue', 'additionalCostToday'] as const;
  const financeFields = ['totalRoomsAvailable', 'accommodationStaffCount', 'monthlyFixedCost', 'fnbStaffCount'] as const;
  const currentValueFor = (field: keyof NonNullable<typeof originalValues>) =>
    todayFields.includes(field as any) ? (todayData as Record<string, string>)[field] : (financeData as Record<string, string>)[field];

  /** Whether this field value differs from original; use for highlight. */
  const isFieldEdited = (field: keyof NonNullable<typeof originalValues>) =>
    originalValues != null && currentValueFor(field) !== originalValues[field];

  /** Input style: error red, or edited (blue border + light blue bg), or default. */
  const inputStyleFor = (field: keyof NonNullable<typeof originalValues>, error?: string) => ({
    border: `1px solid ${error ? '#ef4444' : isFieldEdited(field) ? '#2563eb' : '#d1d5db'}`,
    ...(isFieldEdited(field) && !error ? { backgroundColor: '#f8fbff' } : {}),
  });

  // Prevent accidental navigation when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
  
  // Format number for display - add commas, no decimals; show "0" when value is 0 so saved data is visible
  const formatDisplayNumber = (value: string | number): string => {
    if (value === '' || value === undefined) return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^\d]/g, '')) : value;
    if (isNaN(num)) return '';
    if (num === 0) return '0';
    return Math.round(num).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Guard: Ensure branch exists before proceeding
    if (!branch) {
      setErrors({
        submit: locale === 'th' ? 'ไม่พบสาขา' : 'No branch selected',
      });
      return;
    }
    
    // PART 5: Validation rules based on business type
    const newErrors: Record<string, string> = {};
    
    // Revenue is always required
    if (calculatedRevenue <= 0) {
      newErrors.revenue = locale === 'th' ? 'กรุณากรอกรายได้' : 'Revenue is required';
    }
    
    // Accommodation: first-time config — Total Rooms and Accommodation Staff required when not yet set on branch
    const accommodationNeedsConfig = isAccommodation && (branch?.totalRooms == null || branch?.accommodationStaffCount == null);
    if (accommodationNeedsConfig) {
      const totalRoomsVal = safeNumber(financeData.totalRoomsAvailable, undefined);
      const staffVal = safeNumber(financeData.accommodationStaffCount, undefined);
      if (totalRoomsVal == null || totalRoomsVal <= 0) {
        newErrors.totalRoomsAvailable = locale === 'th' ? 'กรุณากรอกจำนวนห้องทั้งหมด (จำเป็นในการตั้งค่าแรก)' : 'Total Rooms Available is required on first setup';
      }
      if (staffVal == null || staffVal < 0) {
        newErrors.accommodationStaffCount = locale === 'th' ? 'กรุณากรอกจำนวนพนักงานที่พัก (จำเป็นในการตั้งค่าแรก)' : 'Accommodation Staff Count is required on first setup';
      }
      if (Object.keys(newErrors).some((k) => k === 'totalRoomsAvailable' || k === 'accommodationStaffCount')) {
        setFinanceExpanded(true);
      }
    }

    // F&B: first-time config — F&B Staff Count required when not yet set on branch
    const fnbNeedsConfig = isFnb && branch?.fnbStaffCount == null;
    if (fnbNeedsConfig) {
      const fnbStaffVal = safeNumber(financeData.fnbStaffCount, undefined);
      if (fnbStaffVal == null || fnbStaffVal < 0) {
        newErrors.fnbStaffCount = locale === 'th' ? 'กรุณากรอกจำนวนพนักงาน F&B (จำเป็นในการตั้งค่าแรก)' : 'F&B Staff Count is required on first setup';
      }
      if (newErrors.fnbStaffCount) setFinanceExpanded(true);
    }

    // Accommodation: Rooms Sold required
    if (isAccommodation && !todayData.roomsSold) {
      newErrors.roomsSold = locale === 'th' ? 'กรุณากรอกจำนวนห้องที่ขาย' : 'Rooms sold is required';
    }
    
    // Validate rooms sold doesn't exceed capacity (use branch.totalRooms from config)
    if (isAccommodation && todayData.roomsSold) {
      const roomsSoldNum = safeNumber(todayData.roomsSold, 0);
      const capacity = branch?.totalRooms ?? (branchSetup as any)?.rooms_available ?? safeNumber(financeData.totalRoomsAvailable, undefined);
      if (capacity != null && capacity > 0 && roomsSoldNum > capacity) {
        newErrors.roomsSold = locale === 'th' 
          ? `จำนวนห้องที่ขายต้องไม่เกิน ${capacity} ห้อง` 
          : `Rooms sold cannot exceed ${capacity} rooms`;
      }
      if (roomsSoldNum < 0) {
        newErrors.roomsSold = locale === 'th' ? 'จำนวนห้องที่ขายต้องมากกว่าหรือเท่ากับ 0' : 'Rooms sold must be >= 0';
      }
    }
    
    // F&B: Customers required
    if (isFnb && !todayData.customers) {
      newErrors.customers = locale === 'th' ? 'กรุณากรอกจำนวนลูกค้า' : 'Customers is required';
    }
    
    // Validate customers >= 0
    if (isFnb && todayData.customers) {
      const customersNum = safeNumber(todayData.customers, 0);
      if (customersNum < 0) {
        newErrors.customers = locale === 'th' ? 'จำนวนลูกค้าต้องมากกว่าหรือเท่ากับ 0' : 'Customers must be >= 0';
      }
    }
    
    // Top 3 Menu Revenue: Optional but must be >= 0 and cannot exceed total revenue if provided
    if (isFnb && todayData.top3MenuRevenue) {
      const top3Revenue = safeNumber(todayData.top3MenuRevenue, 0);
      if (top3Revenue < 0) {
        newErrors.top3MenuRevenue = locale === 'th' ? 'รายได้ต้องมากกว่าหรือเท่ากับ 0' : 'Revenue must be >= 0';
      } else if (calculatedRevenue > 0 && top3Revenue > calculatedRevenue) {
        newErrors.top3MenuRevenue = locale === 'th' 
          ? 'รายได้จากเมนูยอดนิยม 3 รายการต้องไม่เกินรายได้รวม' 
          : 'Top 3 menu revenue cannot exceed total revenue';
      }
    }
    // Additional Cost Today: optional, must be >= 0
    if (todayData.additionalCostToday) {
      const additionalCost = safeNumber(todayData.additionalCostToday, -1);
      if (additionalCost < 0) {
        newErrors.additionalCostToday = locale === 'th' ? 'ต้องมากกว่าหรือเท่ากับ 0' : 'Must be >= 0';
      }
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setSaving(true);
    
    try {
      const today = getTodayDateString();
      
      // PART 4: Prepare daily metric based on business type
      // branch is guaranteed to exist due to guard above
      const dailyMetric: any = {
        branchId: branch.id,
        date: today,
        revenue: calculatedRevenue, // Always required
        cost: undefined, // Will be estimated by system
        cashBalance: isOwner && financeData.cashBalance ? safeNumber(financeData.cashBalance, undefined) : undefined,
      };
      
      // Accommodation fields (rooms_available, monthly_fixed_cost, staff_count)
      if (isAccommodation) {
        dailyMetric.roomsSold = safeNumber(todayData.roomsSold, undefined);
        dailyMetric.roomsAvailable = safeNumber(financeData.totalRoomsAvailable, undefined) ?? (branchSetup as any)?.rooms_available;
        dailyMetric.monthlyFixedCost = safeNumber(financeData.monthlyFixedCost, undefined) ?? (branchSetup as any)?.monthly_fixed_cost;
        dailyMetric.accommodationStaff = safeNumber(financeData.accommodationStaffCount, undefined) ?? (branchSetup as any)?.accommodation_staff_count;
        
        // Update static capacity fields in branches table if changed
        const newTotalRooms = safeNumber(financeData.totalRoomsAvailable, undefined);
        const newStaffCount = safeNumber(financeData.accommodationStaffCount, undefined);
        
        if (
          (newTotalRooms !== undefined && newTotalRooms !== branch.totalRooms) ||
          (newStaffCount !== undefined && newStaffCount !== branch.accommodationStaffCount)
        ) {
          const supabase = getSupabaseClient();
          if (supabase) {
            const updatePayload: any = {};
            if (newTotalRooms !== undefined) updatePayload.total_rooms = newTotalRooms;
            if (newStaffCount !== undefined) updatePayload.accommodation_staff_count = newStaffCount;
            
            // Non-blocking update
            // @ts-ignore - total_rooms is added via migration but may not be in generated types yet
            supabase.from('branches').update(updatePayload).eq('id', branch.id).then(({ error }) => {
              if (error) console.error('[LogToday] Failed to update branch capacity:', error);
            });
          }
        }
      }
      
      // F&B fields (including Advanced Finance & Capacity: monthly_fixed_cost, fnb_staff)
      if (isFnb) {
        dailyMetric.customers = safeNumber(todayData.customers, undefined);
        dailyMetric.monthlyFixedCost = safeNumber(financeData.monthlyFixedCost, undefined) ?? branch?.monthlyFixedCost ?? (branchSetup as any)?.monthly_fixed_cost;
        dailyMetric.fnbStaff = safeNumber(financeData.fnbStaffCount, undefined) ?? branch?.fnbStaffCount ?? (branchSetup as any)?.fnb_staff_count;
        // Branch table update for fnb_staff_count/monthly_fixed_cost skipped until branches has those columns (run add-branch-fnb-fields.sql)
        if (todayData.top3MenuRevenue) {
          const top3Revenue = safeNumber(todayData.top3MenuRevenue, undefined);
          if (top3Revenue !== undefined && top3Revenue >= 0 && (calculatedRevenue === 0 || top3Revenue <= calculatedRevenue)) {
            dailyMetric.top3MenuRevenue = Math.round(top3Revenue);
          }
        }
      }
      // Additional cost today (optional THB) — increases daily cost
      const parsedAdditionalCost = todayData.additionalCostToday ? safeNumber(todayData.additionalCostToday, undefined) : undefined;
      dailyMetric.additionalCostToday = parsedAdditionalCost != null && parsedAdditionalCost >= 0 ? Math.round(parsedAdditionalCost) : 0;
      
      // Save to database (branch type routes to accommodation_daily_metrics vs fnb_daily_metrics)
      const saveResult = await saveDailyMetric({
        ...dailyMetric,
        branchType: moduleType === 'accommodation' ? 'accommodation' : moduleType === 'fnb' ? 'fnb' : undefined,
      });
      
      // PART 4: Validate Log Today submission
      if (process.env.NODE_ENV === 'development' && saveResult) {
        try {
          const businessGroup = businessGroupService.getBusinessGroup();
          if (businessGroup) {
            // Use setTimeout to allow database write to complete
            setTimeout(async () => {
              try {
                const { validateLogTodaySubmission } = await import('../../utils/log-today-validator');
                const validation = await validateLogTodaySubmission(
                  branch.id,
                  businessGroup.id,
                  dailyMetric,
                  { verbose: true }
                );
                if (!validation.passed) {
                  console.error('[LogToday] Validation failed:', validation.errors);
                }
              } catch (e) {
                // Don't block save if validation fails
                console.warn('[LogToday] Validation check failed:', e);
              }
            }, 500);
          }
        } catch (e) {
          // Don't block save if validation fails
          console.warn('[LogToday] Validation check failed:', e);
        }
      }
      
      // Get branch setup for calculations (occupancy uses branch.totalRooms, not daily rooms_available)
      const setup: BranchSetup = {
        monthlyFixedCost: branchSetup ? (branchSetup as any).monthly_fixed_cost : undefined,
        variableCostRatio: branchSetup ? (branchSetup as any).variable_cost_ratio : undefined,
        roomsAvailable: branch?.totalRooms ?? (branchSetup as any)?.rooms_available ?? safeNumber(financeData.totalRoomsAvailable, undefined),
        seatingCapacity: branchSetup ? (branchSetup as any).seating_capacity : undefined,
      };
      
      // Get daily metrics history for momentum calculation
      // branch is guaranteed to exist due to guard above
      const history = await getDailyMetrics(branch.id, 14);
      
      // Calculate all metrics using daily flow service
      const calculations = calculateDailyFlow(
        calculatedRevenue,
        isAccommodation ? safeNumber(todayData.roomsSold, undefined) : undefined,
        isFnb ? safeNumber(todayData.customers, undefined) : undefined,
        isOwner && financeData.cashBalance ? safeNumber(financeData.cashBalance, undefined) : undefined,
        undefined, // actualCost - will be estimated
        setup,
        history
      );
      
      setPreviewData({
        estimatedCost: calculations.estimatedCost,
        estimatedMargin: calculations.estimatedMargin,
        occupancy: calculations.occupancy ?? null,
        momentum7d: calculations.momentum7d,
        confidence: calculations.confidence,
      });
      
      setSuccess(true);
      setSaveFeedback('recorded');

      // Optimistic: set indicator to green immediately so user sees it right after save
      setDataStatus({
        status: 'green',
        message: locale === 'th' ? 'อัปเดตวันนี้' : 'Updated Today',
        lastMetricDate: today,
      });
      setLastEntryDate(today);

      // Reload today's data from DB and set originalValues so "unsaved" state resets
      clearDailyMetricsCacheForBranch(branch.id);
      const branchType = moduleType === 'accommodation' ? 'accommodation' : moduleType === 'fnb' ? 'fnb' : undefined;
      getTodayDailyMetric(branch.id, branchType).then((updated) => {
        if (updated) {
          const rev = updated.revenue != null ? String(updated.revenue) : '';
          const rooms = updated.roomsSold != null ? String(updated.roomsSold) : '';
          const cust = updated.customers != null ? String(updated.customers) : '';
          const top3 = updated.top3MenuRevenue != null ? String(updated.top3MenuRevenue) : '';
          const addCost = updated.additionalCostToday != null ? String(updated.additionalCostToday) : '';
          setTodayRecordId(updated.id ?? null);
          setTodayData((prev) => ({
            ...prev,
            revenue: rev,
            roomsSold: rooms,
            customers: cust,
            top3MenuRevenue: top3,
            additionalCostToday: addCost,
          }));
          setOriginalValues({
            revenue: rev,
            roomsSold: rooms,
            customers: cust,
            top3MenuRevenue: top3,
            additionalCostToday: addCost,
            totalRoomsAvailable: financeData.totalRoomsAvailable,
            accommodationStaffCount: financeData.accommodationStaffCount,
            monthlyFixedCost: financeData.monthlyFixedCost,
            fnbStaffCount: financeData.fnbStaffCount,
          });
        }
      });

      // GLOBAL FIXES: Trigger cache clearing and recalculation after Save Today
      // Clear stale cache and trigger health/alerts recalculation
      if (typeof window !== 'undefined' && branch?.id) {
        // Clear branch-specific cache
        invalidateBranchState(branch.id);
        
        // Clear operational signals cache
        operationalSignalsService.clearCache();
        
        // Dispatch events to trigger recalculation
        window.dispatchEvent(new Event('metricsUpdated'));
        window.dispatchEvent(new Event('forceRecalculation'));
        window.dispatchEvent(new CustomEvent('dailyMetricSaved', { detail: { branchId: branch.id } }));
        
        // Trigger alerts refresh
        if (refreshAlerts) {
          refreshAlerts().catch(err => {
            console.error('[LogToday] Failed to refresh alerts:', err);
          });
        }
      }
      
      // Don't auto-redirect - let user see the preview and navigate manually
    } catch (error: any) {
      setSaveFeedback('idle');
      setErrors({
        submit: error.message || (locale === 'th' ? 'เกิดข้อผิดพลาดในการบันทึก' : 'Failed to save metrics'),
      });
    } finally {
      setSaving(false);
    }
  };
  
  if (!mounted) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }
  
  if (!branch) {
    return (
      <PageLayout title="" subtitle="">
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

  if (hasModuleConfig === false) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={locale === 'th'
            ? 'สาขานี้ยังไม่ได้ตั้งค่า module_type (accommodation หรือ fnb) กรุณาตั้งค่าที่ Settings'
            : 'This branch has no module_type configured. Set module_type to accommodation or fnb in Settings.'}
          action={{
            label: locale === 'th' ? 'ไปที่ภาพรวม' : 'Go to Overview',
            onClick: () => router.push(paths.branchOverview || '/branch/overview'),
          }}
        />
      </PageLayout>
    );
  }
  
  return (
    <PageLayout
      title=""
      subtitle={locale === 'th' ? 'ใช้เวลาน้อยกว่า 30 วินาที' : 'Takes less than 30 seconds.'}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '2rem', position: 'relative' }}>
        {/* PART 3 & 4: Data Entered Today Indicator (Top-right) */}
        {dataStatus && (
          <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: dataStatus.status === 'green' ? '#f0fdf4' : dataStatus.status === 'yellow' ? '#fefce8' : '#fef2f2',
              border: `1px solid ${dataStatus.status === 'green' ? '#10b981' : dataStatus.status === 'yellow' ? '#eab308' : '#ef4444'}`,
              color: dataStatus.status === 'green' ? '#166534' : dataStatus.status === 'yellow' ? '#854d0e' : '#991b1b',
            }}>
              <span style={{ fontSize: '14px' }}>
                {dataStatus.status === 'green' ? '🟢' : dataStatus.status === 'yellow' ? '🟡' : '🔴'}
              </span>
              <span>{dataStatus.message}</span>
            </div>
            {lastEntryDate && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {locale === 'th' ? 'รายการล่าสุด: ' : 'Last entry: '}
                {new Date(lastEntryDate + 'T12:00:00').toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            )}
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}>
            <div>
              {locale === 'th'
                ? '✓ บันทึกสำเร็จ! ดูตัวอย่างการคำนวณด้านล่าง'
                : '✓ Saved successfully! See calculation preview below.'}
            </div>
            <button
              onClick={() => router.push(paths.branchOverview || '/branch/overview')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#059669';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#10b981';
              }}
            >
              {locale === 'th' ? 'ไปที่ภาพรวม' : 'Go to Overview'}
            </button>
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
        
        <form onSubmit={handleSubmit} data-log-today>
          {/* SECTION 1: TODAY (Primary Card) */}
          <SectionCard
            title={locale === 'th' ? 'ข้อมูลวันนี้' : "Today's Data"}
            collapsible={false}
            expanded={true}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Revenue */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                  {locale === 'th' ? 'รายได้' : 'Revenue'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={calculatedRevenue > 0 ? formatDisplayNumber(calculatedRevenue) : formatDisplayNumber(todayData.revenue)}
                    onChange={(e) => {
                      const parsed = parseInputNumber(e.target.value);
                      setTodayData({ ...todayData, revenue: parsed });
                      if (errors.revenue) setErrors({ ...errors, revenue: '' });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.625rem 3rem 0.625rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '14px',
                      textAlign: 'right',
                      ...inputStyleFor('revenue', errors.revenue),
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
                {errors.revenue && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.revenue}
                  </div>
                )}
              </div>
              
              {/* Accommodation: Number of rooms sold (required) */}
              {isAccommodation && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                    {locale === 'th' ? 'จำนวนห้องที่ขาย' : 'Number of rooms sold'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={todayData.roomsSold}
                    onChange={(e) => {
                      const parsed = parseInputNumber(e.target.value);
                      setTodayData({ ...todayData, roomsSold: parsed });
                      if (errors.roomsSold) setErrors({ ...errors, roomsSold: '' });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '14px',
                      ...inputStyleFor('roomsSold', errors.roomsSold),
                    }}
                    placeholder="0"
                  />
                  {errors.roomsSold && (
                    <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                      {errors.roomsSold}
                    </div>
                  )}
                </div>
              )}
              
              {/* F&B: Number of customers (required) */}
              {isFnb && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                    {locale === 'th' ? 'จำนวนลูกค้า' : 'Number of customers'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={todayData.customers}
                    onChange={(e) => {
                      const parsed = parseInputNumber(e.target.value);
                      setTodayData({ ...todayData, customers: parsed });
                      if (errors.customers) setErrors({ ...errors, customers: '' });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '14px',
                      ...inputStyleFor('customers', errors.customers),
                    }}
                    placeholder="0"
                  />
                  {errors.customers && (
                    <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                      {errors.customers}
                    </div>
                  )}
                </div>
              )}
              
              {/* F&B: Top 3 Menu Revenue (optional) */}
              {isFnb && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                    {locale === 'th' ? 'รายได้จากเมนูยอดนิยม 3 รายการ' : 'Revenue from Top 3 Menu'}
                    <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '0.25rem' }}>
                      ({locale === 'th' ? 'ไม่บังคับ' : 'optional'})
                    </span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={formatDisplayNumber(todayData.top3MenuRevenue)}
                      onChange={(e) => {
                        const filtered = parseInputNumber(e.target.value);
                        setTodayData({ ...todayData, top3MenuRevenue: filtered });
                        if (errors.top3MenuRevenue) setErrors({ ...errors, top3MenuRevenue: '' });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.625rem 3.5rem 0.625rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '14px',
                        textAlign: 'right',
                        ...inputStyleFor('top3MenuRevenue', errors.top3MenuRevenue),
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
                  {errors.top3MenuRevenue && (
                    <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                      {errors.top3MenuRevenue}
                    </div>
                  )}
                </div>
              )}
              
              {/* Additional Cost Today (optional THB) — both Accommodation and F&B */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                  {locale === 'th' ? 'ต้นทุนเพิ่มเติมวันนี้' : 'Additional Cost Today'}
                  <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '0.25rem' }}>
                    ({locale === 'th' ? 'ไม่บังคับ' : 'optional'})
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={formatDisplayNumber(todayData.additionalCostToday)}
                    onChange={(e) => {
                      const filtered = parseInputNumber(e.target.value);
                      setTodayData({ ...todayData, additionalCostToday: filtered });
                      if (errors.additionalCostToday) setErrors({ ...errors, additionalCostToday: '' });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.625rem 3rem 0.625rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '14px',
                      textAlign: 'right',
                      ...inputStyleFor('additionalCostToday', errors.additionalCostToday),
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
                {errors.additionalCostToday && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.additionalCostToday}
                  </div>
                )}
              </div>
              
              {/* PART 5: Hide Save button for viewer role */}
              {role && !role.canViewOnly && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    type="submit"
                    data-rbac="log-today-submit"
                    disabled={saving}
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      backgroundColor: saving ? '#9ca3af' : '#0a0a0a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving
                      ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                      : (locale === 'th' ? 'บันทึกวันนี้' : 'Save Today')}
                  </button>
                  {isDirty && (
                    <span style={{ fontSize: '13px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '14px' }}>🟡</span>
                      {locale === 'th' ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'Unsaved changes'}
                    </span>
                  )}
                </div>
              )}
              {saveFeedback === 'recorded' && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}>
                  <span style={{ color: '#166534', fontWeight: 600 }}>✓ Data recorded</span>
                  <span style={{ color: '#15803d', fontSize: '13px' }}>
                    {locale === 'th' ? 'กำลังอัปเดตข้อมูลเชิงลึก...' : 'Updating insights...'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }} aria-hidden>
                    <LoadingSpinner size={16} />
                  </span>
                </div>
              )}
              {saveFeedback === 'updated' && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                }}>
                  <span style={{ color: '#166534', fontWeight: 600 }}>✓ Insights updated</span>
                </div>
              )}
              {role && role.canViewOnly && (
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#92400e',
                  fontSize: '14px',
                }}>
                  {locale === 'th' 
                    ? 'คุณมีสิทธิ์ดูเท่านั้น ไม่สามารถบันทึกข้อมูลได้' 
                    : 'You have view-only access. You cannot save data.'}
                </div>
              )}
            </div>
          </SectionCard>
          
          {/* SECTION 2: OPTIONAL FINANCE & CAPACITY (Manager+) */}
          {isManager && (
            <SectionCard
              title={locale === 'th' ? 'การเงินและความจุขั้นสูง (ไม่บังคับ)' : 'Advanced Finance & Capacity'}
              subtitle={locale === 'th' ? 'อัปเดตเมื่อมีการเปลี่ยนแปลงเท่านั้น' : '(Optional — update only when changed)'}
              collapsible={true}
              expanded={financeExpanded}
              onToggle={() => setFinanceExpanded(!financeExpanded)}
            >
              {financeExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}>
                    {locale === 'th'
                      ? 'หากไม่กรอก ระบบจะประมาณการอัตโนมัติ'
                      : 'If skipped, system estimates automatically.'}
                  </div>
                  
                  {/* Cash Balance (Owner Only) */}
                  {isOwner && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                        {locale === 'th' ? 'อัปเดตยอดเงินสด' : 'Update Cash Balance'}
                      </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={formatDisplayNumber(financeData.cashBalance)}
                        onChange={(e) => {
                          const parsed = parseInputNumber(e.target.value);
                          setFinanceData({ ...financeData, cashBalance: parsed });
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 3rem 0.625rem 0.75rem',
                          border: '1px solid #d1d5db',
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
                    </div>
                  )}
                  
                  {/* Monthly Fixed Cost (Manager+) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                      {locale === 'th' ? 'อัปเดตต้นทุนคงที่รายเดือน' : 'Update Monthly Fixed Cost'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={formatDisplayNumber(financeData.monthlyFixedCost)}
                        onChange={(e) => {
                          const parsed = parseInputNumber(e.target.value);
                          setFinanceData({ ...financeData, monthlyFixedCost: parsed });
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 3rem 0.625rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '14px',
                          textAlign: 'right',
                          ...inputStyleFor('monthlyFixedCost'),
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
                  
                  {/* Debt Payment (Owner Only) */}
                  {isOwner && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                        {locale === 'th' ? 'อัปเดตการชำระหนี้รายเดือน' : 'Update Debt Payment'}
                      </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={formatDisplayNumber(financeData.debtPayment)}
                        onChange={(e) => {
                          const parsed = parseInputNumber(e.target.value);
                          setFinanceData({ ...financeData, debtPayment: parsed });
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 3rem 0.625rem 0.75rem',
                          border: '1px solid #d1d5db',
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
                    </div>
                  )}
                  
                  {/* Accommodation Capacity Fields (Manager+) — required on first setup */}
                  {isAccommodation && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                          {locale === 'th' ? 'จำนวนห้องทั้งหมด' : 'Total Rooms Available'}
                          {(branch?.totalRooms == null && branch?.accommodationStaffCount == null) ? (
                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 500, marginLeft: '0.25rem' }}>
                              ({locale === 'th' ? 'จำเป็นในการตั้งค่าแรก' : 'required on first setup'})
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '0.25rem' }}>
                              ({locale === 'th' ? 'แก้ไขได้เมื่อต้องการ' : 'edit when needed'})
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={financeData.totalRoomsAvailable}
                          onChange={(e) => {
                            const parsed = parseInputNumber(e.target.value);
                            setFinanceData({ ...financeData, totalRoomsAvailable: parsed });
                            if (errors.totalRoomsAvailable) setErrors((prev) => ({ ...prev, totalRoomsAvailable: '' }));
                          }}
                          style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '14px',
                            ...inputStyleFor('totalRoomsAvailable', errors.totalRoomsAvailable),
                          }}
                          placeholder="0"
                        />
                        {errors.totalRoomsAvailable && (
                          <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>{errors.totalRoomsAvailable}</div>
                        )}
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                          {locale === 'th' ? 'จำนวนพนักงานที่พัก' : 'Accommodation Staff Count'}
                          {(branch?.totalRooms == null && branch?.accommodationStaffCount == null) ? (
                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 500, marginLeft: '0.25rem' }}>
                              ({locale === 'th' ? 'จำเป็นในการตั้งค่าแรก' : 'required on first setup'})
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '0.25rem' }}>
                              ({locale === 'th' ? 'แก้ไขได้เมื่อต้องการ' : 'edit when needed'})
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={financeData.accommodationStaffCount}
                          onChange={(e) => {
                            const parsed = parseInputNumber(e.target.value);
                            setFinanceData({ ...financeData, accommodationStaffCount: parsed });
                            if (errors.accommodationStaffCount) setErrors((prev) => ({ ...prev, accommodationStaffCount: '' }));
                          }}
                          style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '14px',
                            ...inputStyleFor('accommodationStaffCount', errors.accommodationStaffCount),
                          }}
                          placeholder="0"
                        />
                        {errors.accommodationStaffCount && (
                          <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>{errors.accommodationStaffCount}</div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {/* F&B Capacity Fields (Manager+) — required on first setup */}
                  {isFnb && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '0.375rem' }}>
                        {locale === 'th' ? 'จำนวนพนักงาน F&B' : 'F&B Staff Count'}
                        {(branch?.fnbStaffCount == null)
                          ? (
                              <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 500, marginLeft: '0.25rem' }}>
                                ({locale === 'th' ? 'จำเป็นในการตั้งค่าแรก' : 'required on first setup'})
                              </span>
                            )
                          : (
                              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '0.25rem' }}>
                                ({locale === 'th' ? 'แก้ไขได้เมื่อต้องการ' : 'edit when needed'})
                              </span>
                            )}
                      </label>
                      <input
                        type="text"
                        value={financeData.fnbStaffCount}
                        onChange={(e) => {
                          const parsed = parseInputNumber(e.target.value);
                          setFinanceData({ ...financeData, fnbStaffCount: parsed });
                          if (errors.fnbStaffCount) setErrors((prev) => ({ ...prev, fnbStaffCount: '' }));
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '14px',
                          ...inputStyleFor('fnbStaffCount', errors.fnbStaffCount),
                        }}
                        placeholder="0"
                      />
                      {errors.fnbStaffCount && (
                        <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>{errors.fnbStaffCount}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}
        </form>
        
        {/* SECTION 3: SYSTEM PREVIEW (Auto after Save) */}
        {previewData && (
          <SectionCard
            title={locale === 'th' ? 'ตัวอย่างการคำนวณ' : 'System Preview'}
            collapsible={false}
            expanded={true}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1.5rem',
            }}>
              {previewData.estimatedCost !== null && (
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'ต้นทุนโดยประมาณ' : 'Estimated Cost'}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a' }}>
                    ฿{formatCurrency(previewData.estimatedCost)}
                  </div>
                </div>
              )}
              
              {previewData.estimatedMargin !== null && (
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'กำไรโดยประมาณ' : 'Estimated Margin'}
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: previewData.estimatedMargin >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    ฿{formatCurrency(previewData.estimatedMargin)}
                  </div>
                </div>
              )}
              
              {previewData.occupancy !== null && (
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy'}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a' }}>
                    {previewData.occupancy.toFixed(1)}%
                  </div>
                </div>
              )}
              
              {previewData.momentum7d !== null && (
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'โมเมนตัม 7 วัน' : '7-day Momentum'}
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: previewData.momentum7d >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    {previewData.momentum7d >= 0 ? '+' : ''}{previewData.momentum7d.toFixed(1)}%
                  </div>
                </div>
              )}
              
              {previewData.confidence !== null && (
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {locale === 'th' ? 'ความมั่นใจ' : 'Confidence'}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a' }}>
                    {previewData.confidence}%
                  </div>
                </div>
              )}
            </div>
            
            {/* Explanation */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#6b7280',
            }}>
              {locale === 'th'
                ? 'ระบบจะคำนวณค่าเหล่านี้จากข้อมูลที่คุณกรอกและข้อมูลประวัติ'
                : 'System calculates these values from your input and historical data.'}
            </div>
          </SectionCard>
        )}
        
      </div>
    </PageLayout>
  );
}
