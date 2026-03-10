/**
 * Single source of truth for Supabase select fields.
 * Do NOT include: city, display_order, updated_at, or columns not in the database.
 */

export const BRANCH_SELECT = `
  id,
  name,
  organization_id,
  sort_order,
  created_at,
  module_type,
  total_rooms,
  accommodation_staff_count,
  fnb_staff_count,
  monthly_fixed_cost
`.replace(/\s+/g, ' ').trim();
