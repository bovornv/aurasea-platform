/**
 * Authentication Utilities
 * 
 * Centralized authentication and role checking logic.
 * Used by layouts for route-level access control.
 */

'use client';

import { redirect } from 'next/navigation';
import type { UserRole } from '../services/permissions-service';
import { getUserPermissions } from '../services/permissions-service';

export type AllowedRole = UserRole | 'admin';

/**
 * Check if user has one of the allowed roles
 */
export function hasRole(userRole: UserRole, allowedRoles: AllowedRole[]): boolean {
  // Treat 'admin' as equivalent to 'owner' for now
  const normalizedAllowed = allowedRoles.map(r => r === 'admin' ? 'owner' : r) as UserRole[];
  return normalizedAllowed.includes(userRole);
}

/**
 * Get current user role from session
 * Returns null if not logged in
 */
export function getCurrentUserRole(): UserRole | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const email = localStorage.getItem('hospitality_user_email');
    if (!email) return null;
    
    const permissions = getUserPermissions(email);
    return permissions.role || null;
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const email = localStorage.getItem('hospitality_user_email');
    const isLoggedIn = localStorage.getItem('hospitality_is_logged_in');
    return email !== null && isLoggedIn === 'true';
  } catch {
    return false;
  }
}

/**
 * Require authentication - redirects to login if not authenticated
 */
export function requireAuth(): void {
  if (!isAuthenticated()) {
    redirect('/login');
  }
}

/**
 * Require role - redirects if user doesn't have required role
 */
export function requireRole(allowedRoles: AllowedRole[], redirectTo: string = '/hospitality'): void {
  requireAuth();
  
  const userRole = getCurrentUserRole();
  if (!userRole || !hasRole(userRole, allowedRoles)) {
    redirect(redirectTo);
  }
}
