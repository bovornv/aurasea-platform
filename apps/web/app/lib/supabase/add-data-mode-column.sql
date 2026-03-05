-- Add data_mode column to branches table
-- Stores scenario mode: 'real', 'healthy', 'stressed', or 'crisis'

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS data_mode TEXT DEFAULT 'real' CHECK (data_mode IN ('real', 'healthy', 'stressed', 'crisis'));

-- Update existing branches to 'real' if NULL
UPDATE branches 
SET data_mode = 'real' 
WHERE data_mode IS NULL;
