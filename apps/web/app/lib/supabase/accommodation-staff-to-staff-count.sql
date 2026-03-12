-- Rename column in accommodation_daily_metrics: accommodation_staff → staff_count
-- Run this in Supabase SQL editor if your table still has accommodation_staff.
-- Idempotent: only renames when accommodation_staff exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accommodation_daily_metrics'
      AND column_name = 'accommodation_staff'
  ) THEN
    ALTER TABLE accommodation_daily_metrics
      RENAME COLUMN accommodation_staff TO staff_count;
  END IF;
END $$;
