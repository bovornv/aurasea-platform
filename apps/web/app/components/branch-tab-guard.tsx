/**
 * Branch Tab Guard Component
 * 
 * Prevents access to tabs that are not supported by the current branch's business type.
 * Redirects users to an allowed tab if they try to access an unsupported tab.
 */
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { useOrgBranchPaths } from '../hooks/use-org-branch-paths';
import { ModuleType } from '../models/business-group';

interface BranchTabGuardProps {
  children: React.ReactNode;
  requiredTab: 'hotel' | 'cafe';
}

export function BranchTabGuard({ children, requiredTab }: BranchTabGuardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paths = useOrgBranchPaths();
  const { branch, isLoading } = useCurrentBranch();
  const overviewUrl = paths.branchOverview || '/branch/overview';

  useEffect(() => {
    if (isLoading || !branch) return;

    const canAccessHotelTab = branch.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
    const canAccessCafeTab = branch.modules?.includes(ModuleType.FNB) ?? false;

    if (requiredTab === 'hotel' && !canAccessHotelTab) {
      const params = new URLSearchParams(searchParams.toString());
      if (canAccessCafeTab) {
        params.set('tab', 'cafe');
        router.replace(`${overviewUrl}?${params.toString()}`);
      } else {
        router.replace(overviewUrl);
      }
      return;
    }

    if (requiredTab === 'cafe' && !canAccessCafeTab) {
      const params = new URLSearchParams(searchParams.toString());
      if (canAccessHotelTab) {
        params.set('tab', 'hotel');
        router.replace(`${overviewUrl}?${params.toString()}`);
      } else {
        router.replace(overviewUrl);
      }
      return;
    }
  }, [branch, isLoading, requiredTab, router, searchParams, overviewUrl]);

  // Show loading state while checking branch access
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Don't render children if access is not allowed (will redirect)
  const canAccessHotelTab = branch?.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
  const canAccessCafeTab = branch?.modules?.includes(ModuleType.FNB) ?? false;

  if (requiredTab === 'hotel' && !canAccessHotelTab) {
    return null; // Will redirect
  }

  if (requiredTab === 'cafe' && !canAccessCafeTab) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
