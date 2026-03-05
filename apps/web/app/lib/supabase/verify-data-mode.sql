-- Verification queries for data_mode column
-- Run these after executing add-branch-data-mode.sql

-- 1. Verify column exists and has correct structure
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'branches' 
  AND column_name = 'data_mode';

-- Expected result:
-- column_name: data_mode
-- data_type: text
-- column_default: 'real'
-- is_nullable: NO
-- character_maximum_length: null

-- 2. Check all branches have data_mode set
SELECT 
  id,
  name,
  data_mode,
  CASE 
    WHEN data_mode IS NULL THEN '❌ MISSING'
    WHEN data_mode NOT IN ('real', 'healthy', 'stressed', 'crisis') THEN '❌ INVALID'
    ELSE '✅ OK'
  END as status
FROM branches
ORDER BY name;

-- 3. Count branches by data_mode
SELECT 
  data_mode,
  COUNT(*) as branch_count
FROM branches
GROUP BY data_mode
ORDER BY data_mode;

-- 4. Verify constraint works (should fail)
-- UPDATE branches SET data_mode = 'invalid' WHERE id = (SELECT id FROM branches LIMIT 1);

-- 5. Check daily_metrics count per branch (to see if scenario data exists)
SELECT 
  b.id as branch_id,
  b.name as branch_name,
  b.data_mode,
  COUNT(dm.id) as daily_metrics_count,
  MIN(dm.metric_date) as earliest_date,
  MAX(dm.metric_date) as latest_date
FROM branches b
LEFT JOIN daily_metrics dm ON b.id = dm.branch_id
GROUP BY b.id, b.name, b.data_mode
ORDER BY b.name;

-- Expected for scenario branches:
-- daily_metrics_count: 40 (if scenario was generated)
-- Date range: Last 40 days

-- Expected for real data branches:
-- daily_metrics_count: 0 or actual user-entered count
-- Date range: Varies based on user entries
