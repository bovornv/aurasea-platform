/**
 * Legacy Hospitality Route Redirect
 * 
 * Redirects /hospitality to the new branch overview route
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { useOrgBranchPaths } from '../hooks/use-org-branch-paths';

export default function HospitalityRedirectPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { permissions } = useUserSession();

  useEffect(() => {
    if (permissions.role === 'owner' || permissions.role === 'admin') {
      router.replace(paths.companyOverview || '/group/overview');
    } else {
      router.replace(paths.branchOverview || '/branch/overview');
    }
  }, [router, permissions.role, paths.companyOverview, paths.branchOverview]);

  return null;
}
