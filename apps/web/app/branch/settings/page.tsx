/**
 * Branch Settings Page - Modern Configuration Layout
 * 
 * 3 sections: Branch Identity → Monitoring Configuration → User Access
 */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useI18n } from '../../hooks/use-i18n';
import { useSettings } from '../../hooks/use-settings';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useMonitoring } from '../../hooks/use-monitoring';
import { useUserSession } from '../../contexts/user-session-context';
import { useUserRole } from '../../contexts/user-role-context';
import { useRouteGuard } from '../../hooks/use-route-guard';
import { businessGroupService } from '../../services/business-group-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { Toast } from '../../components/toast';
import { ModuleType, BranchBusinessType, migrateBusinessTypeToModules } from '../../models/business-group';
import { updateBranchMonitoringEnabled, updateBranchAlertSensitivity, getBranchMonitoringSettings, type AlertSensitivity } from '../../services/db/branch-monitoring-service';
import { getLastUpdatedDate, getDataCoverageDays } from '../../services/db/branch-metrics-info-service';
import { invalidateBranchState } from '../../utils/cache-invalidation';
import { monitoringService } from '../../services/monitoring-service';
import { useBusinessSetup } from '../../contexts/business-setup-context';
import { useSystemValidation } from '../../hooks/use-system-validation';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { logRbacAudit } from '../../utils/rbac-audit';
import { getAccommodationMonthlyFixedCost, setAccommodationMonthlyFixedCost } from '../../services/db/daily-metrics-service';
import { getProvinceFromZip, isValidThaiZip } from '../../utils/thai-zip-province';
import { updateBranchLocationInSupabase } from '../../services/db/branch-location-service';

export default function BranchSettingsPage() {
  const { locale } = useI18n();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const { branch } = useCurrentBranch();
  const { status: monitoringStatus } = useMonitoring();
  const { permissions } = useUserSession();
  const { role, isLoading: roleLoading } = useUserRole();
  
  useRouteGuard();
  const paths = useOrgBranchPaths();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });
  
  // Branch editing
  const [branchName, setBranchName] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [businessType, setBusinessType] = useState<BranchBusinessType | ''>('');
  const [modules, setModules] = useState<ModuleType[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Monitoring configuration
  const [monitoringActive, setMonitoringActive] = useState(true);
  const [alertSensitivity, setAlertSensitivity] = useState<AlertSensitivity>('medium');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [coverageDays, setCoverageDays] = useState<number>(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const { setup } = useBusinessSetup();
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Branch members & invite (RBAC). email is for display; user_id remains source of truth.
  const [branchMembers, setBranchMembers] = useState<Array<{ user_id: string; role: string; email: string | null; created_at: string }>>([]);
  const [loadingBranchMembers, setLoadingBranchMembers] = useState(false);
  const [branchInviteEmail, setBranchInviteEmail] = useState('');
  const [branchInviteRole, setBranchInviteRole] = useState<'owner' | 'manager' | 'staff'>('staff');
  const [branchInviteLoading, setBranchInviteLoading] = useState(false);
  const [branchInviteResult, setBranchInviteResult] = useState<{ link: string; emailSent?: boolean; emailError?: string } | null>(null);
  const [branchInviteError, setBranchInviteError] = useState<string | null>(null);
  const [pendingBranchInvitations, setPendingBranchInvitations] = useState<Array<{ id: string; email: string; role: string; expires_at: string; token?: string | null }>>([]);
  const [loadingBranchInvitations, setLoadingBranchInvitations] = useState(false);

  // Owner-only: Monthly Fixed Cost (accommodation) — Finance Setup
  const isOwnerOrSuperAdmin = role?.isSuperAdmin === true || role?.effectiveRole === 'owner';
  const isAccommodationBranch = branch?.modules?.includes(ModuleType.ACCOMMODATION) === true;
  const [ownerMonthlyFixedCost, setOwnerMonthlyFixedCost] = useState<string>('');
  const [ownerFinanceSaving, setOwnerFinanceSaving] = useState(false);
  const [ownerFinanceLoaded, setOwnerFinanceLoaded] = useState(false);

  const loadBranchMembers = useCallback(async () => {
    if (!branch?.id || !isSupabaseAvailable()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoadingBranchMembers(true);
    const { data } = await supabase
      .from('branch_members')
      .select('user_id, role, email, created_at')
      .eq('branch_id', branch.id)
      .order('created_at', { ascending: false });
    setBranchMembers((data ?? []) as Array<{ user_id: string; role: string; email: string | null; created_at: string }>);
    setLoadingBranchMembers(false);
  }, [branch?.id]);

  const canFetchBranchInvitations =
    branch?.id &&
    role &&
    role.effectiveRole !== 'staff';

  const loadPendingBranchInvitations = useCallback(async () => {
    if (!canFetchBranchInvitations || !isSupabaseAvailable()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoadingBranchInvitations(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, role, expires_at, token')
        .eq('invited_by', user.id)
        .eq('branch_id', branch!.id)
        .eq('accepted', false)
        .order('created_at', { ascending: false });
      if (error) return;
      setPendingBranchInvitations((data ?? []) as Array<{ id: string; email: string; role: string; expires_at: string; token: string }>);
    } catch {
      // Suppress 403 and other errors for invitations fetch
    } finally {
      setLoadingBranchInvitations(false);
    }
  }, [branch?.id, canFetchBranchInvitations]);

  useEffect(() => {
    if (branch?.id && role?.canEditBranch) {
      loadBranchMembers();
      if (canFetchBranchInvitations) loadPendingBranchInvitations();
      else setPendingBranchInvitations([]);
    } else {
      setBranchMembers([]);
      setPendingBranchInvitations([]);
    }
  }, [branch?.id, role?.canEditBranch, canFetchBranchInvitations, loadBranchMembers, loadPendingBranchInvitations]);

  // Load Monthly Fixed Cost for Owner Settings (accommodation only)
  useEffect(() => {
    if (!branch?.id || !isOwnerOrSuperAdmin || !isAccommodationBranch) {
      setOwnerFinanceLoaded(true);
      return;
    }
    getAccommodationMonthlyFixedCost(branch.id).then((val) => {
      setOwnerMonthlyFixedCost(val != null ? String(val) : '');
      setOwnerFinanceLoaded(true);
    });
  }, [branch?.id, isOwnerOrSuperAdmin, isAccommodationBranch]);

  // Derive business type from modules
  const modulesToBusinessType = useMemo(() => {
    if (modules.length === 0) return '';
    if (modules.includes(ModuleType.ACCOMMODATION) && modules.includes(ModuleType.FNB)) {
      return BranchBusinessType.HOTEL_WITH_CAFE;
    }
    if (modules.includes(ModuleType.ACCOMMODATION)) {
      return BranchBusinessType.HOTEL_RESORT;
    }
    if (modules.includes(ModuleType.FNB)) {
      return BranchBusinessType.CAFE_RESTAURANT;
    }
    return '';
  }, [modules]);

  // Load monitoring settings and metrics info
  useEffect(() => {
    if (!mounted || !branch?.id) return;
    
    const loadMonitoringSettings = async () => {
      try {
        const settings = await getBranchMonitoringSettings(branch.id);
        if (settings.monitoringEnabled !== null) {
          setMonitoringActive(settings.monitoringEnabled);
        }
        if (settings.alertSensitivity) {
          setAlertSensitivity(settings.alertSensitivity);
        }
      } catch (err) {
        console.error('[Settings] Failed to load monitoring settings:', err);
      }
    };
    
    const loadMetricsInfo = async () => {
      try {
        const [lastUpdatedResult, coverageResult] = await Promise.all([
          getLastUpdatedDate(branch.id),
          getDataCoverageDays(branch.id, (branch as { moduleType?: 'accommodation' | 'fnb' }).moduleType),
        ]);
        if (lastUpdatedResult.lastUpdated) {
          setLastUpdated(lastUpdatedResult.lastUpdated);
        }
        if (coverageResult.coverageDays !== undefined) {
          setCoverageDays(coverageResult.coverageDays);
        }
      } catch (err) {
        console.error('[Settings] Failed to load metrics info:', err);
      }
    };
    
    loadMonitoringSettings();
    loadMetricsInfo();
  }, [mounted, branch?.id]);

  useEffect(() => {
    setMounted(true);
    if (branch) {
      setBranchName(branch.branchName);
      setCity(branch.location?.city || '');
      setZipCode(branch.location?.zipCode || '');
      const branchModules = branch.modules || [ModuleType.FNB];
      setModules(branchModules);
      // Derive business type from modules
      if (branchModules.includes(ModuleType.ACCOMMODATION) && branchModules.includes(ModuleType.FNB)) {
        setBusinessType(BranchBusinessType.HOTEL_WITH_CAFE);
      } else if (branchModules.includes(ModuleType.ACCOMMODATION)) {
        setBusinessType(BranchBusinessType.HOTEL_RESORT);
      } else if (branchModules.includes(ModuleType.FNB)) {
        setBusinessType(BranchBusinessType.CAFE_RESTAURANT);
      } else {
        setBusinessType(BranchBusinessType.CAFE_RESTAURANT); // Default
      }
      setLoading(false);
    }
  }, [branch]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!branchName.trim()) {
      newErrors.branchName = locale === 'th' ? 'ชื่อสาขาไม่สามารถว่างได้' : 'Branch name is required';
    } else if (branchName.trim().length < 2) {
      newErrors.branchName = locale === 'th' ? 'ชื่อสาขาต้องมีอย่างน้อย 2 ตัวอักษร' : 'Branch name must be at least 2 characters';
    }
    
    if (!businessType || (businessType as string) === '') {
      newErrors.businessType = locale === 'th' ? 'ต้องเลือกประเภทธุรกิจ' : 'Business type is required';
    }
    
    if (!modules || modules.length === 0) {
      newErrors.modules = locale === 'th' ? 'ต้องเลือกอย่างน้อยหนึ่งโมดูล' : 'At least one module must be selected';
    }

    if (!zipCode.trim()) {
      newErrors.zipCode = locale === 'th' ? 'กรุณากรอกรหัสไปรษณีย์' : 'Zip code is required';
    } else if (!isValidThaiZip(zipCode.trim())) {
      newErrors.zipCode = locale === 'th' ? 'รหัสไปรษณีย์ไม่ถูกต้อง' : 'Invalid ZIP code';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm() || !branch) return;
    
    try {
      setSaving(true);
      
      // Get previous modules to detect changes
      const previousModules = branch.modules || [];
      const modulesChanged = JSON.stringify(previousModules.sort()) !== JSON.stringify(modules.sort());
      
      const zipTrimmed = zipCode.trim();
      const resolvedProvince = zipTrimmed ? getProvinceFromZip(zipTrimmed, locale) ?? undefined : undefined;
      const cityTrimmed = city.trim() || undefined;

      // Update local state (business group / localStorage)
      businessGroupService.updateBranch(branch.id, {
        branchName: branchName.trim(),
        modules,
        location: {
          ...branch.location,
          city: cityTrimmed,
          zipCode: zipTrimmed || undefined,
          province: resolvedProvince,
        },
      });

      // PATCH Supabase: only valid columns, no empty/undefined (avoids 400)
      const patchResult = await updateBranchLocationInSupabase(branch.id, {
        zipCode: zipTrimmed || null,
        province: resolvedProvince ?? null,
        city: cityTrimmed ?? null,
      });
      if (!patchResult.success) {
        showToast(patchResult.error || (locale === 'th' ? 'อัปเดตตำแหน่งไม่สำเร็จ' : 'Failed to update location'), 'error');
        setSaving(false);
        return;
      }
      
      // If modules changed, clear metrics for disabled modules
      if (modulesChanged && branch) {
        try {
          const businessGroup = businessGroupService.getBusinessGroup();
          if (businessGroup) {
            const latestMetrics = operationalSignalsService.getLatestMetrics(branch.id, businessGroup.id);
            if (latestMetrics) {
              // Remove disabled module metrics
              const updatedMetrics = { ...latestMetrics };
              if (!modules.includes(ModuleType.ACCOMMODATION) && updatedMetrics.modules.accommodation) {
                delete updatedMetrics.modules.accommodation;
              }
              if (!modules.includes(ModuleType.FNB) && updatedMetrics.modules.fnb) {
                delete updatedMetrics.modules.fnb;
              }
              // Save updated metrics
              operationalSignalsService.saveMetrics(updatedMetrics);
            }
          }
        } catch (metricsError) {
          console.error('Failed to clear disabled module metrics:', metricsError);
          // Don't fail the save operation if metrics clearing fails
        }
      }
      
      // Trigger reload
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('organizationChanged'));
      window.dispatchEvent(new CustomEvent('metricsUpdated'));
      
      setIsEditing(false);
      showToast(locale === 'th' ? 'บันทึกการตั้งค่าสาขาสำเร็จ' : 'Branch settings saved');
    } catch (err) {
      console.error('Failed to save branch settings:', err);
      showToast(locale === 'th' ? 'ไม่สามารถบันทึกการตั้งค่าได้' : 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (branch) {
      setBranchName(branch.branchName);
      setCity(branch.location?.city || '');
      setZipCode(branch.location?.zipCode || '');
      const branchModules = branch.modules || [ModuleType.FNB];
      setModules(branchModules);
      // Reset business type from modules
      if (branchModules.includes(ModuleType.ACCOMMODATION) && branchModules.includes(ModuleType.FNB)) {
        setBusinessType(BranchBusinessType.HOTEL_WITH_CAFE);
      } else if (branchModules.includes(ModuleType.ACCOMMODATION)) {
        setBusinessType(BranchBusinessType.HOTEL_RESORT);
      } else if (branchModules.includes(ModuleType.FNB)) {
        setBusinessType(BranchBusinessType.CAFE_RESTAURANT);
      } else {
        setBusinessType(BranchBusinessType.CAFE_RESTAURANT);
      }
    }
    setIsEditing(false);
    setErrors({});
  };

  const handleSaveOwnerMonthlyFixedCost = async () => {
    if (!branch?.id || !isAccommodationBranch) return;
    const num = Number(ownerMonthlyFixedCost.replace(/\D/g, ''));
    if (Number.isNaN(num) || num < 0) {
      showToast(locale === 'th' ? 'กรุณากรอกตัวเลขที่ถูกต้อง' : 'Please enter a valid number', 'error');
      return;
    }
    setOwnerFinanceSaving(true);
    try {
      const result = await setAccommodationMonthlyFixedCost(branch.id, num);
      if (result.ok) {
        showToast(locale === 'th' ? 'บันทึกต้นทุนคงที่รายเดือนแล้ว' : 'Monthly Fixed Cost saved');
        invalidateBranchState(branch.id);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aurasea:metrics-saved', { detail: { branchId: branch.id } }));
        }
      } else {
        showToast(result.error || (locale === 'th' ? 'บันทึกไม่สำเร็จ' : 'Save failed'), 'error');
      }
    } catch (e) {
      showToast(locale === 'th' ? 'บันทึกไม่สำเร็จ' : 'Save failed', 'error');
    } finally {
      setOwnerFinanceSaving(false);
    }
  };

  // Handle business type change - updates modules and clears disabled module metrics
  const handleBusinessTypeChange = (newBusinessType: BranchBusinessType) => {
    setBusinessType(newBusinessType);
    const newModules = migrateBusinessTypeToModules(newBusinessType);
    setModules(newModules);
    
    // Clear errors
    if (errors.businessType) {
      setErrors({ ...errors, businessType: '' });
    }
    if (errors.modules) {
      setErrors({ ...errors, modules: '' });
    }
    
    // Clear metrics for disabled modules (if branch exists and we're editing)
    if (branch && isEditing) {
      try {
        const businessGroup = businessGroupService.getBusinessGroup();
        if (businessGroup) {
          const latestMetrics = operationalSignalsService.getLatestMetrics(branch.id, businessGroup.id);
          if (latestMetrics) {
            const updatedMetrics = { ...latestMetrics };
            // Remove accommodation metrics if not in new modules
            if (!newModules.includes(ModuleType.ACCOMMODATION) && updatedMetrics.modules.accommodation) {
              delete updatedMetrics.modules.accommodation;
            }
            // Remove fnb metrics if not in new modules
            if (!newModules.includes(ModuleType.FNB) && updatedMetrics.modules.fnb) {
              delete updatedMetrics.modules.fnb;
            }
            // Save updated metrics immediately
            operationalSignalsService.saveMetrics(updatedMetrics);
          }
        }
      } catch (metricsError) {
        console.error('Failed to clear disabled module metrics:', metricsError);
        // Don't fail the operation if metrics clearing fails
      }
    }
  };

  const handleDeleteBranch = async () => {
    if (!branch) return;
    
    try {
      businessGroupService.deleteBranch(branch.id);
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('organizationChanged'));
      showToast(locale === 'th' ? 'ลบสาขาสำเร็จ' : 'Branch deleted successfully');
      router.push(paths.companyOverview || '/group/overview');
    } catch (err) {
      console.error('Failed to delete branch:', err);
      showToast(locale === 'th' ? 'ไม่สามารถลบสาขาได้' : 'Failed to delete branch', 'error');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  // Handle monitoring toggle
  const handleMonitoringToggle = async (enabled: boolean) => {
    if (!branch?.id) return;
    
    setMonitoringLoading(true);
    try {
      const result = await updateBranchMonitoringEnabled(branch.id, enabled);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update monitoring status');
      }
      
      setMonitoringActive(enabled);
      
      if (enabled) {
        // PART 1: Toggled ON: Trigger recalculation
        // 1. Invalidate branch state to force fresh calculation
        invalidateBranchState(branch.id);
        
        // 2. Clear operational signals cache
        if (operationalSignalsService && typeof operationalSignalsService.clearCache === 'function') {
          operationalSignalsService.clearCache();
        }
        
        // 3. Trigger alerts refresh (recalculate health and refresh alerts)
        if (setup.isCompleted) {
          try {
            await monitoringService.evaluate(setup, {
              businessType: null,
              scenario: null,
              version: 1,
            });
          } catch (err) {
            console.error('[Settings] Failed to refresh alerts:', err);
          }
        }
        
        // 4. Dispatch events to trigger recalculation
        window.dispatchEvent(new Event('metricsUpdated'));
        window.dispatchEvent(new Event('forceRecalculation'));
        
        showToast(locale === 'th' ? 'เปิดใช้งานการติดตามแล้ว' : 'Monitoring enabled', 'success');
      } else {
        // PART 1: Toggled OFF: Stop alert engine
        // 1. Invalidate branch state
        invalidateBranchState(branch.id);
        
        // 2. Clear alerts for this branch
        if (typeof window !== 'undefined') {
          // Clear all alert-related cache for this branch
          const alertKeys = Object.keys(localStorage).filter(key => 
            key.startsWith('alerts_') || 
            key.startsWith('branch_alerts_') ||
            key.includes(`_${branch.id}`) ||
            key.includes(`branch_${branch.id}`)
          );
          alertKeys.forEach(key => localStorage.removeItem(key));
        }
        
        // 3. Clear operational signals cache
        if (operationalSignalsService && typeof operationalSignalsService.clearCache === 'function') {
          operationalSignalsService.clearCache();
        }
        
        // 4. Dispatch events to notify other components
        window.dispatchEvent(new CustomEvent('alertsCleared', { detail: { branchId: branch.id } }));
        window.dispatchEvent(new Event('metricsUpdated'));
        
        showToast(locale === 'th' ? 'ระงับการติดตามแล้ว' : 'Monitoring disabled', 'success');
      }
    } catch (err: any) {
      console.error('[Settings] Failed to toggle monitoring:', err);
      showToast(err.message || (locale === 'th' ? 'ไม่สามารถอัปเดตสถานะได้' : 'Failed to update status'), 'error');
      // Revert state on error
      setMonitoringActive(!enabled);
    } finally {
      setMonitoringLoading(false);
    }
  };

  // Handle alert sensitivity change
  const handleAlertSensitivityChange = async (sensitivity: AlertSensitivity) => {
    if (!branch?.id) return;
    
    setMonitoringLoading(true);
    try {
      const result = await updateBranchAlertSensitivity(branch.id, sensitivity);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update alert sensitivity');
      }
      
      setAlertSensitivity(sensitivity);
      
      // Trigger recalculation with new sensitivity
      invalidateBranchState(branch.id);
      if (operationalSignalsService && typeof operationalSignalsService.clearCache === 'function') {
        operationalSignalsService.clearCache();
      }
      
      if (setup.isCompleted) {
        try {
          await monitoringService.evaluate(setup, {
            businessType: null,
            scenario: null,
            version: 1,
          });
        } catch (err) {
          console.error('[Settings] Failed to refresh alerts:', err);
        }
      }
      
      window.dispatchEvent(new Event('metricsUpdated'));
      window.dispatchEvent(new Event('forceRecalculation'));
      showToast(locale === 'th' ? 'อัปเดตความไวในการแจ้งเตือนแล้ว' : 'Alert sensitivity updated', 'success');
    } catch (err: any) {
      console.error('[Settings] Failed to update alert sensitivity:', err);
      showToast(err.message || (locale === 'th' ? 'ไม่สามารถอัปเดตได้' : 'Failed to update'), 'error');
      // Revert state on error - reload from DB
      const settings = await getBranchMonitoringSettings(branch.id);
      if (settings.alertSensitivity) {
        setAlertSensitivity(settings.alertSensitivity);
      }
    } finally {
      setMonitoringLoading(false);
    }
  };

  // Get coverage status color
  const getCoverageStatus = () => {
    if (coverageDays === 0) return { color: '#ef4444', label: locale === 'th' ? 'ไม่มีข้อมูล' : 'No Data' };
    if (coverageDays >= 7) return { color: '#10b981', label: locale === 'th' ? 'ดี' : 'Good' };
    return { color: '#f59e0b', label: locale === 'th' ? 'ต่ำ' : 'Low' };
  };

  const getBusinessTypeLabel = (type: BranchBusinessType): string => {
    const labels: Record<BranchBusinessType, { en: string; th: string }> = {
      [BranchBusinessType.CAFE_RESTAURANT]: { en: 'Café / Restaurant', th: 'คาเฟ่ / ร้านอาหาร' },
      [BranchBusinessType.HOTEL_RESORT]: { en: 'Hotel / Resort', th: 'โรงแรม / รีสอร์ท' },
      [BranchBusinessType.HOTEL_WITH_CAFE]: { en: 'Hotel with Café', th: 'โรงแรมพร้อมคาเฟ่' },
    };
    return labels[type]?.[locale] || type;
  };


  const canModifyAccess = role?.canEditBranch ?? (permissions.role === 'owner' || permissions.role === 'admin');

  if (!mounted) {
    return (
      <PageLayout title="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (loading) {
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

  return (
    <PageLayout title="">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem', color: '#0a0a0a' }}>
              {locale === 'th' ? 'ยืนยันการลบสาขา' : 'Confirm Branch Deletion'}
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              {locale === 'th' 
                ? 'การดำเนินการนี้จะลบข้อมูลการติดตามสาขาอย่างถาวร คุณต้องการดำเนินการต่อหรือไม่?'
                : 'This action permanently deletes branch monitoring data. Continue?'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
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
                {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button
                onClick={handleDeleteBranch}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {locale === 'th' ? 'ลบสาขา' : 'Delete Branch'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* SECTION 1: Branch Identity — compact 2-col grid */}
        <SectionCard title={locale === 'th' ? 'ข้อมูลประจำตัวสาขา' : 'Branch Identity'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {/* Branch Name */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'ชื่อสาขา' : 'Branch Name'} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={branchName}
                    onChange={(e) => { setBranchName(e.target.value); if (errors.branchName) setErrors({ ...errors, branchName: '' }); }}
                    placeholder={locale === 'th' ? 'กรอกชื่อสาขา' : 'Enter branch name'}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.625rem',
                      border: `1px solid ${errors.branchName ? '#ef4444' : '#d1d5db'}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  />
                  {errors.branchName && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '0.2rem' }}>{errors.branchName}</div>}
                </>
              ) : (
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0a0a0a', padding: '0.5rem 0', minHeight: '2rem', display: 'flex', alignItems: 'center' }}>
                  {branch.branchName}
                </div>
              )}
            </div>

            {/* Business Type */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'ประเภทธุรกิจ' : 'Business Type'}
              </label>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#0a0a0a', padding: '0.5rem 0', minHeight: '2rem', display: 'flex', alignItems: 'center' }}>
                {businessType ? getBusinessTypeLabel(businessType as BranchBusinessType) : (locale === 'th' ? 'ไม่ระบุ' : 'Not specified')}
              </div>
            </div>

            {/* City */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'เมือง' : 'City'}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={locale === 'th' ? 'กรอกชื่อเมือง' : 'Enter city name'}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.625rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                />
              ) : (
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', padding: '0.5rem 0', minHeight: '2rem', display: 'flex', alignItems: 'center' }}>
                  {branch.location?.city || (locale === 'th' ? 'ไม่ระบุ' : 'Not specified')}
                </div>
              )}
            </div>

            {/* Zip Code + Province */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'รหัสไปรษณีย์' : 'Zip Code'} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={zipCode}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      setZipCode(v);
                      if (errors.zipCode) setErrors({ ...errors, zipCode: '' });
                    }}
                    placeholder="30000"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.625rem',
                      border: `1px solid ${errors.zipCode ? '#ef4444' : '#d1d5db'}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  />
                  {zipCode.trim() && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.2rem' }}>
                      {getProvinceFromZip(zipCode.trim(), locale) ?? (locale === 'th' ? 'ไม่พบจังหวัด' : 'Unknown province')}
                    </div>
                  )}
                  {errors.zipCode && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '0.2rem' }}>{errors.zipCode}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0a0a0a', padding: '0.5rem 0 0', minHeight: '1.5rem', display: 'flex', alignItems: 'center' }}>
                    {branch.location?.zipCode || (locale === 'th' ? 'ไม่ระบุ' : 'Not specified')}
                  </div>
                  {branch.location?.province && (
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{branch.location.province}</div>
                  )}
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#0a0a0a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {locale === 'th' ? 'แก้ไข' : 'Edit'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: saving ? '#9ca3af' : '#0a0a0a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (locale === 'th' ? 'บันทึกการเปลี่ยนแปลง' : 'Save Changes')}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ffffff',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                </button>
              </>
            )}
          </div>
        </SectionCard>

        {/* Owner Settings → Finance Setup (owner/super_admin + accommodation only) */}
        {isOwnerOrSuperAdmin && isAccommodationBranch && (
          <SectionCard title={locale === 'th' ? 'การตั้งค่าทางการเงิน (เจ้าของ)' : 'Finance Setup (Owner)'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                  {locale === 'th' ? 'ต้นทุนคงที่รายเดือน (บาท)' : 'Monthly Fixed Cost (THB)'}
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {locale === 'th'
                    ? 'รวมเงินเดือนพนักงานทั้งหมด กำหนดโดยเจ้าของเท่านั้น'
                    : 'Total staff salary expense. Configured by owner only.'}
                </p>
                {ownerFinanceLoaded ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={ownerMonthlyFixedCost.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      onChange={(e) => setOwnerMonthlyFixedCost(e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      style={{
                        width: '200px',
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        textAlign: 'right',
                      }}
                    />
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>THB</span>
                    <button
                      type="button"
                      onClick={handleSaveOwnerMonthlyFixedCost}
                      disabled={ownerFinanceSaving}
                      style={{
                        padding: '0.625rem 1.25rem',
                        backgroundColor: ownerFinanceSaving ? '#9ca3af' : '#0a0a0a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: ownerFinanceSaving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {ownerFinanceSaving ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (locale === 'th' ? 'บันทึก' : 'Save')}
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {/* SECTION 2: Monitoring Configuration */}
        <SectionCard title={locale === 'th' ? 'การตั้งค่าการติดตาม' : 'Monitoring Configuration'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Monitoring Active badge (always on) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
              <span style={{ fontSize: '8px', marginBottom: '2px' }}>●</span>
              {locale === 'th' ? 'การติดตามทำงานอยู่' : 'Monitoring Active'}
            </div>

            {/* Alert Sensitivity — 3-button selector */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.35rem' }}>
                {locale === 'th' ? 'ความไวของการแจ้งเตือน' : 'Alert Sensitivity'}
              </label>
              <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'ควบคุมความไวของการแจ้งเตือนต่อการเปลี่ยนแปลงประสิทธิภาพ' : 'Controls how sensitive alerts are to performance changes'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {(['low', 'medium', 'high'] as const).map((s) => {
                  const labels = {
                    low: { en: 'Conservative', th: 'เฉพาะปัญหาใหญ่' },
                    medium: { en: 'Balanced', th: 'สมดุล' },
                    high: { en: 'Aggressive', th: 'ตรวจจับเร็ว' },
                  };
                  const sub = { low: { en: 'only major issues', th: 'เฉพาะปัญหาใหญ่' }, medium: { en: 'recommended', th: 'แนะนำ' }, high: { en: 'detect early signals', th: 'ตรวจจับสัญญาณเร็ว' } };
                  const isSelected = alertSensitivity === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleAlertSensitivityChange(s)}
                      disabled={monitoringLoading}
                      style={{
                        padding: '0.5rem 0.875rem',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        border: `1px solid ${isSelected ? '#0a0a0a' : '#d1d5db'}`,
                        backgroundColor: isSelected ? '#0a0a0a' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#374151',
                        cursor: monitoringLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {labels[s][locale]} <span style={{ opacity: 0.8, fontWeight: 400 }}>— {sub[s][locale]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Data Coverage — compact inline */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'ความครอบคลุมข้อมูล' : 'Data Coverage'}
              </label>
              <div style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 500 }}>
                  {coverageDays} {locale === 'th' ? 'วัน' : 'days'}
                  {coverageDays >= 7 && (locale === 'th' ? ' ของข้อมูล' : ' of data')}
                </span>
                <span style={{ color: '#6b7280' }}>●</span>
                <span style={{ color: coverageDays >= 30 ? '#10b981' : coverageDays >= 7 ? '#f59e0b' : '#ef4444', fontSize: '12px' }}>
                  {coverageDays >= 30
                    ? (locale === 'th' ? 'ความมั่นใจสูง' : 'High confidence')
                    : coverageDays >= 7
                      ? (locale === 'th' ? 'ความมั่นใจปานกลาง' : 'Medium confidence')
                      : (locale === 'th' ? 'ช่วงเรียนรู้' : 'Learning phase')}
                </span>
              </div>
            </div>

            {/* Last Updated — smaller, muted */}
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
              {lastUpdated
                ? (locale === 'th'
                    ? `อัปเดตล่าสุด: ${lastUpdated.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
                    : `Last updated: ${lastUpdated.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
                : (locale === 'th' ? 'ไม่มีข้อมูล' : 'No data')}
            </div>
          </div>
        </SectionCard>

        {/* Danger Zone — separate section with divider */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem' }}>
            {locale === 'th' ? 'โซนอันตราย' : 'Danger Zone'}
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.5 }}>
            {locale === 'th'
              ? 'ลบสาขานี้และข้อมูลที่เกี่ยวข้องทั้งหมด การดำเนินการนี้ไม่สามารถย้อนกลับได้'
              : 'Delete this branch and all associated data. This action cannot be undone.'}
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ffffff',
              color: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {locale === 'th' ? 'ลบสาขา' : 'Delete Branch'}
          </button>
        </div>

        {/* SECTION 3: User Access (Branch Level) */}
        <SectionCard title={locale === 'th' ? 'การเข้าถึงผู้ใช้ (ระดับสาขา)' : 'User Access (Branch Level)'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {canModifyAccess ? (
              <>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.75rem', color: '#374151' }}>
                    {locale === 'th' ? 'สมาชิกสาขา' : 'Branch Members'}
                  </div>
                  {loadingBranchMembers ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
                  ) : branchMembers.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#6b7280' }}>
                      {locale === 'th' ? 'ยังไม่มีสมาชิกระดับสาขา' : 'No branch members yet. Invite users below.'}
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600 }}>{locale === 'th' ? 'อีเมล' : 'Email'}</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600 }}>{locale === 'th' ? 'บทบาท' : 'Role'}</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600 }}>{locale === 'th' ? 'เข้าร่วม' : 'Joined'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branchMembers.map((m) => (
                            <tr key={m.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#374151', fontSize: '13px' }}>{m.email || '—'}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>{(m.role || '').replace('_', ' ')}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                                {m.created_at ? new Date(m.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'short' }) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.75rem', color: '#374151' }}>
                    {locale === 'th' ? 'เพิ่มผู้จัดการสาขา' : 'Add your branch manager'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>Email</label>
                      <input
                        type="email"
                        value={branchInviteEmail}
                        onChange={(e) => { setBranchInviteEmail(e.target.value); setBranchInviteResult(null); setBranchInviteError(null); }}
                        placeholder="user@example.com"
                        style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '200px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>Role</label>
                      <select
                        value={branchInviteRole}
                        onChange={(e) => setBranchInviteRole(e.target.value as 'owner' | 'manager' | 'staff')}
                        style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                      >
                        <option value="owner">Owner</option>
                        <option value="manager">Manager</option>
                        <option value="staff">Staff</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={!branchInviteEmail.trim() || branchInviteLoading || !branch?.id}
                      onClick={async () => {
                        setBranchInviteError(null);
                        setBranchInviteResult(null);
                        setBranchInviteLoading(true);
                        try {
                          const res = await fetch('/api/invite', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: branchInviteEmail.trim(), role: branchInviteRole, branchId: branch!.id }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setBranchInviteError(data.error || 'Failed to create invitation');
                            return;
                          }
                          setBranchInviteResult({
                            link: data.invitation?.inviteLink || '',
                            emailSent: data.invitation?.emailSent,
                            emailError: data.invitation?.emailError,
                          });
                          setBranchInviteEmail('');
                          loadPendingBranchInvitations();
                          try {
                            await logRbacAudit(
                              'invitation_created',
                              'invitation',
                              data.invitation?.id ?? null,
                              {
                                email: branchInviteEmail.trim(),
                                role: branchInviteRole,
                                branch_id: branch?.id ?? undefined,
                              },
                              {
                                branchId: branch?.id ?? null,
                                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                              }
                            );
                          } catch (auditErr) {
                            setBranchInviteError(locale === 'th' ? 'บันทึกตรวจสอบล้มเหลว' : 'Audit log failed');
                          }
                        } catch (e) {
                          setBranchInviteError(e instanceof Error ? e.message : 'Request failed');
                        } finally {
                          setBranchInviteLoading(false);
                        }
                      }}
                      data-rbac="invite"
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: branchInviteEmail.trim() && !branchInviteLoading ? '#0a0a0a' : '#9ca3af',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: branchInviteEmail.trim() && !branchInviteLoading ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {branchInviteLoading ? (locale === 'th' ? 'กำลังส่ง...' : 'Sending...') : (locale === 'th' ? 'ส่งคำเชิญ' : 'Send invite')}
                    </button>
                  </div>
                  {branchInviteError && <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{branchInviteError}</p>}
                  {branchInviteResult?.link && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                      {branchInviteResult.emailSent ? (
                        <p style={{ fontSize: '12px', color: '#166534', marginBottom: '0.5rem' }}>{locale === 'th' ? 'ส่งอีเมลคำเชิญแล้ว' : 'Invite email sent.'}</p>
                      ) : branchInviteResult.emailError ? (
                        <p style={{ fontSize: '12px', color: '#b45309', marginBottom: '0.5rem' }}>{locale === 'th' ? 'ส่งอีเมลไม่สำเร็จ — แชร์ลิงก์ด้านล่าง' : 'Email could not be sent — share the link below.'}</p>
                      ) : (
                        <p style={{ fontSize: '12px', color: '#166534', marginBottom: '0.5rem' }}>{locale === 'th' ? 'ส่งลิงก์นี้ให้ผู้ใช้:' : 'Share this link:'}</p>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <code style={{ fontSize: '12px', wordBreak: 'break-all', flex: 1, minWidth: 0 }}>{branchInviteResult.link}</code>
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(branchInviteResult!.link); setToast({ message: locale === 'th' ? 'คัดลอกแล้ว' : 'Copied', type: 'success' }); }}
                          style={{ padding: '0.35rem 0.75rem', border: '1px solid #166534', borderRadius: '6px', fontSize: '12px', color: '#166534', backgroundColor: 'transparent', cursor: 'pointer' }}
                        >
                          {locale === 'th' ? 'คัดลอก' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {pendingBranchInvitations.length > 0 && (
                  <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                      {locale === 'th' ? 'คำเชิญที่รอดำเนินการ' : 'Pending invitations'}
                    </div>
                    {loadingBranchInvitations ? (
                      <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {pendingBranchInvitations.map((inv) => {
                          const baseUrl = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_BASE_URL?.trim()
  ? process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  : typeof window !== 'undefined' ? window.location.origin : '';
const link = baseUrl && inv.token ? `${baseUrl}/accept-invite?token=${encodeURIComponent(inv.token)}` : '';
                          const isExpired = new Date(inv.expires_at) < new Date();
                          return (
                            <li
                              key={inv.id}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                            >
                              <span style={{ fontSize: '13px', color: '#374151' }}>
                                {inv.email} · {inv.role.replace('_', ' ')}{isExpired && <span style={{ color: '#dc2626', marginLeft: '0.25rem' }}>(expired)</span>}
                              </span>
                              {!isExpired && link && (
                                <button
                                  type="button"
                                  onClick={() => { navigator.clipboard.writeText(link); setToast({ message: locale === 'th' ? 'คัดลอกแล้ว' : 'Copied', type: 'success' }); }}
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
                                >
                                  {locale === 'th' ? 'คัดลอกลิงก์' : 'Copy link'}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#6b7280',
                textAlign: 'center',
              }}>
                {locale === 'th'
                  ? 'เฉพาะ Owner, Manager และ Branch Manager ที่สามารถจัดการการเข้าถึงได้'
                  : 'Only Owners, Managers and Branch Managers can modify user access'}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </PageLayout>
  );
}
