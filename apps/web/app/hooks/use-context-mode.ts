/**
 * Legacy hook - derives company vs branch from URL only. No viewMode state.
 * For compatibility (e.g. login page). Prefer reading orgId/branchId from useParams().
 */
'use client';

import { usePathname, useParams } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';

export type ContextMode = 'group' | 'branch';

export function useContextMode() {
  const pathname = usePathname() || '';
  const params = useParams();
  const { permissions } = useUserSession();
  const branchId = params?.branchId as string | undefined;
  const mode: ContextMode = pathname.startsWith('/org/') && branchId ? 'branch' : 'group';
  const canSwitchToGroup = permissions.role === 'owner' || permissions.role === 'admin';
  const setContextMode = () => {}; // No-op; navigation is URL-only via view switcher
  return { mode, setContextMode, canSwitchToGroup };
}
