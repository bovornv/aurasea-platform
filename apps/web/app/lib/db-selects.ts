/**
 * Single source of truth for Supabase select fields on public.branches.
 * - Display name: branch_name (pickBranchDisplayName() also reads legacy `name` on in-memory rows).
 * - Module bucket: module_type when present; never branches.branch_type (not a real column).
 */

export const BRANCH_SELECT = `
  id,
  branch_name,
  organization_id,
  sort_order,
  created_at,
  module_type,
  total_rooms,
  accommodation_staff_count
`.replace(/\s+/g, ' ').trim();
