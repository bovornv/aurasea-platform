/**
 * Normalizes public.branches row shapes from Supabase.
 * - Display: prefer branch_name (canonical in current schema); fall back to legacy name.
 * - Module bucket: use module_type only when present. Never read branches.branch_type (column does not exist).
 */
import type { Branch } from '../models/business-group';

export function pickBranchDisplayName(row: Record<string, unknown>): string {
  const raw = row.branch_name ?? row.name;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  return 'Branch';
}

/**
 * UI / routing module bucket from branches.module_type. Undefined if column missing or unknown — do not use for access gates.
 */
export function pickBranchModuleType(row: Record<string, unknown>): Branch['moduleType'] {
  const mt = String(row.module_type ?? '').toLowerCase();
  if (['accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'].includes(mt)) return 'accommodation';
  if (['fnb', 'restaurant', 'cafe', 'cafe_restaurant'].includes(mt)) return 'fnb';
  return undefined;
}

export function pickBranchModuleTypeOrNull(row: Record<string, unknown>): 'accommodation' | 'fnb' | null {
  const v = pickBranchModuleType(row);
  return v === 'accommodation' || v === 'fnb' ? v : null;
}
