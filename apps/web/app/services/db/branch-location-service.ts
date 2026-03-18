/**
 * Update branch location in Supabase (zip_code, province, city).
 * Payload is cleaned: only non-empty, valid columns are sent.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { isValidThaiZip } from '../../utils/thai-zip-province';

export interface BranchLocationUpdate {
  zip_code?: string | null;
  province?: string | null;
  city?: string | null;
}

/**
 * Build PATCH payload with only valid, non-empty fields (snake_case for DB).
 * Does NOT include undefined, null, or empty string.
 */
export function buildBranchLocationPayload(params: {
  zipCode?: string | null;
  province?: string | null;
  city?: string | null;
}): Record<string, string> {
  const payload: Record<string, string> = {};
  if (params.zipCode != null && String(params.zipCode).trim() !== '') {
    payload.zip_code = String(params.zipCode).trim();
  }
  if (params.province != null && String(params.province).trim() !== '') {
    payload.province = String(params.province).trim();
  }
  if (params.city != null && String(params.city).trim() !== '') {
    payload.city = String(params.city).trim();
  }
  return payload;
}

/**
 * Update branch location in Supabase. Validates zip_code before PATCH (must be valid 5-digit Thai ZIP if provided).
 * Only sends zip_code, province, city; omits empty/undefined.
 */
export async function updateBranchLocationInSupabase(
  branchId: string,
  params: { zipCode?: string | null; province?: string | null; city?: string | null }
): Promise<{ success: boolean; error?: string }> {
  if (!branchId) {
    return { success: false, error: 'Branch ID is required' };
  }

  if (params.zipCode != null && String(params.zipCode).trim() !== '') {
    const zip = String(params.zipCode).trim();
    if (!isValidThaiZip(zip)) {
      return { success: false, error: 'Invalid ZIP code' };
    }
  }

  const payload = buildBranchLocationPayload(params);
  if (Object.keys(payload).length === 0) {
    return { success: true };
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('PATCH payload:', payload);
  }

  if (!isSupabaseAvailable()) {
    return { success: true };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('branches')
      .update(payload as never)
      .eq('id', branchId);

    if (error) {
      console.error('[BranchLocation] PATCH error:', error.message);
      if ((error as any).details) console.error('[BranchLocation] details:', (error as any).details);
      if ((error as any).hint) console.error('[BranchLocation] hint:', (error as any).hint);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[BranchLocation] PATCH failed:', err?.message, err?.details, err?.hint);
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}
