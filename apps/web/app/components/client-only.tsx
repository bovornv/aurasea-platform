'use client';

import { useState, useEffect, type ReactNode } from 'react';

/**
 * Renders children only after mount (client-side). Returns null during SSR.
 * Use to avoid 500s from components that use window/localStorage or other client-only APIs during render.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}
