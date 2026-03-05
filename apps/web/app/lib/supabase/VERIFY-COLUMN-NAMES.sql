-- Verification Query: Check current column names
-- Run this to see what columns exist in your tables

-- Check daily_metrics table columns
SELECT 
  'daily_metrics' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check fnb_daily_metrics table columns
SELECT 
  'fnb_daily_metrics' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'fnb_daily_metrics' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check for both 'date' and 'metric_date' columns
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_name IN ('daily_metrics', 'fnb_daily_metrics')
  AND column_name IN ('date', 'metric_date')
  AND table_schema = 'public'
ORDER BY table_name, column_name;
