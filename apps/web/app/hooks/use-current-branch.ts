/**
 * Current branch: branchId must come from Supabase branches only (UUID).
 * No default branch, no auto-create. If no branches for org → empty (branch null).
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { businessGroupService } from '../services/business-group-service';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { getAccessibleBranches, mergeOrgRoleForBranchList } from '../services/permissions-service';
import type { Branch } from '../models/business-group';

const CURRENT_BRANCH_KEY = 'hospitality_current_branch_id';

export function useCurrentBranch(): {
  branch: Branch | null;
  branchId: string | null; // Branch ID or "__all__" for all branches
  isAllBranches: boolean;
  isLoading: boolean;
} {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const params = useParams();
  const branchIdFromUrl = params?.branchId as string | undefined;
  const { permissions } = useUserSession();
  const { role: userRole } = useUserRole();
  const permissionsForBranches = useMemo(
    () => mergeOrgRoleForBranchList(permissions, userRole?.effectiveRole),
    [
      permissions.organizationId,
      permissions.branchIds,
      permissions.role,
      permissions.email,
      userRole?.effectiveRole,
    ]
  );

  useEffect(() => {
    businessGroupService.initializeBusinessStructure();

    const updateBranch = () => {
      const ALL_BRANCHES_KEY = '__all__';
      const businessGroup = businessGroupService.getBusinessGroup();
      const accessibleBranches = businessGroup
        ? getAccessibleBranches(permissionsForBranches).filter((b) => b.businessGroupId === businessGroup.id)
        : [];
      const defaultBranchList = accessibleBranches;
      let currentBranchId = businessGroupService.getCurrentBranchId();
      // Saved branch must belong to current org and user's accessible list; remove from storage if not.
      if (currentBranchId && currentBranchId !== ALL_BRANCHES_KEY && defaultBranchList.length > 0 && !defaultBranchList.some((b) => b.id === currentBranchId)) {
        if (typeof window !== 'undefined') localStorage.removeItem(CURRENT_BRANCH_KEY);
        currentBranchId = null;
      }
      if (defaultBranchList.length > 0 && (!currentBranchId || !defaultBranchList.some((b) => b.id === currentBranchId))) {
        businessGroupService.setCurrentBranch(defaultBranchList[0].id);
        currentBranchId = defaultBranchList[0].id;
      }
      if (branchIdFromUrl && defaultBranchList.some((b) => b.id === branchIdFromUrl)) {
        businessGroupService.setCurrentBranch(branchIdFromUrl);
        const b = defaultBranchList.find((x) => x.id === branchIdFromUrl);
        if (b) {
          setBranchId(branchIdFromUrl);
          setBranch(b);
          setIsLoading(false);
          return;
        }
      }

      const currentBranch = businessGroupService.getCurrentBranch();
      const isAllBranches = businessGroupService.isAllBranchesSelected();

      const isBranchRoute =
        pathname?.startsWith('/branch/') ||
        (pathname?.startsWith('/org/') && pathname?.includes('/branch/'));
      if (isBranchRoute && (isAllBranches || currentBranchId === ALL_BRANCHES_KEY || !currentBranch) && defaultBranchList.length > 0) {
        const branchToSelect = defaultBranchList[0];
        businessGroupService.setCurrentBranch(branchToSelect.id);
        setBranchId(branchToSelect.id);
        setBranch(branchToSelect);
        setIsLoading(false);
        return;
      }

      if (!isAllBranches && currentBranchId && currentBranchId !== ALL_BRANCHES_KEY) {
        const branchExists = defaultBranchList.some((b) => b.id === currentBranchId);
        if (!branchExists && defaultBranchList.length > 0) {
          const branchToSelect = defaultBranchList[0];
          businessGroupService.setCurrentBranch(branchToSelect.id);
          setBranchId(branchToSelect.id);
          setBranch(branchToSelect);
          setIsLoading(false);
          return;
        }
        if (branchExists && !currentBranch) {
          const branch = defaultBranchList.find((b) => b.id === currentBranchId);
          if (branch) {
            setBranchId(currentBranchId);
            setBranch(branch);
            setIsLoading(false);
            return;
          }
        }
      }
      
      setBranchId(currentBranchId);
      setBranch(currentBranch);
      setIsLoading(false);
    };
    
    updateBranch();
  }, [
    pathname,
    branchIdFromUrl,
    permissions.organizationId,
    permissions.branchIds,
    permissions.role,
    permissionsForBranches,
    userRole?.effectiveRole,
  ]);

  // Listen for storage changes to update when branch selection changes
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const handleStorageChange = () => {
      const ALL_BRANCHES_KEY = '__all__';
      const businessGroup = businessGroupService.getBusinessGroup();
      const accessibleBranches = businessGroup
        ? getAccessibleBranches(permissionsForBranches).filter((b) => b.businessGroupId === businessGroup.id)
        : [];
      const defaultBranchList = accessibleBranches;
      let currentBranchId = businessGroupService.getCurrentBranchId();
      if (currentBranchId && currentBranchId !== ALL_BRANCHES_KEY && defaultBranchList.length > 0 && !defaultBranchList.some((b) => b.id === currentBranchId)) {
        if (typeof window !== 'undefined') localStorage.removeItem(CURRENT_BRANCH_KEY);
        currentBranchId = null;
      }
      if (defaultBranchList.length > 0 && (!currentBranchId || !defaultBranchList.some((b) => b.id === currentBranchId))) {
        businessGroupService.setCurrentBranch(defaultBranchList[0].id);
        currentBranchId = defaultBranchList[0].id;
      }
      const currentBranch = businessGroupService.getCurrentBranch();

      const isBranchRoute =
        pathname?.startsWith('/branch/') ||
        (pathname?.startsWith('/org/') && pathname?.includes('/branch/'));
      if (isBranchRoute && (currentBranchId === ALL_BRANCHES_KEY || !currentBranch) && defaultBranchList.length > 0) {
        businessGroupService.setCurrentBranch(defaultBranchList[0].id);
        setBranchId(defaultBranchList[0].id);
        setBranch(defaultBranchList[0]);
        return;
      }

      if (currentBranchId && currentBranchId !== ALL_BRANCHES_KEY) {
        const branchExists = defaultBranchList.some((b) => b.id === currentBranchId);
        if (!branchExists && defaultBranchList.length > 0) {
          businessGroupService.setCurrentBranch(defaultBranchList[0].id);
          setBranchId(defaultBranchList[0].id);
          setBranch(defaultBranchList[0]);
          return;
        }
        if (branchExists && !currentBranch) {
          const branch = defaultBranchList.find((b) => b.id === currentBranchId);
          if (branch) {
            setBranchId(currentBranchId);
            setBranch(branch);
            return;
          }
        }
      }

      setBranchId(currentBranchId);
      setBranch(currentBranch);
    };

    window.addEventListener('storage', handleStorageChange);
    // Also listen to custom event for same-tab updates
    window.addEventListener('branchSelectionChanged', handleStorageChange);
    // Listen for branch updates (when branches are added/removed/updated)
    window.addEventListener('branchUpdated', handleStorageChange);
    window.addEventListener('organizationChanged', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('branchSelectionChanged', handleStorageChange);
      window.removeEventListener('branchUpdated', handleStorageChange);
      window.removeEventListener('organizationChanged', handleStorageChange);
    };
  }, [pathname, permissions.organizationId, permissions.branchIds, permissions.role, permissionsForBranches, userRole?.effectiveRole]);

  const ALL_BRANCHES_KEY = '__all__';
  return { 
    branch, 
    branchId,
    isAllBranches: branchId === ALL_BRANCHES_KEY,
    isLoading 
  };
}
