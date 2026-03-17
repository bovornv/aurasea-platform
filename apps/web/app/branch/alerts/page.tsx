/**
 * Alerts have been moved into the Today page.
 * Redirect to overview (Today) when this route is hit.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';

export default function BranchAlertsRedirectPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();

  useEffect(() => {
    router.replace(paths.branchOverview ?? '/');
  }, [router, paths.branchOverview]);

  return null;
}
