/**
 * Hospitality Route Layout
 * 
 * Allows branch, manager, and owner roles.
 * Scopes data queries by role automatically.
 */

'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { hasRole } from '../lib/auth';
import type { UserRole } from '../services/permissions-service';

export default function HospitalityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { permissions, isLoggedIn } = useUserSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't check if not logged in (RouteGuard handles that)
    if (!isLoggedIn) {
      return;
    }

    const allowedRoles: import('../lib/auth').AllowedRole[] = ['owner', 'admin', 'manager', 'staff'];
    if (!permissions.role || !hasRole(permissions.role as UserRole, allowedRoles)) {
      router.replace('/login');
    }
  }, [permissions.role, isLoggedIn, router, pathname]);

  if (!isLoggedIn) {
    return null;
  }

  const allowed: import('../lib/auth').AllowedRole[] = ['owner', 'admin', 'manager', 'staff'];
  if (!permissions.role || !hasRole(permissions.role as UserRole, allowed)) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
