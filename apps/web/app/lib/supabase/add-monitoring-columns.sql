-- Add monitoring configuration columns to branches table
-- - monitoring_enabled: boolean (default true)
-- - alert_sensitivity: TEXT ('low' | 'medium' | 'high', default 'medium')

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS alert_sensitivity TEXT DEFAULT 'medium' CHECK (alert_sensitivity IN ('low', 'medium', 'high'));

-- Update existing branches to have monitoring enabled by default
UPDATE branches 
SET monitoring_enabled = TRUE 
WHERE monitoring_enabled IS NULL;

-- Update existing branches to have medium sensitivity by default
UPDATE branches 
SET alert_sensitivity = 'medium' 
WHERE alert_sensitivity IS NULL;
