/**
 * Root Content Wrapper - routing is URL-driven (/org/[orgId], /org/[orgId]/branch/[branchId]).
 */

'use client';

import { useRBACValidation } from '../hooks/use-rbac-validation';

export function RootContentWrapper({ children }: { children: React.ReactNode }) {
  useRBACValidation();
  return <>{children}</>;
}
