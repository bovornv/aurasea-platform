-- Ensure branches table has has_accommodation and has_fnb for frontend compatibility.
-- Frontend selects: id, name, has_accommodation, has_fnb
-- Default true so branch context and OwnerSummary load without 400s.

-- Add columns if missing (e.g. older DBs created before these columns)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS has_accommodation BOOLEAN DEFAULT true;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS has_fnb BOOLEAN DEFAULT true;

-- Set default to true for new rows (no-op if already true)
ALTER TABLE branches ALTER COLUMN has_accommodation SET DEFAULT true;
ALTER TABLE branches ALTER COLUMN has_fnb SET DEFAULT true;

-- Backfill existing rows where NULL
UPDATE branches SET has_accommodation = true WHERE has_accommodation IS NULL;
UPDATE branches SET has_fnb = true WHERE has_fnb IS NULL;
