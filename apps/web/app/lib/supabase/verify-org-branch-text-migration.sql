-- ============================================================
-- Verify: organization_id / branch_id UUID → TEXT migration
-- ============================================================
-- Run in Supabase SQL Editor after migration-org-branch-uuid-to-text.sql

-- 1. Column types (should be 'text' / 'character varying')
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_schema = 'public')
  AND (
    (table_name = 'organizations' AND column_name = 'id')
    OR (table_name = 'branches' AND column_name IN ('id', 'organization_id'))
    OR (table_name = 'organization_members' AND column_name = 'organization_id')
    OR (table_name = 'daily_metrics' AND column_name = 'branch_id')
  )
ORDER BY table_name, column_name;

-- 2. Foreign keys on org/branch chain
SELECT tc.constraint_name, tc.table_name, kcu.column_name,
       ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (ccu.table_name IN ('organizations', 'branches') OR kcu.column_name IN ('organization_id', 'branch_id'))
ORDER BY tc.table_name, tc.constraint_name;

-- 3. No sim- branch IDs in branches (optional cleanup check)
SELECT id, name FROM branches WHERE id::text LIKE 'sim-%' LIMIT 5;
-- Expected: 0 rows. If any rows, consider deleting or migrating them.

-- 4. daily_metrics only reference existing branches (integrity check)
SELECT dm.branch_id, COUNT(*) AS rows
FROM daily_metrics dm
LEFT JOIN branches b ON b.id = dm.branch_id
WHERE b.id IS NULL
GROUP BY dm.branch_id;
-- Expected: 0 rows. If any, orphaned daily_metrics exist (fix before or after migration).
