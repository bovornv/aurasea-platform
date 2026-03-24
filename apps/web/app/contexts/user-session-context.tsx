// User session context - manages login state and permissions for MVP
'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useRef,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getUserPermissions, setUserPermissions, type UserPermissions, type UserRole } from '../services/permissions-service';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { isTransientNetworkError } from '../lib/network/transient-fetch-error';
import { AURASEA_ONLINE_EVENT } from './connectivity-context';

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

/** Never block login/session restore on this RPC (can hang under RLS, cold DB, or bad network). */
const SUPER_ADMIN_RPC_MS = 8_000;

function fetchIsSuperAdminBounded(): Promise<boolean> {
  return Promise.race([
    fetchIsSuperAdmin(),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SUPER_ADMIN_RPC_MS)),
  ]);
}

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

function isLoginPath(path: string | null): boolean {
  if (!path) return false;
  return path === '/login' || path.startsWith('/login/');
}

/**
 * Supabase auth events + reconnect: refresh session after `online`, sign out when appropriate.
 */
function SessionAuthBridge({
  applySupabaseEmail,
  logout,
  authListenersReady,
}: {
  applySupabaseEmail: (userEmail: string) => Promise<void>;
  logout: () => Promise<void>;
  authListenersReady: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn } = useUserSession();
  const isLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    if (!authListenersReady || typeof window === 'undefined') return;

    const onReconnect = async () => {
      if (!isSupabaseAvailable()) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          if (isTransientNetworkError(refreshErr)) {
            return;
          }
          if (process.env.NODE_ENV === 'development') {
            console.warn('[UserSession] refreshSession after reconnect:', refreshErr.message);
          }
        }
        const session =
          refreshData.session ??
          (await supabase.auth.getSession()).data.session;
        const em = session?.user?.email;
        if (em) {
          await applySupabaseEmail(em);
          return;
        }
        if (isLoggedInRef.current) {
          await logout();
          if (!isLoginPath(pathname)) {
            router.replace('/login');
          }
        }
      } catch (e) {
        if (isTransientNetworkError(e)) {
          return;
        }
        if (isLoggedInRef.current) {
          await logout();
          if (!isLoginPath(pathname)) {
            router.replace('/login');
          }
        }
        if (process.env.NODE_ENV === 'development') {
          console.warn('[UserSession] reconnect session check failed:', e);
        }
      }
    };

    window.addEventListener(AURASEA_ONLINE_EVENT, onReconnect);
    return () => window.removeEventListener(AURASEA_ONLINE_EVENT, onReconnect);
  }, [authListenersReady, applySupabaseEmail, logout, pathname, router]);

  useEffect(() => {
    if (!authListenersReady) return;
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseAvailable()) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return;

      const em = session?.user?.email ?? null;
      if (em && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        await applySupabaseEmail(em);
        return;
      }

      if (event === 'SIGNED_OUT') {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return;
        }
        await logout();
        if (!isLoginPath(pathname)) {
          router.replace('/login');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [authListenersReady, applySupabaseEmail, logout, router, pathname]);

  return null;
}

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

  const applySupabaseEmail = useCallback(async (userEmail: string) => {
    setEmail(userEmail);
    setIsLoggedIn(true);
    const base = getUserPermissions(userEmail);
    setPermissions({ ...base, organizationId: '' });
    void fetchIsSuperAdminBounded().then((v) => setIsSuperAdmin(v));
    localStorage.setItem('hospitality_user_email', userEmail);
    localStorage.setItem('hospitality_is_logged_in', 'true');
  }, []);

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
    return () => {
      cancelled = true;
    };
  }, []);

  // On app start: check Supabase session only. No auto-login, no fallback session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDev && !devCleanupDone) return;

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
        await applySupabaseEmail(supabaseEmail);
      }
    })();
  }, [devCleanupDone, applySupabaseEmail]);

  const login = useCallback(async (userEmail: string, role: UserRole = 'owner', _organizationId?: string, branchIds: string[] = []) => {
    setEmail(userEmail);
    setIsLoggedIn(true);
    localStorage.setItem('hospitality_user_email', userEmail);
    localStorage.setItem('hospitality_is_logged_in', 'true');
    void fetchIsSuperAdminBounded().then((v) => setIsSuperAdmin(v));
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
    const userPermissions: UserPermissions = {
      role,
      organizationId: organizationId ?? permissions.organizationId ?? '',
      branchIds: role === 'owner' || role === 'admin' ? [] : branchIds,
      email,
    };
    setUserPermissions(userPermissions);
    setPermissions(userPermissions);
  }, [email, permissions.organizationId]);

  const authListenersReady = !isDev || devCleanupDone;

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
      <SessionAuthBridge
        applySupabaseEmail={applySupabaseEmail}
        logout={logout}
        authListenersReady={authListenersReady}
      />
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
