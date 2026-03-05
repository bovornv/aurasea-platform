-- Migration: Change branch_id from UUID to TEXT to support string IDs
-- Run this in your Supabase SQL Editor

-- Step 1: Drop the foreign key constraint
ALTER TABLE weekly_metrics DROP CONSTRAINT IF EXISTS weekly_metrics_branch_id_fkey;

-- Step 2: Change branch_id column type from UUID to TEXT
ALTER TABLE weekly_metrics ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;

-- Step 3: Change branches.id column type from UUID to TEXT
ALTER TABLE branches ALTER COLUMN id TYPE TEXT;

-- Step 4: Re-add the foreign key constraint
ALTER TABLE weekly_metrics 
  ADD CONSTRAINT weekly_metrics_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
