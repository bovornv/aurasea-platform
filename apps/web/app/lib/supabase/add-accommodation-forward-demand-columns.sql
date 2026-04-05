-- Add forward demand and variable cost columns to accommodation_daily_metrics
-- Run: copy-paste into Supabase SQL editor

ALTER TABLE accommodation_daily_metrics
  ADD COLUMN IF NOT EXISTS rooms_on_books_7 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rooms_on_books_14 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_cost_per_room integer NOT NULL DEFAULT 0;

-- Refresh branch_daily_metrics view if it references accommodation_daily_metrics
-- (view is defined elsewhere; no changes needed here — new columns are additive)
