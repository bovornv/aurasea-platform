/**
 * Organization Context
 *
 * organizationId REQUIRED from Supabase only (organization_members → organizations table).
 * No default org, no mock business, no auto-create. If none found → empty state.
 */
'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useUserSession } from './user-session-context';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import type { UserRole } from '../services/permissions-service';
import { businessGroupService } from '../services/business-group-service';

export interface Organization {
  id: string;
  name: string;
}

export interface OrganizationMembership {
  organization_id: string;
  role: string;
}

interface OrganizationContextType {
  activeOrganizationId: string | null;
  activeOrganization: Organization | null;
  organizations: Organization[];
  /** Org IDs the user belongs to (from organization_members). Used to validate route. */
  memberOrganizationIds: string[];
  setActiveOrganizationId: (orgId: string) => Promise<void>;
  isLoading: boolean;
  /** True after we have run membership fetch (whether user has orgs or not). */
  isInitialized: boolean;
  refreshData: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const STORAGE_KEY = 'aurasea_active_organization_id';
const BUSINESS_GROUP_KEY = 'hospitality_business_group';
const CURRENT_BRANCH_KEY = 'hospitality_current_branch_id';

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

/** Remove stored branchId if it does not belong to the given org. Branch must be derived from current org only. */
function clearBranchIfNotInOrg(orgId: string): void {
  if (typeof window === 'undefined') return;
  const storedBranchId = localStorage.getItem(CURRENT_BRANCH_KEY);
  if (!storedBranchId || storedBranchId === '__all__') return;
  const branchesInOrg = businessGroupService.getAllBranches().filter((b) => b.businessGroupId === orgId);
  const belongsToOrg = branchesInOrg.some((b) => b.id === storedBranchId);
  if (!belongsToOrg) {
    localStorage.removeItem(CURRENT_BRANCH_KEY);
  }
}

function syncBusinessGroupLocalStorage(org: Organization | null): void {
  if (typeof window === 'undefined') return;
  if (!org) {
    localStorage.removeItem(BUSINESS_GROUP_KEY);
    return;
  }
  try {
    localStorage.setItem(
      BUSINESS_GROUP_KEY,
      JSON.stringify({
        id: org.id,
        name: org.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (e) {
    console.warn('[OrganizationContext] Failed to sync business group to localStorage', e);
  }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, updatePermissions } = useUserSession();
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberOrganizationIds, setMemberOrganizationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const loadOrganizations = useCallback(async (): Promise<Organization[]> => {
    if (typeof window === 'undefined') return [];
    const { getSupabaseClient, isSupabaseAvailable } = await import('../lib/supabase/client');
    if (!isSupabaseAvailable()) return [];
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('organizations').select('id, name').order('name');
    if (error) {
      console.error('[OrganizationContext] Failed to load organizations:', error);
      return [];
    }
    return (data ?? []) as Organization[];
  }, []);

  const loadOrganization = useCallback(async (orgId: string): Promise<Organization | null> => {
    if (typeof window === 'undefined') return null;
    const { getSupabaseClient, isSupabaseAvailable } = await import('../lib/supabase/client');
    if (!isSupabaseAvailable()) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .limit(1);
    if (error || !data?.length) return null;
    return data[0] as Organization;
  }, []);

  // Development: clear stored branch on mount so branch is always derived from current org.
  useEffect(() => {
    if (isDev && typeof window !== 'undefined') {
      localStorage.removeItem(CURRENT_BRANCH_KEY);
    }
  }, []);

  // Initialize from organization_members only. No mock org, no default business group. If no orgs in Supabase → empty state.
  // Module context is derived from the resolved branch's moduleType only; do not default to accommodation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isLoggedIn) {
      setActiveOrganizationIdState(null);
      setActiveOrganization(null);
      setOrganizations([]);
      setMemberOrganizationIds([]);
      setIsInitialized(true);
      return;
    }

    if (!isSupabaseAvailable()) {
      setIsInitialized(true);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsInitialized(true);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsInitialized(false);

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) {
          setActiveOrganizationIdState(null);
          setActiveOrganization(null);
          setOrganizations([]);
          setMemberOrganizationIds([]);
          if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
            syncBusinessGroupLocalStorage(null);
          }
          setIsInitialized(true);
          return;
        }

        const { data: memberships, error: memError } = await supabase
          .from('organization_members')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (cancelled) return;
        if (memError) {
          console.error('[OrganizationContext] Failed to fetch organization_members:', memError);
          setActiveOrganizationIdState(null);
          setActiveOrganization(null);
          setOrganizations([]);
          setMemberOrganizationIds([]);
          setIsInitialized(true);
          return;
        }

        const list = (memberships ?? []) as OrganizationMembership[];
        let orgIds = list.map((m) => m.organization_id);
        let firstOrgId: string | null = list.length > 0 ? list[0].organization_id : null;
        let firstRole: UserRole = list.length > 0 ? (list[0].role as UserRole) ?? 'owner' : 'staff';
        let branchIdsToSet: string[] | undefined;

        const { data: branchMembers } = await supabase
          .from('branch_members')
          .select('branch_id, role, branches(organization_id)')
          .eq('user_id', user.id);
        if (cancelled) return;
        type BMRow = { branch_id: string; role: string; branches: { organization_id: string } | null };
        const branchList = (branchMembers ?? []) as BMRow[];

        if (branchList.length > 0) {
          const seen = new Set<string>();
          const derivedOrgIds: string[] = [];
          branchList.forEach((row) => {
            const orgId = row.branches?.organization_id;
            if (orgId && !seen.has(orgId)) {
              seen.add(orgId);
              derivedOrgIds.push(orgId);
            }
          });
          if (derivedOrgIds.length > 0) {
            orgIds = derivedOrgIds;
            firstOrgId = derivedOrgIds[0];
            firstRole = (branchList[0].role as UserRole) || 'staff';
            branchIdsToSet = branchList.map((b) => b.branch_id);
          }
        }

        if (branchList.length === 0 && list.length > 0) {
          firstOrgId = list[0].organization_id;
          firstRole = (list[0].role as UserRole) ?? 'owner';
          orgIds = list.map((m) => m.organization_id);
        }

        if (!firstOrgId || orgIds.length === 0) {
          setActiveOrganizationIdState(null);
          setActiveOrganization(null);
          setOrganizations([]);
          setMemberOrganizationIds([]);
          if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
            syncBusinessGroupLocalStorage(null);
          }
          setIsInitialized(true);
          return;
        }

        setMemberOrganizationIds(orgIds);
        const orgs = await loadOrganizations();
        if (cancelled) return;
        setOrganizations(orgs);

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, firstOrgId);
        }

        setActiveOrganizationIdState(firstOrgId);
        const org = await loadOrganization(firstOrgId);
        if (cancelled) return;
        setActiveOrganization(org);
        syncBusinessGroupLocalStorage(org);
        clearBranchIfNotInOrg(firstOrgId);
        updatePermissions(firstRole, firstOrgId, branchIdsToSet ?? []);

        const isOrgLevel = list.some((m) => m.organization_id === firstOrgId && (m.role === 'owner' || m.role === 'admin'));
        if (isOrgLevel) {
          await businessGroupService.syncBranchesFromSupabaseForOrg(firstOrgId);
        } else {
          await businessGroupService.syncBranchesForOrgAndUser(firstOrgId, user.id);
        }
        if (cancelled) return;
        if (branchIdsToSet?.length === 1) {
          businessGroupService.setCurrentBranch(branchIdsToSet[0]);
        } else if (branchIdsToSet && branchIdsToSet.length > 1) {
          businessGroupService.setCurrentBranch(branchIdsToSet[0]);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[OrganizationContext] Init failed:', e);
          setActiveOrganizationIdState(null);
          setActiveOrganization(null);
          setOrganizations([]);
          setMemberOrganizationIds([]);
          setIsInitialized(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, loadOrganizations, loadOrganization]);

  const setActiveOrganizationId = useCallback(
    async (orgId: string) => {
      if (!memberOrganizationIds.length || !memberOrganizationIds.includes(orgId)) return;
      setIsLoading(true);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, orgId);
          clearBranchIfNotInOrg(orgId);
        }
        setActiveOrganizationIdState(orgId);
        const org = await loadOrganization(orgId);
        setActiveOrganization(org);
        syncBusinessGroupLocalStorage(org);

        const supabase = getSupabaseClient();
        const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
        if (user && supabase) {
          const { data: orgMember } = await supabase
            .from('organization_members')
            .select('role')
            .eq('organization_id', orgId)
            .eq('user_id', user.id)
            .maybeSingle();
          const role = (orgMember as { role?: string } | null)?.role;
          const isOrgLevel = role === 'owner' || role === 'admin';
          if (isOrgLevel) {
            await businessGroupService.syncBranchesFromSupabaseForOrg(orgId);
          } else {
            await businessGroupService.syncBranchesForOrgAndUser(orgId, user.id);
          }
        }

        const { invalidateAllDerivedState, invalidateOrganizationState, invalidateBranchState } =
          await import('../utils/cache-invalidation');
        invalidateAllDerivedState();
        invalidateOrganizationState(orgId);
        invalidateBranchState('__all__');
        window.dispatchEvent(
          new CustomEvent('organizationChanged', { detail: { organizationId: orgId } })
        );
        window.dispatchEvent(
          new CustomEvent('forceRecalculation', {
            detail: { organizationId: orgId, reason: 'organization_changed' },
          })
        );
        window.dispatchEvent(
          new CustomEvent('routerRefresh', { detail: { reason: 'organization_changed' } })
        );
      } catch (e) {
        console.error('[OrganizationContext] Failed to set active organization:', e);
      } finally {
        setIsLoading(false);
      }
    },
    [memberOrganizationIds, loadOrganization]
  );

  const refreshData = useCallback(async () => {
    if (!activeOrganizationId) return;
    setIsLoading(true);
    try {
      await loadOrganization(activeOrganizationId).then((org) => {
        setActiveOrganization(org);
      });
      const orgs = await loadOrganizations();
      setOrganizations(orgs);
      window.dispatchEvent(
        new CustomEvent('organizationChanged', { detail: { organizationId: activeOrganizationId } })
      );
    } catch (e) {
      console.error('[OrganizationContext] Failed to refresh data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrganizationId, loadOrganization, loadOrganizations]);

  return (
    <OrganizationContext.Provider
      value={{
        activeOrganizationId,
        activeOrganization,
        organizations,
        memberOrganizationIds,
        setActiveOrganizationId,
        isLoading,
        isInitialized,
        refreshData,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
