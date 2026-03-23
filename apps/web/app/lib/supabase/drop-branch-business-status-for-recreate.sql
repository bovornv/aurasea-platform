-- Step 1 — required when replacing the view with a different column list.
-- Use CASCADE if anything else depends on this view (plain DROP may fail).
DROP VIEW IF EXISTS branch_business_status CASCADE;

-- Step 2: run add-branch-performance-signal-and-business-status.sql from the first line
-- (it drops branch_performance_signal, recreates both views, GRANTs).
--
-- Step 3 verify:
--   SELECT * FROM branch_business_status LIMIT 5;
