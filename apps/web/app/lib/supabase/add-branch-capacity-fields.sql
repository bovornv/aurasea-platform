-- Add capacity and staffing configuration fields to branches table
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS total_rooms integer,
ADD COLUMN IF NOT EXISTS accommodation_staff_count integer;
