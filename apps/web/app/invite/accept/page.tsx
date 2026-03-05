/**
 * Legacy /invite/accept — redirect to canonical /accept-invite?token=...
 */
'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function InviteAcceptRedirectContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      router.replace(`/accept-invite?token=${encodeURIComponent(token)}`);
    } else {
      router.replace('/');
    }
  }, [searchParams, router]);

  return null;
}

export default function InviteAcceptRedirectPage() {
  return (
    <Suspense fallback={null}>
      <InviteAcceptRedirectContent />
    </Suspense>
  );
}
