-- ============================================================
-- VERIFICATION QUERIES - Run after migration
-- ============================================================
-- Copy and run these queries one by one to verify migration

-- 1. Check organizations have vertical_type
SELECT 
  id, 
  name, 
  vertical_type,
  CASE WHEN vertical_type IS NULL THEN '❌ MISSING' ELSE '✅ OK' END as status
FROM organizations;

-- 2. Check branches have setup fields
SELECT 
  id, 
  name, 
  business_type,
  rooms_available, 
  monthly_fixed_cost, 
  variable_cost_ratio,
  CASE 
    WHEN business_type IS NULL THEN '❌ MISSING business_type'
    WHEN rooms_available IS NULL AND monthly_fixed_cost IS NULL THEN '⚠️ Setup fields not populated'
    ELSE '✅ OK'
  END as status
FROM branches 
LIMIT 10;

-- 3. Check daily_metrics structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  CASE 
    WHEN column_name = 'cost' AND is_nullable = 'YES' THEN '✅ OK (nullable)'
    WHEN column_name = 'cost' AND is_nullable = 'NO' THEN '⚠️ Should be nullable'
    WHEN column_name = 'revenue' AND is_nullable = 'NO' THEN '✅ OK (required)'
    ELSE ''
  END as notes
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
ORDER BY ordinal_position;

-- 4. Verify cost column exists (not actual_cost)
SELECT 
  column_name,
  CASE 
    WHEN column_name = 'cost' THEN '✅ OK'
    WHEN column_name = 'actual_cost' THEN '❌ Should be renamed to cost'
    ELSE ''
  END as status
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
AND column_name IN ('cost', 'actual_cost');

-- 5. Check data migration from weekly_metrics
SELECT 
  (SELECT COUNT(*) FROM daily_metrics) as daily_count,
  (SELECT COUNT(*) FROM weekly_metrics_backup WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_metrics_backup')) as weekly_backup_count,
  (SELECT COUNT(*) FROM weekly_metrics WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_metrics')) as weekly_current_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM daily_metrics) > 0 THEN '✅ Has daily data'
    ELSE '⚠️ No daily metrics yet'
  END as status;

-- 6. Check indexes created
SELECT 
  indexname, 
  tablename,
  CASE 
    WHEN indexname LIKE 'idx_%' THEN '✅ OK'
    ELSE ''
  END as status
FROM pg_indexes 
WHERE tablename IN ('organizations', 'branches', 'daily_metrics', 'health_snapshots')
ORDER BY tablename, indexname;

-- 7. Check RLS enabled
SELECT 
  tablename, 
  rowsecurity,
  CASE 
    WHEN rowsecurity = true THEN '✅ RLS Enabled'
    ELSE '❌ RLS Not Enabled'
  END as status
FROM pg_tables 
WHERE tablename IN ('organizations', 'branches', 'daily_metrics', 'health_snapshots')
ORDER BY tablename;

-- 8. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  CASE 
    WHEN policyname IS NOT NULL THEN '✅ Policy exists'
    ELSE '❌ No policy'
  END as status
FROM pg_policies
WHERE tablename IN ('organizations', 'branches', 'daily_metrics', 'health_snapshots')
ORDER BY tablename, policyname;

-- 9. Sample daily_metrics data (if exists)
SELECT 
  branch_id,
  metric_date,
  revenue,
  cost,
  cash_balance,
  rooms_sold,
  customers,
  CASE 
    WHEN revenue IS NULL THEN '❌ Revenue required'
    WHEN revenue > 0 THEN '✅ OK'
    ELSE '⚠️ Zero revenue'
  END as status
FROM daily_metrics
ORDER BY metric_date DESC
LIMIT 10;

-- 10. Check health_snapshots table exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'health_snapshots') 
    THEN '✅ Table exists'
    ELSE '⚠️ Table not created (optional)'
  END as status;
