/**
 * Superadmin detection via platform_admins table.
 * Does not depend on organization_members or branch_members.
 */
'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';

export function usePlatformAdmin(): { isSuperAdmin: boolean; loading: boolean } {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseAvailable()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) {
          setIsSuperAdmin(false);
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from('platform_admins')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setIsSuperAdmin(false);
          setLoading(false);
          return;
        }
        setIsSuperAdmin((data as { role?: string } | null)?.role === 'super_admin');
      } catch {
        if (!cancelled) setIsSuperAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { isSuperAdmin, loading };
}
