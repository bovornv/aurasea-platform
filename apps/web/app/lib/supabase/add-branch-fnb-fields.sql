-- Add F&B finance/capacity fields to branches table (for F&B Log Today first-setup and persistence)
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS fnb_staff_count integer,
ADD COLUMN IF NOT EXISTS monthly_fixed_cost numeric;
