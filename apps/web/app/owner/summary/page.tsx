/**
 * Legacy Owner Summary Route Redirect
 * 
 * Redirects /owner/summary to the new group overview route
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserSession } from '../../contexts/user-session-context';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';

export default function OwnerSummaryRedirectPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();

  useEffect(() => {
    router.replace(paths.companyOverview || '/group/overview');
  }, [router, paths.companyOverview]);

  return null;
}
