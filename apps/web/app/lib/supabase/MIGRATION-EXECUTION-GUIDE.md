# Migration Execution Guide - Final Production Schema

## Overview

This guide walks you through executing the migration to the final production architecture.

## Prerequisites

- [ ] Database backup completed
- [ ] Access to Supabase dashboard or PostgreSQL client
- [ ] Code changes deployed (or ready to deploy)
- [ ] Test environment available (recommended)

## Pre-Migration Checklist

- [ ] **Backup Database**: Full database backup
- [ ] **Code Review**: Ensure all code changes are committed
- [ ] **Test Environment**: Run migration on test/staging first
- [ ] **Downtime Window**: Plan maintenance window if needed
- [ ] **Rollback Plan**: Document rollback steps

## Migration Steps

### Step 1: Backup Current Data

```sql
-- Manual backup (if not using automated backup)
CREATE TABLE weekly_metrics_backup AS SELECT * FROM weekly_metrics;
CREATE TABLE fnb_daily_metrics_backup AS SELECT * FROM fnb_daily_metrics;
CREATE TABLE daily_metrics_backup AS SELECT * FROM daily_metrics;
CREATE TABLE branches_backup AS SELECT * FROM branches;
CREATE TABLE organizations_backup AS SELECT * FROM organizations;
```

### Step 2: Run Migration Script

**Option A: Using Supabase Dashboard**
1. Go to SQL Editor
2. Open `migrate-to-final-production-schema.sql`
3. Review the script
4. Execute

**Option B: Using psql**
```bash
psql -h your-db-host -U your-user -d your-database -f migrate-to-final-production-schema.sql
```

**Option C: Using Supabase CLI**
```bash
supabase db reset  # Only for dev/test
# Or apply migration:
supabase migration new migrate_to_final_production_schema
# Copy script content to new migration file
supabase db push
```

### Step 3: Verify Migration

Run these verification queries:

```sql
-- 1. Check organizations have vertical_type
SELECT id, name, vertical_type, 
       CASE WHEN vertical_type IS NULL THEN 'MISSING' ELSE 'OK' END as status
FROM organizations;

-- 2. Check branches have setup fields
SELECT id, name, business_type, 
       rooms_available, monthly_fixed_cost, variable_cost_ratio,
       CASE WHEN business_type IS NULL THEN 'MISSING' ELSE 'OK' END as status
FROM branches LIMIT 10;

-- 3. Check daily_metrics structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
ORDER BY ordinal_position;

-- 4. Verify cost column exists (not actual_cost)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'daily_metrics' 
AND column_name IN ('cost', 'actual_cost');

-- 5. Check data migration from weekly_metrics
SELECT 
  (SELECT COUNT(*) FROM daily_metrics) as daily_count,
  (SELECT COUNT(*) FROM weekly_metrics_backup) as weekly_backup_count,
  (SELECT COUNT(*) FROM weekly_metrics) as weekly_current_count;

-- 6. Check indexes created
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename IN ('organizations', 'branches', 'daily_metrics', 'health_snapshots')
ORDER BY tablename, indexname;

-- 7. Check RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'branches', 'daily_metrics', 'health_snapshots');
```

### Step 4: Test Application

- [ ] Log today's metrics (Staff flow)
- [ ] Update finance data (Owner flow)
- [ ] View branch overview
- [ ] Check alerts generation
- [ ] Verify health score calculation
- [ ] Test trends page

### Step 5: Post-Migration Cleanup (AFTER VERIFICATION)

**Only after confirming everything works:**

```sql
-- Drop legacy tables (CAREFUL - only after verification!)
-- DROP TABLE IF EXISTS weekly_metrics;
-- DROP TABLE IF EXISTS fnb_daily_metrics;

-- Keep backups for 30 days, then:
-- DROP TABLE IF EXISTS weekly_metrics_backup;
-- DROP TABLE IF EXISTS fnb_daily_metrics_backup;
```

## Rollback Procedure

If migration fails or issues are discovered:

### Quick Rollback (if migration script failed mid-execution)

```sql
-- Restore from backups
DROP TABLE IF EXISTS daily_metrics CASCADE;
CREATE TABLE daily_metrics AS SELECT * FROM daily_metrics_backup;

DROP TABLE IF EXISTS branches CASCADE;
CREATE TABLE branches AS SELECT * FROM branches_backup;

DROP TABLE IF EXISTS organizations CASCADE;
CREATE TABLE organizations AS SELECT * FROM organizations_backup;
```

### Partial Rollback (if only specific changes need reverting)

```sql
-- Revert vertical_type constraint
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_vertical_type_check;
ALTER TABLE organizations ALTER COLUMN vertical_type DROP NOT NULL;

-- Revert branches changes
ALTER TABLE branches DROP COLUMN IF EXISTS business_type;
ALTER TABLE branches DROP COLUMN IF EXISTS rooms_available;
-- ... (drop other added columns)

-- Revert daily_metrics changes
ALTER TABLE daily_metrics DROP COLUMN IF EXISTS cost;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS actual_cost NUMERIC;
```

## Common Issues & Solutions

### Issue: "column already exists"
**Solution**: Script uses `IF NOT EXISTS` - safe to ignore or skip that step

### Issue: "constraint already exists"
**Solution**: Script checks for existence first - safe to ignore

### Issue: "cannot alter column because it contains null values"
**Solution**: Script sets defaults first - check if UPDATE ran successfully

### Issue: "foreign key constraint violation"
**Solution**: Check that all branch_ids in daily_metrics exist in branches table

### Issue: "RLS policy already exists"
**Solution**: Script drops and recreates policies - safe to run

## Post-Migration Tasks

- [ ] Update application code to use new schema (already done)
- [ ] Update API documentation
- [ ] Notify team of schema changes
- [ ] Monitor application logs for errors
- [ ] Schedule cleanup of backup tables (30 days)

## Success Criteria

- [x] All tables have correct structure
- [x] All indexes created
- [x] RLS policies applied
- [x] Data migrated successfully
- [x] Application works correctly
- [x] No errors in logs
- [x] Health scores calculate correctly
- [x] Alerts generate correctly

## Support

If you encounter issues:
1. Check migration logs
2. Review verification queries
3. Check application error logs
4. Restore from backup if needed
5. Contact database administrator
