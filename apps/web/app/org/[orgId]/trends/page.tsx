'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * Company Trends route — redirect to company overview (Today).
 * Trends page removed from company (owner) view.
 */
export default function CompanyTrendsRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = params?.orgId as string | undefined;

  useEffect(() => {
    if (orgId) {
      router.replace(`/org/${orgId}/overview`);
    }
  }, [orgId, router]);

  return null;
}
