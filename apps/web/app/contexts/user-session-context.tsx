// User session context - manages login state and permissions for MVP
'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getUserPermissions, setUserPermissions, type UserPermissions, type UserRole } from '../services/permissions-service';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';

interface UserSessionContextType {
  isLoggedIn: boolean;
  isSuperAdmin: boolean;
  login: (email: string, role?: UserRole, organizationId?: string, branchIds?: string[]) => void;
  logout: () => void;
  email: string | null;
  permissions: UserPermissions;
  updatePermissions: (role: UserRole, organizationId?: string, branchIds?: string[]) => void;
}

const UserSessionContext = createContext<UserSessionContextType | undefined>(undefined);

async function fetchIsSuperAdmin(): Promise<boolean> {
  if (!isSupabaseAvailable()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_super_admin');
  if (error) return false;
  return data === true;
}

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

export function UserSessionProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>({
    role: '',
    organizationId: '',
    branchIds: [],
    email: '',
  });
  const [devCleanupDone, setDevCleanupDone] = useState(!isDev);

  // Development only: force logout once on mount so login page appears after restart.
  useEffect(() => {
    if (!isDev || typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      if (isSupabaseAvailable()) {
        const supabase = getSupabaseClient();
        if (supabase) await supabase.auth.signOut();
      }
      localStorage.removeItem('hospitality_user_email');
      localStorage.removeItem('hospitality_is_logged_in');
      if (!cancelled) setDevCleanupDone(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // On app start: check Supabase session only. No auto-login, no fallback session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDev && !devCleanupDone) return;

    const applySession = async (userEmail: string) => {
      setEmail(userEmail);
      setIsLoggedIn(true);
      const base = getUserPermissions(userEmail);
      setPermissions({ ...base, organizationId: '' });
      const superAdmin = await fetchIsSuperAdmin();
      setIsSuperAdmin(superAdmin);
    };

    const initFromSupabase = async () => {
      if (!isSupabaseAvailable()) return null;
      const supabase = getSupabaseClient();
      if (!supabase) return null;
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user?.email ?? null;
    };

    (async () => {
      const supabaseEmail = await initFromSupabase();
      if (supabaseEmail) {
        await applySession(supabaseEmail);
        localStorage.setItem('hospitality_user_email', supabaseEmail);
        localStorage.setItem('hospitality_is_logged_in', 'true');
      }
    })();
  }, [devCleanupDone]);

  const login = useCallback(async (userEmail: string, role: UserRole = 'owner', _organizationId?: string, branchIds: string[] = []) => {
    setEmail(userEmail);
    setIsLoggedIn(true);
    localStorage.setItem('hospitality_user_email', userEmail);
    localStorage.setItem('hospitality_is_logged_in', 'true');
    const superAdmin = await fetchIsSuperAdmin();
    setIsSuperAdmin(superAdmin);
    // Organization is set only after OrganizationContext fetches organization_members. Do not set from localStorage or fallback.
    const userPermissions: UserPermissions = {
      role,
      organizationId: '',
      branchIds: role === 'owner' || role === 'admin' ? [] : branchIds,
      email: userEmail,
    };
    setUserPermissions(userPermissions);
    setPermissions(userPermissions);
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseAvailable()) {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.auth.signOut();
    }
    setEmail(null);
    setIsLoggedIn(false);
    setIsSuperAdmin(false);
    setPermissions({
      role: '',
      organizationId: '',
      branchIds: [],
      email: '',
    });
    localStorage.removeItem('hospitality_user_email');
    localStorage.removeItem('hospitality_is_logged_in');
  }, []);

  const updatePermissions = useCallback((role: UserRole, organizationId?: string, branchIds: string[] = []) => {
    if (!email) return;
    // Organization must come from membership-derived state (OrganizationContext). No localStorage fallback.
    const userPermissions: UserPermissions = {
      role,
      organizationId: organizationId ?? permissions.organizationId ?? '',
      branchIds: role === 'owner' || role === 'admin' ? [] : branchIds,
      email,
    };
    setUserPermissions(userPermissions);
    setPermissions(userPermissions);
  }, [email, permissions.organizationId]);

  return (
    <UserSessionContext.Provider
      value={{
        isLoggedIn,
        isSuperAdmin,
        login,
        logout,
        email,
        permissions,
        updatePermissions,
      }}
    >
      <UnauthorizedRedirectGuard>{children}</UnauthorizedRedirectGuard>
    </UserSessionContext.Provider>
  );
}

/**
 * Ensures unauthenticated users never land on /unauthorized: redirect them to /login.
 * Separation: !user → /login; user && !hasPermission → /unauthorized (handled by route guard).
 */
function UnauthorizedRedirectGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn } = useUserSession();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isLoggedIn && pathname === '/unauthorized') {
      router.replace('/login');
    }
  }, [isLoggedIn, pathname, router]);

  return <>{children}</>;
}

export function useUserSession() {
  const context = useContext(UserSessionContext);
  if (!context) {
    throw new Error('useUserSession must be used within UserSessionProvider');
  }
  return context;
}
