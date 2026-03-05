/**
 * Branch Update Data Page
 * 
 * Redirects to the new metrics page
 */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';

export default function BranchUpdatePage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();

  useEffect(() => {
    if (branch?.id && paths.orgId) {
      router.replace(`/org/${paths.orgId}/branch/${branch.id}/metrics`);
    } else {
      router.replace(paths.branchOverview || '/branch/overview');
    }
  }, [branch?.id, paths.orgId, paths.branchOverview, router]);

  return null;
}
