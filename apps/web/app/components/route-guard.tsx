// Route guard - login and setup flow. owner/admin → org overview; manager/staff/viewer → branch overview.
'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { useRbacReady } from '../hooks/use-route-guard';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches, type UserPermissions, type UserRole } from '../services/permissions-service';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';

let initialLandingResolved = false;

function getDefaultOrgAndBranch(permissions: UserPermissions, effectiveRole: string | null) {
  const group = typeof window !== 'undefined' ? businessGroupService.getBusinessGroup() : null;
  const orgId = permissions.organizationId || group?.id;
  if (!orgId) return { orgId: null, branchId: null };
  const branches = getAccessibleBranches({ ...permissions, role: (effectiveRole || '') as UserRole | '' }).filter((b) => b.businessGroupId === orgId);
  const branchId = branches.length > 0 ? branches[0].id : null;
  return { orgId, branchId };
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, permissions, isSuperAdmin } = useUserSession();
  const { role, isLoading: roleLoading } = useUserRole();
  const isReady = useRbacReady();
  const { setup } = useBusinessSetup();
  const hasRunInitialLandingRef = useRef(false);

  useEffect(() => {
    const isPublicRoute = pathname === '/login' || pathname === '/';
    if (!isLoggedIn && !isPublicRoute) {
      router.push('/login');
      return;
    }

    if (
      isLoggedIn &&
      role?.effectiveRole === 'owner' &&
      !setup.isCompleted &&
      pathname !== '/hospitality/setup' &&
      pathname !== '/hospitality/data-entry'
    ) {
      router.push('/hospitality/setup');
      return;
    }

    if (isLoggedIn && (pathname === '/login' || pathname === '/')) {
      if (!initialLandingResolved && !hasRunInitialLandingRef.current && !roleLoading && role && isReady) {
        const effectiveRole = role.effectiveRole;
        const { orgId, branchId } = getDefaultOrgAndBranch(permissions, effectiveRole ?? null);
        if (orgId) {
          if (effectiveRole === 'owner' || effectiveRole === 'admin') {
            router.replace(`/org/${orgId}/overview`);
          } else if (branchId) {
            router.replace(`/org/${orgId}/branch/${branchId}/overview`);
          } else {
            router.replace('/no-access?reason=branch');
          }
          initialLandingResolved = true;
          hasRunInitialLandingRef.current = true;
        } else if (isSuperAdmin) {
          (async () => {
            if (isSupabaseAvailable()) {
              const supabase = getSupabaseClient();
              const { data: firstOrg } = supabase
                ? await supabase.from('organizations').select('id').limit(1)
                : { data: null };
              const orgRow = (firstOrg as { id: string }[] | null)?.[0];
              if (orgRow?.id) {
                router.replace(`/org/${orgRow.id}/overview`);
              }
            }
            initialLandingResolved = true;
            hasRunInitialLandingRef.current = true;
          })();
        }
      } else if (pathname === '/login' && !roleLoading && role) {
        const effectiveRole = role.effectiveRole;
        const { orgId, branchId } = getDefaultOrgAndBranch(permissions, effectiveRole ?? null);
        if (orgId) {
          if (effectiveRole === 'owner' || effectiveRole === 'admin') {
            router.push(`/org/${orgId}/overview`);
          } else if (branchId) {
            router.push(`/org/${orgId}/branch/${branchId}/overview`);
          }
        } else if (isSuperAdmin) {
          (async () => {
            if (isSupabaseAvailable()) {
              const supabase = getSupabaseClient();
              const { data: firstOrg } = supabase
                ? await supabase.from('organizations').select('id').limit(1)
                : { data: null };
              const orgRow = (firstOrg as { id: string }[] | null)?.[0];
              if (orgRow?.id) {
                router.push(`/org/${orgRow.id}/overview`);
              }
            }
          })();
        }
      }
      return;
    }

    if (isLoggedIn && pathname !== '/' && pathname !== '/login' && !initialLandingResolved) {
      initialLandingResolved = true;
      hasRunInitialLandingRef.current = true;
    }
  }, [isLoggedIn, setup.isCompleted, pathname, router, permissions, role, roleLoading, isSuperAdmin, isReady]);

  return <>{children}</>;
}
