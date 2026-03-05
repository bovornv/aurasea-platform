-- Add data_mode column to branches table
-- Stores scenario mode for each branch: 'real', 'healthy', 'stressed', or 'crisis'

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS data_mode TEXT DEFAULT 'real' CHECK (data_mode IN ('real', 'healthy', 'stressed', 'crisis'));

-- Update existing branches to 'real' if data_mode is NULL
UPDATE branches 
SET data_mode = 'real' 
WHERE data_mode IS NULL;

-- Make data_mode NOT NULL after setting defaults
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM branches WHERE data_mode IS NULL
  ) THEN
    ALTER TABLE branches ALTER COLUMN data_mode SET NOT NULL;
  END IF;
END $$;
