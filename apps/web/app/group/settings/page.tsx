/**
 * Group Settings Page
 * 
 * Fully interactive management screen for group and branches
 * CRUD operations for branches with validation
 */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageLayout } from '../../components/page-layout';
import { useI18n } from '../../hooks/use-i18n';
import { useSettings } from '../../hooks/use-settings';
import { businessGroupService } from '../../services/business-group-service';
import { useUserSession } from '../../contexts/user-session-context';
import { useRBAC } from '../../hooks/use-rbac';
import { useRouteGuard } from '../../hooks/use-route-guard';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { Toast } from '../../components/toast';
import type { BusinessGroup, Branch, BranchLocation } from '../../models/business-group';
import { ModuleType } from '../../models/business-group';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useOrganization } from '../../contexts/organization-context';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { logRbacAudit } from '../../utils/rbac-audit';

interface EditingBranch extends Partial<Branch> {
  branchName: string;
  modules: ModuleType[];
  city?: string;
}

export default function GroupSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const { locale, t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const { permissions } = useUserSession();
  const { canAccessCompanySettings, isOrganizationOwner, role, isLoading: roleLoading } = useRBAC();

  // PART 2: Protect UI Routes - Company Settings: owner and admin
  useRouteGuard();
  const { activeOrganizationId } = useOrganization();
  const paths = useOrgBranchPaths();
  const orgId = (params?.orgId as string) ?? activeOrganizationId ?? null;
  const financialSetupHref = orgId ? `/org/${orgId}/settings/financial` : '/group/settings/financial';

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [businessGroup, setBusinessGroup] = useState<BusinessGroup | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [addingBranch, setAddingBranch] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState<EditingBranch>({
    branchName: '',
    modules: [ModuleType.FNB],
    city: '',
  });
  const [branchFormErrors, setBranchFormErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager'>('manager');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string; emailSent?: boolean; emailError?: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<Array<{ id: string; email: string; role: string; expires_at: string; token?: string | null }>>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [orgMembers, setOrgMembers] = useState<Array<{ user_id: string; role: string; created_at: string }>>([]);
  const [loadingOrgMembers, setLoadingOrgMembers] = useState(false);

  const loadOrgMembers = useCallback(async () => {
    if (!activeOrganizationId || !isSupabaseAvailable()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoadingOrgMembers(true);
    const { data } = await supabase
      .from('organization_members')
      .select('user_id, role, created_at')
      .eq('organization_id', activeOrganizationId)
      .order('created_at', { ascending: false });
    setOrgMembers((data ?? []) as Array<{ user_id: string; role: string; created_at: string }>);
    setLoadingOrgMembers(false);
  }, [activeOrganizationId]);

  const canFetchOrgInvitations = role?.isSuperAdmin || role?.effectiveRole === 'owner';

  const loadPendingInvitations = useCallback(async () => {
    if (!canFetchOrgInvitations || !activeOrganizationId || !isSupabaseAvailable()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoadingInvitations(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, role, expires_at, token')
        .eq('invited_by', user.id)
        .eq('organization_id', activeOrganizationId)
        .eq('accepted', false)
        .order('created_at', { ascending: false });
      if (error) return;
      setPendingInvitations((data ?? []) as Array<{ id: string; email: string; role: string; expires_at: string; token: string }>);
    } catch {
      // Suppress 403 and other errors for invitations fetch
    } finally {
      setLoadingInvitations(false);
    }
  }, [activeOrganizationId, canFetchOrgInvitations]);

  useEffect(() => {
    if (canFetchOrgInvitations) loadPendingInvitations();
    else setPendingInvitations([]);
  }, [loadPendingInvitations, canFetchOrgInvitations]);

  useEffect(() => {
    if (canAccessCompanySettings) loadOrgMembers();
    else setOrgMembers([]);
  }, [activeOrganizationId, canAccessCompanySettings, loadOrgMembers]);

  useEffect(() => {
    if (!roleLoading && role && !canAccessCompanySettings) {
      router.push(paths.companyOverview || '/group/overview');
    }
  }, [role, roleLoading, canAccessCompanySettings, router, paths.companyOverview]);

  useEffect(() => {
    setMounted(true);
    loadData();

    // Listen for branch/organization changes to reload data
    // Skip reload if we're currently saving (to avoid race conditions)
    const handleBranchOrOrganizationChange = () => {
      if (isSaving) return; // Don't reload if we're in the middle of saving
      setTimeout(() => {
        loadData();
      }, 100);
    };

    // Listen for storage changes (cross-tab updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hospitality_branches' || e.key === 'hospitality_business_group') {
        setTimeout(() => {
          loadData();
        }, 100);
      }
    };

    // Listen for page visibility changes (when user navigates back)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(() => {
          loadData();
        }, 100);
      }
    };

    window.addEventListener('branchUpdated', handleBranchOrOrganizationChange);
    window.addEventListener('organizationChanged', handleBranchOrOrganizationChange);
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('branchUpdated', handleBranchOrOrganizationChange);
      window.removeEventListener('organizationChanged', handleBranchOrOrganizationChange);
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSaving]);

  const loadData = () => {
    try {
      setLoading(true);
      setError(null);
      
      const group = businessGroupService.getBusinessGroup();
      if (!group) {
        throw new Error('Business group not found');
      }
      
      const allBranches = businessGroupService.getAllBranches().filter(
        b => b.businessGroupId === group.id
      );
      
      const orderKey = (a: Branch) => a.sortOrder ?? 0;
      const sortedBranches = [...allBranches].sort((a, b) => {
        const oa = orderKey(a);
        const ob = orderKey(b);
        return oa !== ob ? oa - ob : a.createdAt.getTime() - b.createdAt.getTime();
      });
      setBusinessGroup(group);
      setBranches(sortedBranches);
      setGroupName(group.name);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load settings'));
      console.error('Failed to load group settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const validateGroupName = (name: string): string | null => {
    if (!name.trim()) {
      return locale === 'th' ? 'ชื่อกลุ่มไม่สามารถว่างได้' : 'Group name cannot be empty';
    }
    if (name.trim().length < 3) {
      return locale === 'th' ? 'ชื่อกลุ่มต้องมีอย่างน้อย 3 ตัวอักษร' : 'Group name must be at least 3 characters';
    }
    return null;
  };

  const handleSaveGroupName = async () => {
    const validationError = validateGroupName(groupName);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }
    
    if (!businessGroup) return;
    
    try {
      setSavingGroupName(true);
      businessGroupService.updateBusinessGroupName(groupName.trim());
      setIsEditingGroupName(false);
      setBusinessGroup({ ...businessGroup, name: groupName.trim() });
      showToast(locale === 'th' ? 'อัปเดตชื่อกลุ่มสำเร็จ' : 'Group name updated');
    } catch (err) {
      console.error('Failed to save group name:', err);
      showToast(locale === 'th' ? 'ไม่สามารถบันทึกชื่อกลุ่มได้' : 'Failed to save group name', 'error');
    } finally {
      setSavingGroupName(false);
    }
  };

  const validateBranchForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!branchForm.branchName.trim()) {
      errors.branchName = locale === 'th' ? 'ชื่อสาขาไม่สามารถว่างได้' : 'Branch name is required';
    }
    
    if (!branchForm.modules || branchForm.modules.length === 0) {
      errors.modules = locale === 'th' ? 'ต้องเลือกอย่างน้อยหนึ่งโมดูล' : 'At least one module must be selected';
    }
    
    setBranchFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddBranch = () => {
    setAddingBranch(true);
    setEditingBranchId(null);
    setBranchForm({
      branchName: '',
      modules: [ModuleType.FNB],
      city: '',
    });
    setBranchFormErrors({});
  };

  const handleEditBranch = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setAddingBranch(false);
    // Use branch modules, default to FNB if none
    const modules = branch.modules && branch.modules.length > 0 ? branch.modules : [ModuleType.FNB];
    setBranchForm({
      branchName: branch.branchName,
      modules: modules,
      city: branch.location?.city || '',
    });
    setBranchFormErrors({});
  };

  const handleCancelBranchForm = () => {
    setAddingBranch(false);
    setEditingBranchId(null);
    setBranchForm({
      branchName: '',
      modules: [ModuleType.FNB],
      city: '',
    });
    setBranchFormErrors({});
  };

  const handleModuleToggle = (moduleType: ModuleType) => {
    setBranchForm(prev => {
      const currentModules = prev.modules || [ModuleType.FNB];
      if (currentModules.includes(moduleType)) {
        // Don't allow removing the last module
        if (currentModules.length === 1) return prev;
        return { ...prev, modules: currentModules.filter(m => m !== moduleType) };
      } else {
        return { ...prev, modules: [...currentModules, moduleType] };
      }
    });
    if (branchFormErrors.modules) {
      setBranchFormErrors({ ...branchFormErrors, modules: '' });
    }
  };

  const handleSaveBranch = () => {
    if (!validateBranchForm() || !businessGroup) return;

    setIsSaving(true);
    try {
      if (addingBranch) {
        // Create new branch
        const location: BranchLocation | undefined = branchForm.city
          ? { city: branchForm.city.trim() }
          : undefined;

        const newBranch = businessGroupService.createBranch(
          branchForm.branchName.trim(),
          branchForm.modules || [ModuleType.FNB],
          location,
          undefined, // operatingDays
          crypto.randomUUID(), // branchId (persist to Supabase and sync)
        );

        const allBranches = businessGroupService.getAllBranches().filter(
          b => b.businessGroupId === businessGroup.id
        );
        const sortByOrder = (a: Branch, b: Branch) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || a.createdAt.getTime() - b.createdAt.getTime();
        setBranches([...allBranches].sort(sortByOrder));
        
        // Force refresh of all components that depend on branches
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('branchUpdated', { 
            detail: { branchId: newBranch.id, action: 'created' } 
          }));
          window.dispatchEvent(new CustomEvent('branchSelectionChanged'));
          window.dispatchEvent(new CustomEvent('storage'));
          // Also trigger organizationChanged to refresh all views
          window.dispatchEvent(new CustomEvent('organizationChanged'));
        }
        
        showToast(locale === 'th' ? 'เพิ่มสาขาสำเร็จ' : 'Branch added');
        handleCancelBranchForm();
      } else if (editingBranchId) {
        // Update existing branch
        const location: BranchLocation | undefined = branchForm.city
          ? { city: branchForm.city.trim() }
          : undefined;
        
        const updatedBranch = businessGroupService.updateBranch(editingBranchId, {
          branchName: branchForm.branchName.trim(),
          modules: branchForm.modules || [ModuleType.FNB],
          location,
        });

        const allBranches = businessGroupService.getAllBranches().filter(
          b => b.businessGroupId === businessGroup.id
        );
        const sortByOrder = (a: Branch, b: Branch) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || a.createdAt.getTime() - b.createdAt.getTime();
        setBranches([...allBranches].sort(sortByOrder));

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('branchUpdated', { 
            detail: { branchId: editingBranchId, action: 'updated' } 
          }));
          window.dispatchEvent(new CustomEvent('branchSelectionChanged'));
          window.dispatchEvent(new CustomEvent('storage'));
        }
        
        showToast(locale === 'th' ? 'อัปเดตสาขาสำเร็จ' : 'Branch updated');
        handleCancelBranchForm();
      }
    } catch (err) {
      console.error('Failed to save branch:', err);
      showToast(
        locale === 'th' ? 'ไม่สามารถบันทึกสาขาได้' : 'Failed to save branch',
        'error'
      );
    } finally {
      // Reset saving flag after a short delay to allow state to settle
      setTimeout(() => {
        setIsSaving(false);
      }, 200);
    }
  };

  const orderKey = (b: Branch) => b.sortOrder ?? 0;

  const handleReorderBranch = async (branchId: string, direction: 'up' | 'down') => {
    if (!businessGroup || isSaving) return;
    try {
      setIsSaving(true);
      await businessGroupService.reorderBranch(branchId, direction);
      const allBranches = businessGroupService.getAllBranches().filter(
        b => b.businessGroupId === businessGroup.id
      );
      const sortedBranches = [...allBranches].sort((a, b) => {
        const oa = orderKey(a);
        const ob = orderKey(b);
        return oa !== ob ? oa - ob : a.createdAt.getTime() - b.createdAt.getTime();
      });
      setBranches(sortedBranches);
      showToast(locale === 'th' ? 'เรียงลำดับสาขาแล้ว' : 'Branch order updated');
    } catch (err) {
      console.error('[ReorderBranch] Failed to reorder branch:', err);
      showToast(
        locale === 'th' ? `ไม่สามารถเรียงลำดับสาขาได้: ${err instanceof Error ? err.message : String(err)}` : `Failed to reorder branch: ${err instanceof Error ? err.message : String(err)}`,
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBranch = (branchId: string) => {
    if (branches.length === 1) {
      showToast(
        locale === 'th' 
          ? 'คุณต้องมีอย่างน้อยหนึ่งสาขาในพอร์ตโฟลิโอ' 
          : 'You must have at least one branch in the company',
        'error'
      );
      return;
    }

    setDeletingBranchId(branchId);
  };

  const confirmDeleteBranch = () => {
    if (!deletingBranchId || !businessGroup) return;

    setIsSaving(true);
    try {
      businessGroupService.deleteBranch(deletingBranchId);
      
      // Immediately update state
      const allBranches = businessGroupService.getAllBranches().filter(
        b => b.businessGroupId === businessGroup.id
      );
      setBranches(allBranches);
      
      setDeletingBranchId(null);
      showToast(locale === 'th' ? 'ลบสาขาสำเร็จ' : 'Branch deleted');
    } catch (err) {
      console.error('Failed to delete branch:', err);
      showToast(
        locale === 'th' ? 'ไม่สามารถลบสาขาได้' : 'Failed to delete branch',
        'error'
      );
    } finally {
      // Reset saving flag after a short delay
      setTimeout(() => {
        setIsSaving(false);
      }, 200);
    }
  };

  const getModuleLabels = (modules: ModuleType[]): string => {
    if (!modules || modules.length === 0) {
      return locale === 'th' ? 'ไม่ระบุ' : 'Not specified';
    }
    const labels: string[] = [];
    if (modules.includes(ModuleType.ACCOMMODATION)) {
      labels.push(locale === 'th' ? 'ที่พัก' : 'Accommodation');
    }
    if (modules.includes(ModuleType.FNB)) {
      labels.push(locale === 'th' ? 'F&B' : 'F&B');
    }
    return labels.join(' • ') || (locale === 'th' ? 'ไม่ระบุ' : 'Not specified');
  };

  if (roleLoading) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (role && !canAccessCompanySettings) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: '#ef4444', marginBottom: '1rem' }}>Access Denied</div>
          <p style={{ color: '#6b7280' }}>Only organization owners and admins can access settings.</p>
        </div>
      </PageLayout>
    );
  }

  if (!mounted || loading) {
    return (
      <PageLayout title="" subtitle="">
        <LoadingSpinner />
      </PageLayout>
    );
  }

  if (error || !businessGroup) {
    return (
      <PageLayout title="" subtitle="">
        <ErrorState
          message={error?.message || 'Business group not found'}
          action={{
            label: locale === 'th' ? 'ลองอีกครั้ง' : 'Retry',
            onClick: loadData,
          }}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="" subtitle="">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingBranchId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setDeletingBranchId(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem', color: '#0a0a0a' }}>
              {locale === 'th' ? 'ลบสาขา?' : 'Delete Branch?'}
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              {locale === 'th'
                ? 'การดำเนินการนี้จะลบสาขานี้และประวัติการติดตามอย่างถาวร ไม่สามารถยกเลิกได้'
                : 'This action will permanently remove this branch and its monitoring history. This cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingBranchId(null)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button
                onClick={confirmDeleteBranch}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {locale === 'th' ? 'ลบ' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Financial Setup (Optional) - owner only; admin cannot manage billing */}
        {isOrganizationOwner && (
          <SectionCard title={locale === 'th' ? 'การตั้งค่าทางการเงิน (ไม่บังคับ)' : 'Financial Setup (Optional)'}>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem' }}>
              {locale === 'th'
                ? 'เพิ่มยอดเงินสดปัจจุบันและค่าใช้จ่ายคงที่รายเดือนเพื่อปรับปรุงการติดตาม (ไม่บังคับ)'
                : 'Add current cash balance and monthly fixed costs to improve monitoring accuracy (optional).'}
            </p>
            <Link
              href={financialSetupHref}
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                fontSize: '14px',
                fontWeight: 500,
                color: '#0a0a0a',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                textDecoration: 'none',
              }}
            >
              {locale === 'th' ? 'ไปที่การตั้งค่าทางการเงิน' : 'Go to Financial Setup'}
            </Link>
          </SectionCard>
        )}

        {/* Share view with team (owner-only) */}
        {canAccessCompanySettings && (
          <SectionCard title={locale === 'th' ? 'แชร์มุมมองกับทีม' : 'Share this view with your team'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '13px', color: '#6b7280' }}>
                {locale === 'th' ? 'เก็บทีมให้สอดคล้องกัน — เพิ่มผู้จัดการองค์กรหรือผู้จัดการสาขา' : 'Keep your team aligned. Add a manager or branch manager.'}
              </p>
              {!activeOrganizationId ? (
                <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                  {locale === 'th' ? 'เลือกองค์กรก่อน' : 'Select an organization first.'}
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>Email</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => { setInviteEmail(e.target.value); setInviteResult(null); setInviteError(null); }}
                        placeholder="colleague@example.com"
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          minWidth: '220px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'manager')}
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={!inviteEmail.trim() || inviteLoading}
                      onClick={async () => {
                        setInviteError(null);
                        setInviteResult(null);
                        setInviteLoading(true);
                        try {
                          const res = await fetch('/api/invite', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              email: inviteEmail.trim(),
                              role: inviteRole,
                              organizationId: activeOrganizationId,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setInviteError(data.error || 'Failed to create invitation');
                            return;
                          }
                          setInviteResult({
                            link: data.invitation?.inviteLink || '',
                            emailSent: data.invitation?.emailSent,
                            emailError: data.invitation?.emailError,
                          });
                          setInviteEmail('');
                          loadPendingInvitations();
                          try {
                            await logRbacAudit(
                              'invitation_created',
                              'invitation',
                              data.invitation?.id ?? null,
                              {
                                email: inviteEmail.trim(),
                                role: inviteRole,
                                organization_id: activeOrganizationId ?? undefined,
                              },
                              {
                                organizationId: activeOrganizationId ?? null,
                                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                              }
                            );
                          } catch (auditErr) {
                            setInviteError(locale === 'th' ? 'บันทึกตรวจสอบล้มเหลว' : 'Audit log failed');
                          }
                        } catch (e) {
                          setInviteError(e instanceof Error ? e.message : 'Request failed');
                        } finally {
                          setInviteLoading(false);
                        }
                      }}
                      data-rbac="invite"
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: inviteEmail.trim() && !inviteLoading ? '#0a0a0a' : '#9ca3af',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: inviteEmail.trim() && !inviteLoading ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {inviteLoading ? (locale === 'th' ? 'กำลังส่ง...' : 'Sending...') : (locale === 'th' ? 'ส่งคำเชิญ' : 'Send invite')}
                    </button>
                  </div>
                  {inviteError && (
                    <p style={{ fontSize: '13px', color: '#dc2626' }}>{inviteError}</p>
                  )}
                  {inviteResult?.link && (
                    <div style={{ padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                      {inviteResult.emailSent ? (
                        <p style={{ fontSize: '12px', color: '#166534', marginBottom: '0.5rem' }}>
                          {locale === 'th' ? 'ส่งอีเมลคำเชิญแล้ว' : 'Invite email sent.'}
                        </p>
                      ) : inviteResult.emailError ? (
                        <p style={{ fontSize: '12px', color: '#b45309', marginBottom: '0.5rem' }}>
                          {locale === 'th' ? 'ส่งอีเมลไม่สำเร็จ — แชร์ลิงก์ด้านล่าง' : 'Email could not be sent — share the link below.'}
                        </p>
                      ) : (
                        <p style={{ fontSize: '12px', color: '#166534', marginBottom: '0.5rem' }}>
                          {locale === 'th' ? 'ส่งลิงก์นี้ให้ผู้ใช้ (หรือตั้งค่า RESEND_API_KEY เพื่อส่งอีเมลอัตโนมัติ):' : 'Share this link (or set RESEND_API_KEY to send email automatically):'}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <code style={{ fontSize: '12px', wordBreak: 'break-all', flex: 1, minWidth: 0 }}>{inviteResult.link}</code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(inviteResult!.link);
                            setToast({ message: locale === 'th' ? 'คัดลอกแล้ว' : 'Copied', type: 'success' });
                          }}
                          style={{
                            padding: '0.35rem 0.75rem',
                            border: '1px solid #166534',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: '#166534',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          {locale === 'th' ? 'คัดลอก' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                  {pendingInvitations.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                        {locale === 'th' ? 'คำเชิญที่รอดำเนินการ' : 'Pending invitations'}
                      </div>
                      {loadingInvitations ? (
                        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
                      ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {pendingInvitations.map((inv) => {
                            const baseUrl = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_BASE_URL?.trim()
  ? process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  : typeof window !== 'undefined' ? window.location.origin : '';
const link = baseUrl && inv.token ? `${baseUrl}/accept-invite?token=${encodeURIComponent(inv.token)}` : '';
                            const expires = new Date(inv.expires_at);
                            const isExpired = expires < new Date();
                            return (
                              <li
                                key={inv.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: '0.5rem',
                                  padding: '0.5rem 0.75rem',
                                  backgroundColor: '#f9fafb',
                                  borderRadius: '6px',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                <span style={{ fontSize: '13px', color: '#374151' }}>
                                  {inv.email} · {inv.role}
                                  {isExpired && <span style={{ color: '#dc2626', marginLeft: '0.25rem' }}>(expired)</span>}
                                </span>
                                {!isExpired && link && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(link);
                                      setToast({ message: locale === 'th' ? 'คัดลอกแล้ว' : 'Copied', type: 'success' });
                                    }}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      fontSize: '12px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      backgroundColor: '#fff',
                                      cursor: 'pointer',
                                    }}
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
              )}
            </div>
          </SectionCard>
        )}

        {/* Organization members (owner/manager) */}
        {canAccessCompanySettings && activeOrganizationId && (
          <SectionCard title={locale === 'th' ? 'สมาชิกองค์กร' : 'Organization Members'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {loadingOrgMembers ? (
                <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
              ) : orgMembers.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  {locale === 'th' ? 'ยังไม่มีสมาชิกในตาราง organization_members' : 'No members yet. Invite users to add them.'}
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600 }}>{locale === 'th' ? 'บทบาท' : 'Role'}</th>
                        <th style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600 }}>{locale === 'th' ? 'ผู้ใช้ (ID)' : 'User (ID)'}</th>
                        <th style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600 }}>{locale === 'th' ? 'เข้าร่วม' : 'Joined'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgMembers.map((m) => (
                        <tr key={m.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>{m.role}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontFamily: 'monospace', fontSize: '12px' }}>
                            …{m.user_id.slice(-8)}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                            {m.created_at ? new Date(m.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'short' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '0.25rem' }}>
                {locale === 'th' ? 'อีเมลดูได้ที่ Supabase Dashboard → Authentication → Users' : 'View emails in Supabase Dashboard → Authentication → Users'}
              </p>
            </div>
          </SectionCard>
        )}

        {/* Section 1 — Group Name */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a' }}>
            {locale === 'th' ? 'ชื่อกลุ่ม' : 'Group Name'}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Group Name Field */}
            <div>
              {isEditingGroupName ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                      disabled={savingGroupName}
                    />
                  </div>
                  <button
                    onClick={handleSaveGroupName}
                    disabled={savingGroupName || !groupName.trim()}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: savingGroupName ? '#9ca3af' : '#0a0a0a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: savingGroupName ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {savingGroupName ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (locale === 'th' ? 'บันทึก' : 'Save')}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingGroupName(false);
                      setGroupName(businessGroup.name);
                    }}
                    disabled={savingGroupName}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: savingGroupName ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '16px', color: '#0a0a0a', fontWeight: 500 }}>
                    {businessGroup.name}
                  </span>
                  <button
                    onClick={() => setIsEditingGroupName(true)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {locale === 'th' ? 'แก้ไข' : 'Edit'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2 — Branch Management */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a' }}>
              {locale === 'th' ? 'สาขา' : 'Branches'}
            </h3>
            {canAccessCompanySettings && (
              <button
                onClick={handleAddBranch}
                disabled={addingBranch}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: addingBranch ? '#9ca3af' : '#0a0a0a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: addingBranch ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>+</span>
                <span>{locale === 'th' ? 'เพิ่มสาขา' : 'Add Branch'}</span>
              </button>
            )}
          </div>

          {/* Add Branch Form */}
          {addingBranch && (
            <div
              style={{
                padding: '1.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem', color: '#0a0a0a' }}>
                {locale === 'th' ? 'เพิ่มสาขาใหม่' : 'Add New Branch'}
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Branch Name */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '0.5rem',
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'ชื่อสาขา' : 'Branch Name'} <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={branchForm.branchName}
                    onChange={(e) => setBranchForm({ ...branchForm, branchName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: branchFormErrors.branchName ? '1px solid #dc2626' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                    placeholder={locale === 'th' ? 'กรอกชื่อสาขา' : 'Enter branch name'}
                  />
                  {branchFormErrors.branchName && (
                    <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                      {branchFormErrors.branchName}
                    </p>
                  )}
                </div>

                {/* Modules */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '0.5rem',
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'โมดูลที่เปิดใช้งาน' : 'Enabled Modules'} <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={branchForm.modules?.includes(ModuleType.ACCOMMODATION) ?? false}
                        onChange={() => handleModuleToggle(ModuleType.ACCOMMODATION)}
                        disabled={branchForm.modules?.length === 1 && branchForm.modules.includes(ModuleType.ACCOMMODATION)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span>{locale === 'th' ? 'ที่พัก (Accommodation)' : 'Accommodation'}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={branchForm.modules?.includes(ModuleType.FNB) ?? false}
                        onChange={() => handleModuleToggle(ModuleType.FNB)}
                        disabled={branchForm.modules?.length === 1 && branchForm.modules.includes(ModuleType.FNB)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span>{locale === 'th' ? 'อาหารและเครื่องดื่ม (F&B)' : 'Food & Beverage (F&B)'}</span>
                    </label>
                  </div>
                  {branchFormErrors.modules && (
                    <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                      {branchFormErrors.modules}
                    </p>
                  )}
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                    {locale === 'th'
                      ? 'โมดูลกำหนดว่าสัญญาณการติดตามใดจะถูกเปิดใช้งาน'
                      : 'Modules determine which monitoring signals are activated.'}
                  </p>
                </div>

                {/* City */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '0.5rem',
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'เมือง' : 'City'} <span style={{ color: '#6b7280', fontSize: '12px' }}>({locale === 'th' ? 'ไม่บังคับ' : 'optional'})</span>
                  </label>
                  <input
                    type="text"
                    value={branchForm.city || ''}
                    onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                    placeholder={locale === 'th' ? 'กรอกชื่อเมือง' : 'Enter city name'}
                  />
                </div>

                {/* Form Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    onClick={handleCancelBranchForm}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleSaveBranch}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#0a0a0a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {locale === 'th' ? 'บันทึก' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Branch List */}
          {branches.length === 0 && !addingBranch ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              {locale === 'th' ? 'ยังไม่มีสาขา' : 'No branches yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {branches.map((branch) => {
                const isEditing = editingBranchId === branch.id;

                if (isEditing) {
                  return (
                    <div
                      key={branch.id}
                      style={{
                        padding: '1.5rem',
                        border: '1px solid #3b82f6',
                        borderRadius: '8px',
                        backgroundColor: '#f9fafb',
                      }}
                    >
                      <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem', color: '#0a0a0a' }}>
                        {locale === 'th' ? 'แก้ไขสาขา' : 'Edit Branch'}
                      </h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Branch Name */}
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '14px',
                              fontWeight: 500,
                              marginBottom: '0.5rem',
                              color: '#374151',
                            }}
                          >
                            {locale === 'th' ? 'ชื่อสาขา' : 'Branch Name'} <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <input
                            type="text"
                            value={branchForm.branchName}
                            onChange={(e) => setBranchForm({ ...branchForm, branchName: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: branchFormErrors.branchName ? '1px solid #dc2626' : '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          />
                          {branchFormErrors.branchName && (
                            <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                              {branchFormErrors.branchName}
                            </p>
                          )}
                        </div>

                        {/* Modules */}
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '14px',
                              fontWeight: 500,
                              marginBottom: '0.5rem',
                              color: '#374151',
                            }}
                          >
                            {locale === 'th' ? 'โมดูลที่เปิดใช้งาน' : 'Enabled Modules'} <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                              <input
                                type="checkbox"
                                checked={branchForm.modules?.includes(ModuleType.ACCOMMODATION) ?? false}
                                onChange={() => handleModuleToggle(ModuleType.ACCOMMODATION)}
                                disabled={branchForm.modules?.length === 1 && branchForm.modules.includes(ModuleType.ACCOMMODATION)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                              <span>{locale === 'th' ? 'ที่พัก (Accommodation)' : 'Accommodation'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                              <input
                                type="checkbox"
                                checked={branchForm.modules?.includes(ModuleType.FNB) ?? false}
                                onChange={() => handleModuleToggle(ModuleType.FNB)}
                                disabled={branchForm.modules?.length === 1 && branchForm.modules.includes(ModuleType.FNB)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                              <span>{locale === 'th' ? 'อาหารและเครื่องดื่ม (F&B)' : 'Food & Beverage (F&B)'}</span>
                            </label>
                          </div>
                          {branchFormErrors.modules && (
                            <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '0.25rem' }}>
                              {branchFormErrors.modules}
                            </p>
                          )}
                        </div>

                        {/* City */}
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '14px',
                              fontWeight: 500,
                              marginBottom: '0.5rem',
                              color: '#374151',
                            }}
                          >
                            {locale === 'th' ? 'เมือง' : 'City'} <span style={{ color: '#6b7280', fontSize: '12px' }}>({locale === 'th' ? 'ไม่บังคับ' : 'optional'})</span>
                          </label>
                          <input
                            type="text"
                            value={branchForm.city || ''}
                            onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                            }}
                          />
                        </div>

                        {/* Form Actions */}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                          <button
                            onClick={handleCancelBranchForm}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#f3f4f6',
                              color: '#374151',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                              cursor: 'pointer',
                            }}
                          >
                            {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                          </button>
                          <button
                            onClick={handleSaveBranch}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#0a0a0a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '14px',
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                          >
                            {locale === 'th' ? 'บันทึก' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={branch.id}
                    style={{
                      padding: '1rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                          <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a' }}>
                            {branch.branchName}
                          </h4>
                          {branch.isDefault && (
                            <span
                              style={{
                                padding: '0.125rem 0.5rem',
                                backgroundColor: '#dbeafe',
                                color: '#1e40af',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                              }}
                            >
                              {locale === 'th' ? 'ค่าเริ่มต้น' : 'Default'}
                            </span>
                          )}
                          {branch.modules && branch.modules.length > 0 && (
                            <span
                              style={{
                                padding: '0.25rem 0.5rem',
                                backgroundColor: '#f3f4f6',
                                color: '#374151',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 500,
                              }}
                            >
                              {getModuleLabels(branch.modules)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '14px', color: '#6b7280' }}>
                          {branch.location?.city && (
                            <span>
                              <strong>{locale === 'th' ? 'เมือง:' : 'City:'}</strong> {branch.location.city}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {/* Reorder: disable up when first, down when last (by position). Service normalizes order on first swap if needed. */}
                        {branches.length > 1 && (() => {
                          const index = branches.findIndex(b => b.id === branch.id);
                          const canMoveUp = index > 0;
                          const canMoveDown = index >= 0 && index < branches.length - 1;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginRight: '0.5rem' }}>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  await handleReorderBranch(branch.id, 'up');
                                }}
                                disabled={isSaving || addingBranch || !canMoveUp}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: !canMoveUp ? '#f3f4f6' : '#ffffff',
                                  color: !canMoveUp ? '#9ca3af' : '#374151',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px 4px 0 0',
                                  fontSize: '12px',
                                  cursor: addingBranch || !canMoveUp ? 'not-allowed' : 'pointer',
                                  fontWeight: 600,
                                  lineHeight: 1,
                                  minWidth: '32px',
                                }}
                                title={locale === 'th' ? 'ย้ายขึ้น' : 'Move up'}
                              >
                                ▲
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  await handleReorderBranch(branch.id, 'down');
                                }}
                                disabled={isSaving || addingBranch || !canMoveDown}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: !canMoveDown ? '#f3f4f6' : '#ffffff',
                                  color: !canMoveDown ? '#9ca3af' : '#374151',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '0 0 4px 4px',
                                  fontSize: '12px',
                                  cursor: addingBranch || !canMoveDown ? 'not-allowed' : 'pointer',
                                  fontWeight: 600,
                                  lineHeight: 1,
                                  minWidth: '32px',
                                }}
                                title={locale === 'th' ? 'ย้ายลง' : 'Move down'}
                              >
                                ▼
                              </button>
                            </div>
                          );
                        })()}
                        <button
                          onClick={() => handleEditBranch(branch)}
                          disabled={addingBranch}
                          style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: addingBranch ? 'not-allowed' : 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          {locale === 'th' ? 'แก้ไข' : 'Edit'}
                        </button>
                        {/* PART 5: Hide Delete button for non-owners (owner only; admin cannot delete org/branches from here) */}
                        {isOrganizationOwner && (
                          <button
                            data-rbac="delete-branch"
                            onClick={() => handleDeleteBranch(branch.id)}
                            disabled={addingBranch || branches.length === 1}
                            style={{
                              padding: '0.5rem 0.75rem',
                              backgroundColor: branches.length === 1 ? '#f3f4f6' : '#fef2f2',
                              color: branches.length === 1 ? '#9ca3af' : '#dc2626',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: addingBranch || branches.length === 1 ? 'not-allowed' : 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          {locale === 'th' ? 'ลบ' : 'Delete'}
                        </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3 — Portfolio Statistics */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a' }}>
            {locale === 'th' ? 'สถิติบริษัท' : 'Company Statistics'}
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'จำนวนสาขา' : 'Total Branches'}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#0a0a0a' }}>
                {branches.length}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'สาขาที่มีโมดูลที่พัก' : 'Branches with Accommodation'}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#0a0a0a' }}>
                {branches.filter(b => 
                  b.modules?.includes(ModuleType.ACCOMMODATION) ?? false
                ).length}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'สาขาที่มีโมดูล F&B' : 'Branches with F&B'}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#0a0a0a' }}>
                {branches.filter(b => 
                  b.modules?.includes(ModuleType.FNB) ?? false
                ).length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
