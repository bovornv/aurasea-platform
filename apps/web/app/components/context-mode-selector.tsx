/**
 * View Mode Switcher Component
 * 
 * Allows switching between Company View and Branch View modes
 * Only shown for multi-branch organizations
 */
'use client';

import { useRouter, usePathname, useParams } from 'next/navigation';
import { useContextMode, type ContextMode } from '../hooks/use-context-mode';
import { useI18n } from '../hooks/use-i18n';
import { useUserSession } from '../contexts/user-session-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';
import { useState, useEffect, useMemo } from 'react';

export function ContextModeSelector() {
  const { mode, canSwitchToGroup } = useContextMode();
  const { locale } = useI18n();
  const { permissions } = useUserSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchIdFromUrl = params?.branchId as string | undefined;
  const [mounted, setMounted] = useState(false);
  const [branchCount, setBranchCount] = useState(0);
  
  // Determine if Company button should be shown
  // Owner and Manager can access Company view, Branch User cannot
  const canAccessCompany = useMemo(() => {
    return permissions.role === 'owner' || permissions.role === 'admin';
  }, [permissions.role]);

  useEffect(() => {
    setMounted(true);
    const updateBranchCount = () => {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (businessGroup) {
        const branches = businessGroupService.getAllBranches().filter(
          b => b.businessGroupId === businessGroup.id
        );
        setBranchCount(branches.length);
      }
    };
    
    updateBranchCount();
    
    // Listen for branch changes to update count
    window.addEventListener('branchUpdated', updateBranchCount);
    window.addEventListener('organizationChanged', updateBranchCount);
    window.addEventListener('storage', updateBranchCount);
    
    return () => {
      window.removeEventListener('branchUpdated', updateBranchCount);
      window.removeEventListener('organizationChanged', updateBranchCount);
      window.removeEventListener('storage', updateBranchCount);
    };
  }, []);

  const handleModeChange = (newMode: ContextMode) => {
    if (!orgId) return;
    if (!canSwitchToGroup && newMode === 'group') return;
    const onCompany = pathname?.startsWith('/org/') && !branchIdFromUrl;
    const onBranch = pathname?.includes('/branch/');
    if (mode === newMode && ((newMode === 'group' && onCompany) || (newMode === 'branch' && onBranch))) return;
    if (newMode === 'group') {
      router.push(`/org/${orgId}/overview`);
    } else {
      const branches = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
      const bid = branchIdFromUrl || businessGroupService.getCurrentBranchId() || branches[0]?.id;
      if (bid) router.push(`/org/${orgId}/branch/${bid}/overview`);
      else console.warn('No branch when switching to branch mode');
    }
  };

  // Hide toggle if single branch (but wait for mount to avoid flash)
  // Only hide if we're sure there's only 1 branch after mounting
  if (mounted && branchCount > 0 && branchCount <= 1) {
    return null;
  }
  
  // Show loading state if not mounted yet (prevents flash)
  if (!mounted) {
    return null;
  }

  // If Branch User role, only show Branch button (hide Company)
  if (!canAccessCompany) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        position: 'relative',
        zIndex: 103,
        pointerEvents: 'auto',
      }}>
        <button
          onClick={() => handleModeChange('branch')}
          type="button"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: mode === 'branch' ? '#ffffff' : 'transparent',
            color: mode === 'branch' ? '#0a0a0a' : '#6b7280',
            fontSize: '13px',
            fontWeight: mode === 'branch' ? 500 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: mode === 'branch' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
            position: 'relative',
            zIndex: 104,
            pointerEvents: 'auto',
          }}
        >
          {locale === 'th' ? 'มุมมองสาขา' : 'Branch View'}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.25rem',
      backgroundColor: '#f9fafb',
      borderRadius: '6px',
      border: '1px solid #e5e7eb',
      position: 'relative',
      zIndex: 103,
      pointerEvents: 'auto',
    }}>
      <button
        onClick={() => handleModeChange('group')}
        type="button"
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '4px',
          border: 'none',
          backgroundColor: mode === 'group' ? '#ffffff' : 'transparent',
          color: mode === 'group' ? '#0a0a0a' : '#6b7280',
          fontSize: '13px',
          fontWeight: mode === 'group' ? 500 : 400,
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: mode === 'group' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
          position: 'relative',
          zIndex: 104,
          pointerEvents: 'auto',
        }}
      >
        {locale === 'th' ? 'มุมมองบริษัท' : 'Company View'}
      </button>
      <button
        onClick={() => handleModeChange('branch')}
        type="button"
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '4px',
          border: 'none',
          backgroundColor: mode === 'branch' ? '#ffffff' : 'transparent',
          color: mode === 'branch' ? '#0a0a0a' : '#6b7280',
          fontSize: '13px',
          fontWeight: mode === 'branch' ? 500 : 400,
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: mode === 'branch' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
          position: 'relative',
          zIndex: 104,
          pointerEvents: 'auto',
        }}
      >
        {locale === 'th' ? 'มุมมองสาขา' : 'Branch View'}
      </button>
    </div>
  );
}
