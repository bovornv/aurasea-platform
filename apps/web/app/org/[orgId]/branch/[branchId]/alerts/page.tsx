'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * Alerts have been moved into the Today page.
 * Redirect /alerts to /overview (Today).
 */
export default function AlertsRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchId = params?.branchId as string | undefined;

  useEffect(() => {
    if (orgId && branchId) {
      router.replace(`/org/${orgId}/branch/${branchId}/overview`);
    }
  }, [orgId, branchId, router]);

  return null;
}
