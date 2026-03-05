-- Drop data_mode column from branches table
-- PART 2: Remove simulation data_mode column as part of structural cleanup

-- Drop the column if it exists
ALTER TABLE branches DROP COLUMN IF EXISTS data_mode;

-- Verify column is removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'branches' 
    AND column_name = 'data_mode'
  ) THEN
    RAISE EXCEPTION 'data_mode column still exists after drop attempt';
  ELSE
    RAISE NOTICE '✅ data_mode column successfully removed from branches table';
  END IF;
END $$;
