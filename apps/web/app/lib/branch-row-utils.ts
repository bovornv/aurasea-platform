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
const ACCOMMODATION_MODULE_TYPES = new Set([
  'accommodation',
  'hotel',
  'hotel_resort',
  'rooms',
  'hotel_with_cafe',
  'resort',
  'boutique_hotel',
  'hostel',
  'villa',
  'lodging',
  'guesthouse',
  'guest_house',
  'apartment',
  'serviced_apartment',
  'motel',
  'inn',
  'property',
]);

const FNB_MODULE_TYPES = new Set(['fnb', 'restaurant', 'cafe', 'cafe_restaurant']);

export function pickBranchModuleType(row: Record<string, unknown>): Branch['moduleType'] {
  const mt = String(row.module_type ?? '').toLowerCase().trim();
  if (!mt) return undefined;
  if (ACCOMMODATION_MODULE_TYPES.has(mt)) return 'accommodation';
  if (FNB_MODULE_TYPES.has(mt)) return 'fnb';
  return undefined;
}

export function pickBranchModuleTypeOrNull(row: Record<string, unknown>): 'accommodation' | 'fnb' | null {
  const v = pickBranchModuleType(row);
  return v === 'accommodation' || v === 'fnb' ? v : null;
}
