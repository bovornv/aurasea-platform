-- Add module_type to branches. Single value determines Log Today form: 'accommodation' | 'fnb'.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS module_type TEXT;

-- Set default for existing rows (no has_accommodation/has_fnb columns)
UPDATE branches SET module_type = 'fnb' WHERE module_type IS NULL;
